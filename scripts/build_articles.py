#!/usr/bin/env python3
"""Parse data/articles.src.txt and merge new CET6 articles into articles.json.

Source format per article:

====
title: ...
topic: ...
core: word1, word2, ...

English paragraph 1

English paragraph 2

==译文==
Chinese paragraph 1

Chinese paragraph 2

The `====` separator starts a new article.  `==译文==` toggles to Chinese.
New articles are appended with sequential ids (a11, a12, ...).
"""
import json
import os
import re
import sys

from check_articles import load_tables, resolve

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'data', 'articles.src.txt')
OUT = os.path.join(ROOT, 'data', 'articles.json')


def parse_source(text):
    blocks = re.split(r'^====\s*$', text, flags=re.M)
    articles = []
    for block in blocks:
        block = '\n'.join(ln for ln in block.splitlines() if not ln.startswith('#')).strip()
        if not block:
            continue
        if '==译文==' not in block:
            print(f'WARN: block without 译文 section skipped:\n{block[:80]}')
            continue
        head, zh = block.split('==译文==', 1)
        meta = {}
        body_lines = []
        for ln in head.splitlines():
            if ':' in ln and not body_lines:
                k, v = ln.split(':', 1)
                meta[k.strip().lower()] = v.strip()
            else:
                body_lines.append(ln)
        en = [p.strip() for p in re.split(r'\n\s*\n', '\n'.join(body_lines)) if p.strip()]
        zhp = [p.strip() for p in re.split(r'\n\s*\n', zh) if p.strip()]
        if not meta.get('title') or not meta.get('topic') or not en:
            print(f'WARN: incomplete block: {meta.get("title")}')
            continue
        core = [w.strip().lower() for w in re.split(r'[,，]', meta.get('core', '')) if w.strip()]
        articles.append({
            'title': meta['title'], 'topic': meta['topic'], 'coreWords': core,
            'paragraphs': en, 'translation': zhp,
        })
    return articles


def outline_report(paragraphs, tables):
    re_word = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
    total = outline = 0
    bad = set()
    for p in paragraphs:
        for m in re_word.finditer(p.lower()):
            w = m.group(0)
            if w.endswith("'s"):
                w = w[:-2]
            total += 1
            if not resolve(w, tables) or 'extra' in (tables.get(w) or set()):
                outline += 1
                bad.add(w)
    return total, outline, sorted(bad)


def main():
    text = open(SRC, encoding='utf-8').read()
    new = parse_source(text)
    tables = load_tables()
    base = [a for a in json.load(open(OUT, encoding='utf-8'))['articles']
            if re.fullmatch(r'a(?:[1-9]|10)', a['id'])]
    base.sort(key=lambda a: int(a['id'][1:]))
    # 固定编号: a1 -> 1, a2 -> 2 ... 写入 no 字段, 前端直接展示「第 N 篇」
    for a in base:
        a['no'] = int(a['id'][1:])
    extras = []
    for i, a in enumerate(new, start=11):
        if len(a['translation']) != len(a['paragraphs']):
            print(f'WARN: translation count mismatch for {a["title"]}: '
                  f'{len(a["paragraphs"])} paragraphs vs {len(a["translation"])} translations')
            continue
        art = {
            'id': f'a{i}', 'no': i, 'title': a['title'], 'topic': a['topic'],
            'level': 'CET6', 'words': 4, 'coreWords': a['coreWords'],
            'paragraphs': a['paragraphs'], 'translation': a['translation'],
        }
        wc, ol, bad = outline_report(a['paragraphs'], tables)
        ratio = ol / wc if wc else 0
        flag = 'OK ' if ratio <= 0.03 else 'OVER'
        more = '  ' + ','.join(bad[6:12]) if len(bad) > 6 else ''
        print(f'[{flag}] {art["id"]} {ratio:5.1%} {wc:3d}w ol={ol:2d}  '
              f'{",".join(bad[:6])}{more}')
        extras.append(art)
    json.dump({'articles': base + extras}, open(OUT, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    print(f'\nbase {len(base)} + added {len(extras)} = {len(base) + len(extras)} -> data/articles.json')


if __name__ == '__main__':
    main()
