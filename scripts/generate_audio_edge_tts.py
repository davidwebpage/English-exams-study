#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bulk-generate word mp3s with edge-tts so the app can play offline audio.

The voice is chosen to approximate the female narrator used in many CET6
listening packs. After generation the script also writes data/audio.index.json,
which src/tts.js reads to decide between mp3 playback and speech synthesis.

Usage:
  pip install edge-tts
  python scripts/generate_audio_edge_tts.py            # all words
  python scripts/generate_audio_edge_tts.py --limit 50 # first 50
"""
import argparse
import asyncio
import json
import os
import sys

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORDS = os.path.join(ROOT, 'data', 'words.json')
OUT = os.path.join(ROOT, 'audio')
INDEX = os.path.join(ROOT, 'data', 'audio.index.json')

VOICE = os.environ.get('CET_TTS_VOICE', 'en-US-JennyNeural')


async def generate_one(word, path):
    done = {'words': []}
    async for chunk in edge_tts.Communicate(word, VOICE).stream():
        if chunk['type'] == 'audio':
            with open(path, 'ab') as f:
                f.write(chunk['data'])
    return done


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='only first N words')
    ap.add_argument('--voice', default=VOICE)
    args = ap.parse_args()

    with open(WORDS, encoding='utf-8') as f:
        words = json.load(f)
    if args.limit:
        words = words[:args.limit]

    os.makedirs(OUT, exist_ok=True)
    available = {}
    for i, w in enumerate(words):
        key = w['word'].lower()
        path = os.path.join(OUT, key + '.mp3')
        if os.path.exists(path) and os.path.getsize(path) > 0:
            available[key] = 1
            continue
        try:
            await generate_one(w['word'], path)
            available[key] = 1
        except Exception as e:
            print(f'skip {key}: {e}')
        if (i + 1) % 200 == 0:
            print(f'{i+1}/{len(words)} done')

    os.makedirs(os.path.dirname(INDEX), exist_ok=True)
    with open(INDEX, 'w', encoding='utf-8') as f:
        json.dump(available, f, ensure_ascii=False)
    print(f'done: {len(available)}/{len(words)} words available -> {OUT}')


if __name__ == '__main__':
    asyncio.run(main())
