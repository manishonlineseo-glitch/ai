"""Call runner: Jarvis phones the leads of an active campaign through Windows Phone Link (the office phone's SIM) and talks to them.

How the audio flows (one free virtual cable, e.g. VB-Cable, is enough):
  - what the other person says plays on the laptop speakers -> recorded here with WASAPI loopback,
  - what Jarvis says is played into the virtual cable's input; Phone Link's microphone (Windows default communications input)
    is the cable's output, so the other person hears Jarvis.
Each turn: recorded speech -> server (speech to text) -> server (call agent decides the reply, script + memory + rules) -> server (text to speech) -> cable.
The server decides everything about WHAT to say (always opens as an AI assistant, honours do-not-call and calling hours); this file only moves audio.
"""
import base64
import io
import json
import math
import os
import subprocess
import time
import wave

import ops

SPEAKER_NAME = os.environ.get("JARVIS_CALL_SPEAKER", "")  # the output Phone Link plays the caller on (default speakers if empty)
CABLE_NAME = os.environ.get("JARVIS_CALL_CABLE", "CABLE Input")  # where Jarvis' voice goes
SAMPLE_RATE = 16000


def _sc():
    import soundcard as sc  # optional: only needed for real calls
    return sc


def find_cable():
    sc = _sc()
    for sp in sc.all_speakers():
        if CABLE_NAME.lower() in sp.name.lower():
            return sp
    raise LookupError(f"Virtual cable ('{CABLE_NAME}') nahi mila. VB-Cable install karo aur Phone Link ka mic uska Output rakho.")


def find_loopback():
    sc = _sc()
    sp = None
    if SPEAKER_NAME:
        sp = next((s for s in sc.all_speakers() if SPEAKER_NAME.lower() in s.name.lower()), None)
    sp = sp or sc.default_speaker()
    return sc.get_microphone(sp.name, include_loopback=True)


def to_wav(samples):
    """float32 mono numpy -> 16 kHz 16-bit WAV bytes"""
    import numpy as np
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def listen_utterance(mic, max_wait=25.0, max_len=14.0, silence_end=0.9, threshold=0.012):
    """Wait for the other person to speak, record until they pause. Returns WAV bytes or None (nobody spoke)."""
    import numpy as np
    frames, speaking, last_voice, start = [], False, 0.0, time.time()
    with mic.recorder(samplerate=SAMPLE_RATE, channels=1, blocksize=1600) as rec:
        while True:
            data = rec.record(numframes=1600)[:, 0]  # 0.1 s
            level = float(np.sqrt(np.mean(data ** 2)))
            now = time.time()
            if level > threshold:
                speaking, last_voice = True, now
            if speaking:
                frames.append(data)
                if now - last_voice > silence_end or now - start > max_len + max_wait:
                    break
                if sum(len(f) for f in frames) / SAMPLE_RATE > max_len:
                    break
            elif now - start > max_wait:
                return None
    audio = np.concatenate(frames)
    return to_wav(audio) if len(audio) / SAMPLE_RATE > 0.4 else None


def speak_pcm(speaker, pcm24k_b64):
    import numpy as np
    pcm = np.frombuffer(base64.b64decode(pcm24k_b64), dtype="<i2").astype("float32") / 32768.0
    speaker.play(pcm, samplerate=24000)


# ------------------------------------------------------------------ Phone Link
def open_phone_link():
    subprocess.Popen(["explorer.exe", r"shell:AppsFolder\Microsoft.YourPhone_8wekyb3d8bbwe!App"])
    time.sleep(4)


def dial(number):
    """Phone Link > Calls > type the number > Call. Names are matched by text; if Phone Link's wording differs, the error shows what is on screen."""
    import uiautomation as auto
    import agent

    open_phone_link()
    agent.focus_window("Phone Link")
    time.sleep(1)
    with auto.UIAutomationInitializerInThread():
        win = auto.WindowControl(searchDepth=1, SubName="Phone Link")
        if not win.Exists(5, 0.5):
            raise LookupError("Phone Link window nahi mili")
        for name in ("Calls", "Call"):  # the left menu item
            c = win.Control(searchDepth=14, SubName=name)
            if c.Exists(2, 0.3) and c.ControlTypeName in ("ListItemControl", "TabItemControl", "ButtonControl"):
                c.Click()
                break
        time.sleep(1.2)
        box = win.EditControl(searchDepth=14)
        if not box.Exists(4, 0.4):
            _, text = agent.read_window_text("Phone Link", max_chars=800, budget_seconds=6)
            raise LookupError("Phone Link me number ka box nahi mila. Screen par ye hai: " + text[:400])
        box.Click()
        auto.SetClipboardText(number)
        auto.SendKeys("{Ctrl}a{Ctrl}v", waitTime=0.2)
        time.sleep(0.4)
        call_btn = win.ButtonControl(searchDepth=14, SubName="Call")
        if call_btn.Exists(3, 0.3):
            call_btn.Click()
        else:
            auto.SendKeys("{Enter}", waitTime=0.2)
    time.sleep(2)


