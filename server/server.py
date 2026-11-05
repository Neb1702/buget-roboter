"""Gehirn des Roboters: WebSocket-Server.
ESP32 -> Server: Text {"type":"start"|"end"|"dist","cm":..} und Binär-Audio (16 kHz, 16 bit, mono)
Server -> ESP32: Binär-Audio zum Abspielen, {"type":"audio_end"}, {"type":"drive","dir":..,"ms":..}
"""
import asyncio, json, subprocess, tempfile, os
import numpy as np
import websockets, edge_tts
from anthropic import AsyncAnthropic
from faster_whisper import WhisperModel

MODEL = "claude-haiku-5-5"
VOICE = "de-DE-KatjaNeural"
SYSTEM = (
    "Du bist ein kleiner, neugieriger Roboter auf zwei Rädern (Name: Robo). "
    "Antworte immer auf Deutsch, in 1-2 kurzen Sätzen, ohne Sonderzeichen oder Emojis, "
    "da deine Antwort vorgelesen wird. Wenn der Nutzer dich bewegen will, nutze das Tool 'drive'. "
    "Du bekommst den aktuellen Abstand zum Hindernis vor dir in cm."
)
TOOLS = [{
    "name": "drive",
    "description": "Roboter fahren lassen. 'left'/'right' drehen auf der Stelle (ca. 90 Grad pro 450 ms).",
    "input_schema": {"type": "object", "properties": {
        "dir": {"type": "string", "enum": ["forward", "back", "left", "right"]},
        "ms": {"type": "integer", "minimum": 100, "maximum": 3000}},
        "required": ["dir", "ms"]},
}]

stt = WhisperModel("base", compute_type="int8")
client = AsyncAnthropic()


def transcribe(pcm: bytes) -> str:
    audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
    segs, _ = stt.transcribe(audio, language="de", vad_filter=True)
    return " ".join(s.text for s in segs).strip()


async def tts_pcm(text: str) -> bytes:
    with tempfile.TemporaryDirectory() as d:
        mp3 = os.path.join(d, "o.mp3")
        await edge_tts.Communicate(text, VOICE).save(mp3)
        return subprocess.run(
            ["ffmpeg", "-loglevel", "quiet", "-i", mp3, "-f", "s16le", "-ar", "16000", "-ac", "1", "-"],
            capture_output=True, check=True).stdout


async def handle(ws):
    print("Roboter verbunden")
    history, buf, dist = [], bytearray(), 999
    async for msg in ws:
        if isinstance(msg, bytes):
            buf.extend(msg)
            continue
        m = json.loads(msg)
        if m["type"] == "dist":
            dist = m["cm"]
        elif m["type"] == "start":
            buf.clear()
        elif m["type"] == "end":
            pcm = bytes(buf); buf.clear()
            text = await asyncio.to_thread(transcribe, pcm)
            print("Gehört:", text)
            if len(text) < 2:
                await ws.send(json.dumps({"type": "audio_end"}))
                continue
            history.append({"role": "user", "content": f"[Abstand vorne: {dist} cm] {text}"})
            r = await client.messages.create(model=MODEL, max_tokens=300, system=SYSTEM,
                                             tools=TOOLS, messages=history[-12:])
            history.append({"role": "assistant", "content": r.content})
            reply, results = "", []
            for b in r.content:
                if b.type == "text":
                    reply += b.text
                elif b.type == "tool_use":
                    await ws.send(json.dumps({"type": "drive", **b.input}))
                    results.append({"type": "tool_result", "tool_use_id": b.id, "content": "ok"})
            if results:  # Tool-Ergebnis zurückmelden, damit der Verlauf gültig bleibt
                history.append({"role": "user", "content": results})
            reply = reply.strip() or "Okay."
            print("Antwort:", reply)
            pcm_out = await tts_pcm(reply)
            for i in range(0, len(pcm_out), 4096):
                await ws.send(pcm_out[i:i + 4096])
            await ws.send(json.dumps({"type": "audio_end"}))


async def main():
    async with websockets.serve(handle, "0.0.0.0", 8765, max_size=2**22):
        print("Server läuft auf Port 8765")
        await asyncio.Future()

asyncio.run(main())
