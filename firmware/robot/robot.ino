// Mini-KI-Roboter (ESP32-S3). Bibliotheken: WebSockets (Markus Sattler), ArduinoJson. ESP32-Core 2.0.x
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "driver/i2s.h"

// ===== EINSTELLUNGEN =====
const char* WIFI_SSID = "DEIN_WLAN";
const char* WIFI_PASS = "DEIN_PASSWORT";
const char* SERVER_IP = "192.168.178.50";   // IP deines PCs
const int   SERVER_PORT = 8765;
const int   VOICE_THRESHOLD = 600;          // Mikrofon-Empfindlichkeit (kleiner = empfindlicher)
const int   STOP_DISTANCE_CM = 15;
const int   SPEED = 200;                    // 0-255
// ===== PINS =====
#define MIC_SCK 4
#define MIC_WS 5
#define MIC_SD 6
#define SPK_BCLK 15
#define SPK_LRC 16
#define SPK_DIN 17
#define AIN1 8
#define AIN2 9
#define BIN1 10
#define BIN2 11
#define TRIG 12
#define ECHO 13

#define SR 16000
#define MIC_PORT I2S_NUM_0
#define SPK_PORT I2S_NUM_1

WebSocketsClient ws;
enum State { LISTENING, RECORDING, WAITING, SPEAKING } state = LISTENING;
unsigned long lastVoice = 0, recStart = 0, driveUntil = 0, lastDist = 0, speakEnd = 0;
int driveDir = 0;   // 0 stop, 1 vor, 2 zurück, 3 links, 4 rechts
long distCm = 999;

void motor(int a1, int a2, int b1, int b2) {
  analogWrite(AIN1, a1); analogWrite(AIN2, a2);
  analogWrite(BIN1, b1); analogWrite(BIN2, b2);
}
void applyDrive() {
  switch (driveDir) {
    case 1: motor(SPEED, 0, SPEED, 0); break;
    case 2: motor(0, SPEED, 0, SPEED); break;
    case 3: motor(0, SPEED, SPEED, 0); break;
    case 4: motor(SPEED, 0, 0, SPEED); break;
    default: motor(0, 0, 0, 0);
  }
}
long readDistance() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  long d = pulseIn(ECHO, HIGH, 25000);
  return d == 0 ? 999 : d / 58;
}

void i2sInit() {
  i2s_config_t rx = {};
  rx.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  rx.sample_rate = SR; rx.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  rx.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  rx.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  rx.dma_buf_count = 8; rx.dma_buf_len = 256; rx.intr_alloc_flags = 0;
  i2s_pin_config_t rxp = {I2S_PIN_NO_CHANGE, MIC_SCK, MIC_WS, I2S_PIN_NO_CHANGE, MIC_SD};
  i2s_driver_install(MIC_PORT, &rx, 0, NULL); i2s_set_pin(MIC_PORT, &rxp);

  i2s_config_t tx = rx;
  tx.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  tx.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  tx.tx_desc_auto_clear = true;
  i2s_pin_config_t txp = {SPK_BCLK, SPK_LRC, SPK_DIN, I2S_PIN_NO_CHANGE, I2S_PIN_NO_CHANGE};
  txp.mck_io_num = I2S_PIN_NO_CHANGE;
  i2s_driver_install(SPK_PORT, &tx, 0, NULL); i2s_set_pin(SPK_PORT, &txp);
}

void onWs(WStype_t type, uint8_t* p, size_t len) {
  if (type == WStype_CONNECTED) Serial.println("Mit Server verbunden");
  else if (type == WStype_BIN) {
    state = SPEAKING;
    size_t w; i2s_write(SPK_PORT, p, len, &w, portMAX_DELAY);
  } else if (type == WStype_TEXT) {
    JsonDocument d; if (deserializeJson(d, p, len)) return;
    String t = d["type"] | "";
    if (t == "audio_end") { state = SPEAKING; speakEnd = millis(); }
    else if (t == "drive") {
      String dir = d["dir"] | "";
      driveDir = dir == "forward" ? 1 : dir == "back" ? 2 : dir == "left" ? 3 : dir == "right" ? 4 : 0;
      driveUntil = millis() + (int)(d["ms"] | 500);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  int m[] = {AIN1, AIN2, BIN1, BIN2}; for (int pin : m) pinMode(pin, OUTPUT);
  motor(0, 0, 0, 0);
  i2sInit();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println(WiFi.localIP());
  ws.begin(SERVER_IP, SERVER_PORT, "/");
  ws.onEvent(onWs);
  ws.setReconnectInterval(2000);
}

void loop() {
  ws.loop();

  // Abstand messen, melden, Notbremse
  if (millis() - lastDist > 150) {
    lastDist = millis();
    distCm = readDistance();
    if (ws.isConnected()) { char b[40]; snprintf(b, 40, "{\"type\":\"dist\",\"cm\":%ld}", distCm); ws.sendTXT(b); }
  }
  if (driveDir && (millis() > driveUntil || (driveDir == 1 && distCm < STOP_DISTANCE_CM))) driveDir = 0;
  applyDrive();

  // Nach dem Sprechen kurz warten (Echo vermeiden), dann wieder zuhören
  if (state == SPEAKING && speakEnd && millis() - speakEnd > 600) { state = LISTENING; speakEnd = 0; }
  if (state == SPEAKING || state == WAITING) { if (state == WAITING && millis() - recStart > 20000) state = LISTENING; return; }

  // Mikrofon lesen
  static int32_t raw[256]; static int16_t pcm[256];
  size_t n = 0;
  i2s_read(MIC_PORT, raw, sizeof(raw), &n, 20);
  int cnt = n / 4; if (!cnt) return;
  long sum = 0;
  for (int i = 0; i < cnt; i++) { pcm[i] = raw[i] >> 14; sum += abs(pcm[i]); }
  int level = sum / cnt;

  if (state == LISTENING && level > VOICE_THRESHOLD && ws.isConnected()) {
    state = RECORDING; recStart = millis(); lastVoice = millis();
    ws.sendTXT("{\"type\":\"start\"}");
  }
  if (state == RECORDING) {
    ws.sendBIN((uint8_t*)pcm, cnt * 2);
    if (level > VOICE_THRESHOLD) lastVoice = millis();
    if (millis() - lastVoice > 800 || millis() - recStart > 8000) {
      ws.sendTXT("{\"type\":\"end\"}");
      state = WAITING; recStart = millis();
    }
  }
}