def call_active():
    """True while Phone Link shows an End call / hang up button."""
    import uiautomation as auto
    with auto.UIAutomationInitializerInThread():
        win = auto.WindowControl(searchDepth=1, SubName="Phone Link")
        if not win.Exists(1, 0.2):
            return False
        for name in ("End call", "Hang up", "End"):
            if win.ButtonControl(searchDepth=14, SubName=name).Exists(0.8, 0.2):
                return True
    return False


def hang_up():
    import uiautomation as auto
    with auto.UIAutomationInitializerInThread():
        win = auto.WindowControl(searchDepth=1, SubName="Phone Link")
        for name in ("End call", "Hang up", "End"):
            b = win.ButtonControl(searchDepth=14, SubName=name)
            if b.Exists(1, 0.2):
                b.Click()
                return


# ------------------------------------------------------------------ one call, many calls
def api(path, payload, timeout=90):
    s, base = ops.CTX["session"], ops.CTX["base"]
    r = s.post(base + path, json=payload, timeout=timeout)
    if r.status_code != 200:
        raise RuntimeError(f"{path}: {r.status_code} {r.text[:160]}")
    return r.json()


def run_call(lead, voice="Kore", max_turns=40):
    """Dial, hold the conversation, hang up, report. Returns the server's summary."""
    cable, mic = find_cable(), find_loopback()
    transcript, started = [], time.time()
    outcome, notes = "", ""
    dial(lead["phone"])
    # wait for the other side to pick up: first speech on the line (or give up after ~45 s)
    first = listen_utterance(mic, max_wait=45)
    if first is None or not call_active():
        hang_up()
        return api("call_done", {"lead_id": lead["id"], "transcript": [], "seconds": int(time.time() - started), "outcome": "no_answer"})
    heard = api("call_listen", {"wav": base64.b64encode(first).decode()})["text"]
    if heard:
        transcript.append({"who": "lead", "text": heard})
    turn = api("call_turn", {"lead_id": lead["id"], "transcript": [], "said": heard})  # the fixed AI-assistant opening
    for _ in range(max_turns):
        transcript.append({"who": "agent", "text": turn["say"]})
        speak_pcm(cable, api("call_speak", {"text": turn["say"], "voice": voice})["pcm"])
        outcome = turn.get("outcome") or outcome
        notes = turn.get("notes") or notes
        if turn.get("end") or not call_active():
            break
        wav = listen_utterance(mic)
        if wav is None:  # silence: one gentle check, then stop
            if transcript and transcript[-1]["who"] == "agent" and transcript[-1].get("nudge"):
                break
            transcript[-1]["nudge"] = True
            turn = {"say": "Hello ji, aap line par hain?", "end": False}
            continue
        said = api("call_listen", {"wav": base64.b64encode(wav).decode()})["text"]
        if not said:
            turn = {"say": "Sorry, aapki awaaz cut ho gayi thi, please ek baar phir se boliye.", "end": False}
            continue
        transcript.append({"who": "lead", "text": said})
        turn = api("call_turn", {"lead_id": lead["id"], "transcript": [{"who": t["who"], "text": t["text"]} for t in transcript], "said": said})
    hang_up()
    clean = [{"who": t["who"], "text": t["text"]} for t in transcript]
    return api("call_done", {"lead_id": lead["id"], "transcript": clean, "seconds": int(time.time() - started), "outcome": outcome, "notes": notes})


def call_run(args):
    """Action `call_run`: call the due leads one by one (server enforces hours, attempts, do-not-call). Reports progress after each call."""
    limit = max(1, min(int(args.get("max_calls", 5)), 50))
    done = []
    ops.post_progress(f"Calls shuru: {limit} tak")
    for _ in range(limit):
        nxt = api("call_next", {})["lead"]
        if not nxt:
            break
        ops.post_progress(f"Call: {nxt['name'] or nxt['phone']} ({nxt['campaign']})")
        try:
            try:
                import websockets  # noqa: F401
                res = run_call_live(nxt)  # real-time, about 2 s reply time
            except ImportError:
                res = run_call(nxt, voice=str(args.get("voice", "Kore")))  # slower turn-by-turn fallback
            done.append(f"{nxt['name'] or nxt['phone']}: {res['status']} - {res['summary'][:120]}")
        except Exception as e:
            try:
                api("call_done", {"lead_id": nxt["id"], "transcript": [], "seconds": 0, "outcome": "no_answer"})
            except Exception:
                pass
            done.append(f"{nxt['name'] or nxt['phone']}: ERROR {type(e).__name__}: {e}")
            break
        time.sleep(8)
    return "\n".join(done) or "Abhi koi lead call ke liye tayyar nahi (time/campaign/attempts dekho)."


