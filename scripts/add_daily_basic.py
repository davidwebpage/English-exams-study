#!/usr/bin/env python3
"""把 retiable 常用词中「新词库仍覆盖不了」的日常词并入基础词层。

2026-10-26 常用词层取消后, 原 138 词里 119 个(people/online/email...)既不在
合并后的 words.json, 也不在任何其它层, 会被误判为超纲。把它们加进
basic-words.json 的 words 数组, 带 learnable: true —— 表示「基础词, 但
不是恒已斩」, 需要手动斩断、参与进度。

Usage: python scripts/add_daily_basic.py
"""
import json
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load(path, key=None):
    d = json.load(open(path, encoding='utf-8'))
    if key:
        return d[key]
    return d


def main():
    base = os.path.join(ROOT, 'data')
    retired = load(os.path.join(base, 'common-words.retired.json'), 'words')
    words = load(os.path.join(base, 'words.json'))
    basic = load(os.path.join(base, 'basic-words.json'))

    W = {w['word'] for w in words}
    covered = set(W) | {w['word'] for w in basic['words']}
    missing = [w for w in retired if w['word'] not in covered]

    next_id = max(w['id'] for w in basic['words']) + 1
    added = []
    for w in missing:
        added.append({
            'id': next_id,
            'word': w['word'],
            'phonetic': w.get('phonetic', ''),
            'pos': w.get('pos', []),
            'definition': w.get('definition', ''),
            'kind': 'basic',
            'learnable': True,   # 基础词但非恒已斩: 需手动斩
        })
        next_id += 1

    shutil.copyfile(os.path.join(base, 'basic-words.json'),
                    os.path.join(base, 'basic-words.before-daily.json'))
    basic['words'] = basic['words'] + added
    json.dump(basic, open(os.path.join(base, 'basic-words.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    dup = [w['word'] for w in basic['words']]
    dup_id = [x['id'] for x in basic['words']]
    assert len(dup) == len(set(dup)), 'duplicate words!'
    assert len(dup_id) == len(set(dup_id)), 'duplicate ids!'
    print(f'daily added: {len(added)} (id {added[0]["id"]}..{added[-1]["id"]})')
    print(f'basic-words.json now {len(basic["words"])} entries')
    print(f'backup: data/basic-words.before-daily.json')


if __name__ == '__main__':
    main()
