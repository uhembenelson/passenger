#!/usr/bin/env python3
"""
Build the film's voiceover, and the table of word timings that keeps the type
locked to it.

    uv run --with edge-tts python apps/website/scripts/voiceover.py --rate -15%

Each beat is synthesized on its own so the silence between beats is ours to
place: a beat's speech starts `LEAD` after the beat starts and ends `TAIL`
before it does, which is the room the cross-dissolve and the type need. The
clips are spliced into one PCM WAV at those offsets, and `voice.ts` is written
from the same numbers, so a word's time in the table is a word's time in the
file by construction — there is no drift to tune out later.

Word times come from the service's own word boundaries, so the type lands on the
spoken word rather than on an even division of the beat.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
import wave
from pathlib import Path

import edge_tts

VOICE = "en-NG-AbeoNeural"
LEAD = 0.4
TAIL = 1.6
TAIL_LAST = 3.26
# Silence the service pads each clip with; the breath is ours to set, not its.
TRIM = 0.35

HERE = Path(__file__).resolve().parents[1]
PUBLIC = HERE / "public/studio/voice"
OUT_WAV = PUBLIC / "kaduna-to-jos.wav"
OUT_TS = HERE / "app/studio/voice.ts"

# The narration, one entry per beat. `*` marks a word the beat turns on and is
# stripped before synthesis; the counts here and the counts the service returns
# must agree, or the type would be a word out of step for the rest of the film.
BEATS: list[tuple[str, list[str]]] = [
    (
        "post",
        [
            "Right now, someone is posting on *WhatsApp,*",
            "“Who is travelling from *Kaduna* to *Jos?*",
            "*I need to send something.”*",
        ],
    ),
    ("trip", ["And somewhere else, someone", "is already making that *exact trip.*"]),
    ("strangers", ["They just do not *know* each other."]),
    ("together", ["*Passenger* brings them *together.*"]),
    (
        "exchange",
        [
            "One person sends with *less stress,*",
            "while the other *earns* from a trip",
            "they were *already* taking.",
        ],
    ),
    (
        "closing",
        [
            "That is the idea behind *Passenger.*",
            "Send it with someone",
            "*already going your way.*",
        ],
    ),
    (
        "launch",
        [
            "We are getting ready to *launch.*",
            "Join the waitlist at",
            "*usepassenger.com/waitlist*",
        ],
    ),
]


def plain(line: str) -> str:
    """The line as it is spoken: emphasis markers removed, quotes left readable."""
    return line.replace("*", "")


async def _synth(text: str, rate: str) -> tuple[bytes, list[dict]]:
    comm = edge_tts.Communicate(text, VOICE, rate=rate, boundary="WordBoundary")
    audio = bytearray()
    words: list[dict] = []
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            words.append(
                {
                    "text": chunk["text"],
                    "at": round(chunk["offset"] / 1e7, 4),
                    "d": round(chunk["duration"] / 1e7, 4),
                }
            )
    return bytes(audio), words


def synth(text: str, rate: str) -> tuple[bytes, list[dict]]:
    return asyncio.run(_synth(text, rate))


def to_wav(mp3: Path, wav: Path) -> None:
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16", str(mp3), str(wav)],
        check=True,
        capture_output=True,
    )


def read_wav(path: Path) -> tuple[wave._wave_params, bytes]:  # type: ignore[name-defined]
    with wave.open(str(path), "rb") as w:
        params = w.getparams()
        data = w.readframes(w.getnframes())
    return params, data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rate", default="-15%", help="edge-tts rate, e.g. -15%%")
    args = ap.parse_args()

    tmp = Path("/private/var/folders/zc/nkcc508j7dd0k1yj1wh09qy80000gn/T/opencode/voice")
    tmp.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    beats: list[dict] = []
    cursor = 0.0

    for index, (beat_id, lines) in enumerate(BEATS):
        text = " ".join(plain(line) for line in lines)
        mp3 = tmp / f"{index:02d}-{beat_id}.mp3"
        wav = tmp / f"{index:02d}-{beat_id}.wav"
        audio, spoken = synth(text, args.rate)
        mp3.write_bytes(audio)
        to_wav(mp3, wav)
        params, pcm = read_wav(wav)

        # The service pads the end of a clip with silence. Keep a little so the
        # last word does not clip, and let TAIL be the breath after a beat.
        frame_bytes = params.nchannels * params.sampwidth
        speech_end = spoken[-1]["at"] + spoken[-1]["d"]
        keep = min(len(pcm), round((speech_end + TRIM) * frame_bytes * params.framerate))
        pcm = pcm[: keep - (keep % frame_bytes)]

        # The service and the lines must agree word for word, or every mark
        # after the first mismatch would be keyed to the wrong word.
        script_words = [w for line in lines for w in plain(line).split()]
        heard = [w["text"] for w in spoken]
        if len(script_words) != len(heard):
            raise SystemExit(
                f"{beat_id}: script has {len(script_words)} words, service returned {len(heard)}\n"
                f"  script: {script_words}\n  heard:  {heard}"
            )

        duration = len(pcm) / (frame_bytes * params.framerate)
        start, end = cursor, cursor + LEAD + duration + (TAIL_LAST if index == len(BEATS) - 1 else TAIL)

        beats.append(
            {
                "id": beat_id,
                "start": round(start, 4),
                "end": round(end, 4),
                "audioAt": round(start + LEAD, 4),
                "duration": round(duration, 4),
                "params": (params.nchannels, params.sampwidth, params.framerate),
                "pcm": pcm,
                # Absolute seconds, in the order the lines are read.
                "words": [
                    {"t": round(start + LEAD + w["at"], 4), "d": round(w["d"], 4)}
                    for w in spoken
                ],
            }
        )
        cursor = end
        print(
            f"  {beat_id:10s} {duration:7.3f}s  speech ends {speech_end:7.3f}"
            f"  beat {start:6.3f} - {end:6.3f}",
            file=sys.stderr,
        )

    # Splice: silence everywhere, each beat's speech dropped in at its own offset.
    channels, sampwidth, framerate = beats[0]["params"]
    assert all(b["params"] == beats[0]["params"] for b in beats), "beats must share a format"
    total = round(cursor * framerate)
    master = bytearray(total * channels * sampwidth)
    for beat in beats:
        offset = round(beat["audioAt"] * framerate)
        at = offset * channels * sampwidth
        master[at : at + len(beat["pcm"])] = beat["pcm"]
    with wave.open(str(OUT_WAV), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(sampwidth)
        w.setframerate(framerate)
        w.writeframes(bytes(master))

    body = "\n".join(
        "  {\n"
        f'    id: "{b["id"]}",\n'
        f'    start: {b["start"]},\n'
        f'    end: {b["end"]},\n'
        f'    words: [\n'
        + "".join(f"      {{ t: {w['t']}, d: {w['d']} }},\n" for w in b["words"])
        + "    ],\n"
        "  },"
        for b in beats
    )
    OUT_TS.write_text(
        "/**\n"
        " * Generated by `apps/website/scripts/voiceover.py` — do not edit by hand.\n"
        " *\n"
        f" * The narration is read by {VOICE} at {args.rate}, one clip per beat, spliced\n"
        " * into `public/studio/voice/kaduna-to-jos.wav` with a breath between beats.\n"
        " * `t` is when a word is spoken on the film's clock; the film's marks are keyed\n"
        " * to these times, so the picture and the voice cannot drift apart.\n"
        " */\n\n"
        "export type VoiceWord = { t: number; d: number };\n"
        "export type VoiceBeat = {\n"
        '  id: string;\n'
        "  start: number;\n"
        "  end: number;\n"
        "  words: VoiceWord[];\n"
        "};\n\n"
        "export const VOICE = {\n"
        '  src: "/studio/voice/kaduna-to-jos.wav",\n'
        f"  duration: {round(cursor, 4)},\n"
        "  beats: [\n" + body + "\n  ],\n"
        "} as const;\n"
    )

    print(
        json.dumps(
            {
                "wav": str(OUT_WAV),
                "ts": str(OUT_TS),
                "seconds": round(cursor, 3),
                "frames": round(cursor * 30),
                "rate": args.rate,
                "bytes": len(master) + 44,
                "perBeat": [
                    {"id": b["id"], "start": b["start"], "end": b["end"], "words": len(b["words"])}
                    for b in beats
                ],
            },
            indent=1,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