# ------------------------------------------------------------------ real-time calls (Gemini Live): fast, ~2 s reply time
DNC_WORDS = ("call mat", "mat karo", "mat kijiye", "do not call", "dont call", "don't call", "band karo call", "number hata", "dnd", "फोन मत", "कॉल मत", "call na kare", "call nahi karna")


def run_call_live(lead, max_seconds=600):
    """Dial, then talk through one Gemini Live session until the call ends. Returns the server's summary."""
    import asyncio
    import queue
    import threading

    import numpy as np
    import websockets

    cable, mic = find_cable(), find_loopback()
    sess = api("call_live", {"lead_id": lead["id"]})
    started = time.time()
    state = {"outcome": "", "notes": "", "ending": False, "model_audio": False, "dnc": False}
    transcript = []
    mic_q, play_q = queue.Queue(maxsize=200), queue.Queue()
    stop = threading.Event()

    def capture():
        with mic.recorder(samplerate=SAMPLE_RATE, channels=1, blocksize=1600) as rec:
            while not stop.is_set():
                data = rec.record(numframes=1600)[:, 0]
                pcm = (np.clip(data, -1, 1) * 32767).astype("<i2").tobytes()
                try:
                    mic_q.put_nowait(pcm)
                except queue.Full:
                    pass

    def playback():
        while not stop.is_set():
            try:
                chunk = play_q.get(timeout=0.2)
            except queue.Empty:
                continue
            cable.play(np.frombuffer(chunk, dtype="<i2").astype("float32") / 32768.0, samplerate=24000)

    async def main():
        loop = asyncio.get_running_loop()
        async with websockets.connect(sess["ws"] + "?access_token=" + sess["token"], max_size=None, ping_interval=20) as ws:
            await ws.send(json.dumps(sess["setup"]))
            first = json.loads(await asyncio.wait_for(ws.recv(), 20))
            if "setupComplete" not in first:
                raise RuntimeError("Live setup fail: " + str(first)[:200])
            await ws.send(json.dumps({"clientContent": {"turns": [{"role": "user", "parts": [{"text":
                "The phone is ringing now. Stay completely silent until a real person answers and speaks (ignore ringing tones and carrier messages); then say your first words. "
                "Never call end_call before a real person has spoken to you, unless you clearly hear a recorded voicemail or automated 'please leave a message' voice."}]}], "turnComplete": True}}))

            async def sender():
                while not stop.is_set():
                    pcm = await loop.run_in_executor(None, lambda: mic_q.get())
                    await ws.send(json.dumps({"realtimeInput": {"audio": {"data": base64.b64encode(pcm).decode(), "mimeType": "audio/pcm;rate=16000"}}}))

            send_task = asyncio.create_task(sender())
            heard, said, idle_since = "", "", time.time()
            last_check = 0.0
            try:
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), 2.0)
                    except asyncio.TimeoutError:
                        raw = None
                    now = time.time()
                    if raw is not None:
                        d = json.loads(raw)
                        sc = d.get("serverContent") or {}
                        for p in (sc.get("modelTurn") or {}).get("parts", []):
                            if "inlineData" in p:
                                play_q.put(base64.b64decode(p["inlineData"]["data"]))
                                state["model_audio"] = True
                                idle_since = now
                        heard += (sc.get("inputTranscription") or {}).get("text", "")
                        said += (sc.get("outputTranscription") or {}).get("text", "")
                        if sc.get("interrupted"):
                            while not play_q.empty():
                                play_q.get_nowait()
                        if sc.get("turnComplete"):
                            if heard.strip():
                                transcript.append({"who": "lead", "text": heard.strip()})
                                if any(w in heard.lower() for w in DNC_WORDS) and not state["dnc"]:
                                    state["dnc"] = True
                                    state["outcome"] = "do_not_call"
                                    await ws.send(json.dumps({"clientContent": {"turns": [{"role": "user", "parts": [{"text":
                                        "The person asked not to be called again. Apologise in one short sentence, say goodbye and call end_call with outcome do_not_call."}]}], "turnComplete": True}}))
                            if said.strip():
                                transcript.append({"who": "agent", "text": said.strip()})
                            heard, said = "", ""
                        for fc in (d.get("toolCall") or {}).get("functionCalls", []):
                            if fc.get("name") == "end_call" and not any(x["who"] == "lead" for x in transcript) and not heard.strip():
                                await ws.send(json.dumps({"toolResponse": {"functionResponses": [{"id": fc.get("id"), "name": "end_call", "response": {"ok": False, "error": "Nobody has spoken yet. Stay silent and wait for a person to answer."}}]}}))
                            elif fc.get("name") == "end_call":
                                args = fc.get("args") or {}
                                state["outcome"] = state["outcome"] if state["dnc"] else str(args.get("outcome", ""))
                                state["notes"] = str(args.get("notes", ""))
                                state["ending"] = True
                                await ws.send(json.dumps({"toolResponse": {"functionResponses": [{"id": fc.get("id"), "name": "end_call", "response": {"ok": True}}]}}))
                        if d.get("goAway"):
                            break
                    # leave when: said goodbye and audio finished, caller hung up, too long, or nobody ever answered
                    if state["ending"] and play_q.empty() and now - idle_since > 2.5:
                        break
                    if now - started > max_seconds:
                        break
                    if now - started > 60 and not state["model_audio"]:
                        state["outcome"] = "no_answer"
                        break
                    if now - last_check > 6:
                        last_check = now
                        if not await loop.run_in_executor(None, call_active):
                            break
            finally:
                send_task.cancel()

    dial(lead["phone"])
    threading.Thread(target=capture, daemon=True).start()
    threading.Thread(target=playback, daemon=True).start()
    try:
        asyncio.run(main())
    finally:
        stop.set()
        hang_up()
    return api("call_done", {"lead_id": lead["id"], "transcript": transcript, "seconds": int(time.time() - started), "outcome": state["outcome"], "notes": state["notes"]})


