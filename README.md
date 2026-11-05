# Mini-KI-Roboter für ca. 40 €

Ein fahrender, sprechender, zuhörender Roboter. Akkubetrieben und kabellos.
Das **Gehirn** (Spracherkennung + KI + Sprachausgabe) läuft auf deinem PC/Laptop/Raspberry Pi
im WLAN. Der Roboter selbst ist der "Körper": Ohren, Mund, Räder, Abstandssinn.

> Warum nicht alles auf dem Roboter? Ein ESP32 (5–8 €) kann kein Sprachmodell ausführen.
> Mit der Auslagerung bleibt der Roboter billig und das Gehirn kann beliebig schlau sein.

```
 Mikrofon ─┐                                   ┌─ Whisper (Sprache → Text)
 Ultraschall ─► ESP32-S3 ══ WLAN/WebSocket ══► PC ─ Claude (denkt, steuert per Tool)
 Lautsprecher ◄─┘  Motoren ◄──────────────────┘   └─ edge-tts (Text → Sprache)
```

## Einkaufsliste (AliExpress/Amazon, Preise ca.)

| Teil | Zweck | ca. € |
|---|---|---|
| ESP32-S3 DevKitC (N16R8) | Controller mit WLAN | 8,00 |
| INMP441 I2S-Mikrofon | Ohren | 3,00 |
| MAX98357A I2S-Verstärker | Mund | 2,00 |
| Lautsprecher 3 W / 4 Ω, ~28 mm | Mund | 1,50 |
| DRV8833 Motortreiber | Räder | 1,50 |
| 2× N20-Getriebemotor 6 V (~200 U/min) mit Rädern | Antrieb | 6,00 |
| Stützrad (Kugelrolle / Metallkugel) | Balance | 1,00 |
| HC-SR04 Ultraschallsensor | Hinderniserkennung | 1,50 |
| 18650 Li-Ion-Akku (z. B. gebraucht aus altem Laptop = 0 €) | Strom | 4,00 |
| 18650-Halter + TP4056-Lademodul (USB-C) | Laden | 2,50 |
| MT3608 Step-up (auf 5 V einstellen) | 5 V für ESP32 | 1,00 |
| Schalter, Jumperkabel, Widerstände (1 kΩ + 2 kΩ), Kondensator 470 µF | Kleinkram | 3,00 |
| Chassis: Pappe/Holz/3D-Druck/Tupperdose + Heißkleber | Körper | 0–3 |
| **Summe** | | **≈ 35–40 €** |

Optional (+6 €): **OV2640-Kamera** statt/zusätzlich zum Ultraschall, wenn der Roboter "sehen" soll
(nimm dann ein ESP32-S3-CAM-Board und passe die Pins an; Bilder könntest du an Claude schicken).

## Verkabelung

Akku-Plus → Schalter → TP4056/MT3608. Alle Massen (GND) verbinden.

| Bauteil | Pin am Bauteil | ESP32-S3 |
|---|---|---|
| INMP441 | VDD / GND | 3V3 / GND |
| | SCK / WS / SD | GPIO 4 / 5 / 6 |
| | L/R | GND |
| MAX98357A | VIN / GND | 5V / GND |
| | BCLK / LRC / DIN | GPIO 15 / 16 / 17 |
| DRV8833 | VM | Akku+ (direkt, 3,7–4,2 V) |
| | AIN1 / AIN2 | GPIO 8 / 9 (linker Motor) |
| | BIN1 / BIN2 | GPIO 10 / 11 (rechter Motor) |
| | SLEEP/EEP | 3V3 |
| HC-SR04 | VCC / GND | 5V / GND |
| | TRIG | GPIO 12 |
| | ECHO | GPIO 13 **über Spannungsteiler** (ECHO → 1 kΩ → GPIO13 → 2 kΩ → GND) |

Tipps: 470 µF Kondensator über VM/GND am Motortreiber (verhindert Reset durch Motorstrom).
MT3608 vorher mit Multimeter auf 5,0 V einstellen, *bevor* der ESP32 dranhängt.
Läuft ein Motor falsch herum: in `robot.ino` `AIN1`/`AIN2` tauschen.

## Aufbau in 5 Schritten

1. **Server starten** (PC, siehe unten) und IP-Adresse notieren.
2. **ESP32 flashen**: Arduino IDE, ESP32-Core 2.0.x, Bibliotheken `WebSockets` (Markus Sattler) und `ArduinoJson`.
   Board "ESP32S3 Dev Module", PSRAM "OPI PSRAM". In `robot.ino` WLAN-Daten + Server-IP eintragen.
3. **Erst ohne Motoren testen** (nur Mikrofon + Lautsprecher): Sprich — er antwortet.
4. Motoren anschließen, mit angehobenen Rädern testen.
5. Alles aufs Chassis kleben, Akku rein, Schalter an.

## Server (das Gehirn)