# ------------------------------------------------------------------ self test with fake audio devices (no phone needed)
def selftest(args):
    """Runs a whole Live call against a test lead with a synthetic caller: checks token, setup, audio both ways, transcript, end_call."""
    import numpy as np

    lead_id = int(args.get("lead_id", 0))
    lines = [(4, "Hello?"), (13, "Haan boliye. Plot ka rate kya hai? Aur kya Sunday ko visit ho sakta hai?"), (30, "Theek hai, mera budget bees lakh hai. Ab dobara call mat karna.")]
    total = 52
    timeline = np.zeros(total * SAMPLE_RATE, dtype="float32")
    for at, text in lines:
        pcm = np.frombuffer(base64.b64decode(api("call_speak", {"text": text, "voice": "Charon"})["pcm"]), dtype="<i2").astype("float32") / 32768.0
        clip = np.interp(np.linspace(0, len(pcm) - 1, int(len(pcm) * SAMPLE_RATE / 24000)), np.arange(len(pcm)), pcm).astype("float32")
        s = at * SAMPLE_RATE
        timeline[s:s + len(clip)] += clip[: len(timeline) - s]

    class FakeRec:
        def __init__(self):
            self.pos = 0
            self.t0 = time.time()

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def record(self, numframes):
            target = self.t0 + (self.pos + numframes) / SAMPLE_RATE  # real-time pace
            time.sleep(max(0, target - time.time()))
            chunk = timeline[self.pos:self.pos + numframes]
            self.pos += numframes
            out = np.zeros((numframes, 1), dtype="float32")
            out[: len(chunk), 0] = chunk
            return out

    class FakeMic:
        def recorder(self, **kw):
            return FakeRec()

    played = {"sec": 0.0, "first_at": None}
    t_start = time.time()

    class FakeCable:
        def play(self, data, samplerate):
            if played["first_at"] is None:
                played["first_at"] = time.time() - t_start
            played["sec"] += len(data) / samplerate
            time.sleep(len(data) / samplerate * 0.9)

    g = globals()
    saved = {k: g[k] for k in ("find_cable", "find_loopback", "dial", "hang_up", "call_active")}
    g.update(find_cable=lambda: FakeCable(), find_loopback=lambda: FakeMic(), dial=lambda n: None, hang_up=lambda: None,
             call_active=lambda: time.time() - t_start < total)
    try:
        res = run_call_live({"id": lead_id, "phone": "+919000000000", "name": "Test"}, max_seconds=total)
    finally:
        g.update(saved)
    return f"agent spoke {played['sec']:.1f}s (first audio at {played['first_at']}s); result: {json.dumps(res, ensure_ascii=False)}"