```bash
cd server
pip install -r requirements.txt
sudo apt install ffmpeg        # bzw. brew install ffmpeg
export ANTHROPIC_API_KEY=sk-ant-...
python server.py
```

Kosten: Whisper (lokal) und edge-tts sind kostenlos. Claude Haiku kostet bei normaler
Unterhaltung nur Cent-Beträge. Wer 100 % kostenlos/offline will: `ollama` statt Claude
(in `server.py` ersetzbar).

## Was der Roboter kann

- **Hören:** erkennt Sprache per Lautstärke-Schwelle, schickt sie an den Server.
- **Denken:** Claude bekommt Text + aktuellen Abstand und entscheidet, was er sagt und ob er fährt.
- **Sprechen:** Antwort kommt als Audio zurück.
- **Fahren:** "fahr vor", "dreh dich um", "komm näher" … Tool `drive`.
- **Sicherheit:** Stoppt selbst (auf dem ESP32, ohne WLAN-Verzögerung) bei < 15 cm Hindernis.

## Ehrlicher Hinweis

Ich konnte die Hardware hier nicht testen. Der Code ist sauber geschrieben, aber rechne mit etwas
Feintuning: Mikrofon-Schwelle (`VOICE_THRESHOLD`), Lautstärke und Fahrtgeschwindigkeit.
Wenn etwas nicht klappt, schick mir die Serial-Monitor-Ausgabe, dann debuggen wir.

## Ausbauideen

Kamera (+6 €), Servo als Kopf, LEDs als Augen, Wake-Word ("Hey Robo"), Akku-Anzeige.

---

# Körper (3D-Druck)

Alle Teile sind parametrisch in `cad/` konstruiert und als STL in `cad/stl/` abgelegt.
Neu erzeugen nach Änderungen an Maßen (`cad/parts.mjs`, Node.js, keine Abhängigkeiten):

```bash
cd cad && node build.mjs && node web.mjs
```

**3D-Ansicht im Browser:** `web/index.html` öffnen (drehen, zoomen, Explosionsansicht, Gehäuse durchsichtig).

## Druckteile

| Datei | Stück | Lage | Hinweis |
|---|---|---|---|
| `chassis.stl` | 1 | wie exportiert (Platte unten) | 0,2 mm, 3 Wände, 20 % Infill, keine Stützen |
| `torso.stl` | 1 | wie exportiert (kopfüber) | 0,2 mm, 3 Wände, 15 % Infill |
| `kopf.stl` | 1 | wie exportiert (kopfüber) | 0,16 mm, 3 Wände, 15 % Infill |
| `rad.stl` | 2 | flach | PETG/PLA, optional Gummiband als Reifen |
| `stuetzfuss.stl` | 1 | stehend | Zapfen kleben, glatte Kuppe, PETG rutscht gut |

Gesamt ca. 100 g Filament. Maße: 130 × 92 × 91 mm (mit Rädern 131 mm breit).

## Zusammenbau

1. **Chassis:** N20-Motoren von innen in die Tunnel schieben (Welle zeigt nach außen), mit einem Tropfen Heißkleber sichern. Stützfuß einkleben.
2. **Elektronik** in die Eck-Halter drücken: TP4056 (hinten, USB nach hinten), MT3608 (links vorne), DRV8833 und MAX98357A (rechts), 18650-Halter in die Wanne mit Kabelbindern durch die Schlitze.
3. **Verkabeln** wie oben. Kabel für Kopf (ESP32, Ultraschall, Mikrofon) bleiben lang genug für den Durchlass in der Torso-Decke.
4. **Torso** aufsetzen, Lautsprecher in den Ring unter der Decke kleben. Von unten vier M2 × 8 Schrauben durch die Chassis-Platte in die Säulen drehen (selbstschneidend).
5. **Kopf:** ESP32 senkrecht in die beiden Gabeln schieben (USB-Buchsen zeigen zur Seite mit der Öffnung), HC-SR04 zwischen die Anschläge, Augen durch die Löcher. Mikrofon in die Tasche an der Decke (Öffnung nach oben). Kopf aufsetzen, von innen mit vier M2 × 8 Schrauben durch die Torso-Decke befestigen.
6. Räder auf die Wellen drücken (D-Bohrung), Schalter in das Loch in der Rückwand.

## Wichtig: Maße der Module prüfen

Billige Module weichen oft um 1-2 mm ab. Vor dem Druck mit dem Messschieber prüfen und in
`cad/parts.mjs` unter `P.mods`, `P.motor` und `P.speaker` anpassen. Die Halter haben 0,3 mm Spiel.
Der STL-Export ist per Boolean-Operation erzeugt; moderne Slicer (Cura, Prusa, Bambu) reparieren
Kleinigkeiten automatisch. Der Körper wurde nur digital geprüft, noch nicht gedruckt: Rechne mit einem
Probedruck des Chassis und Anpassungen bei den Passungen (Motor-Tunnel, Radbohrung).
