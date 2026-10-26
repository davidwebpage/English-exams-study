#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build data/words.json from the cleaned CET xlsx workbook.

Strips name/place etymology junk from definitions and extracts part-of-speech
markers so the frontend can show a clean gloss in the word-detail popup.
"""
import json
import os
import re
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'data', '大学英语六级词汇完整带音标-可打印-可编辑-正序版.xlsx')
OUT = os.path.join(ROOT, 'data', 'words.json')
IDX = os.path.join(ROOT, 'data', 'words.idx.json')

POS_RE = re.compile(r'\b(n\.|v\.|vt\.|vi\.|aux\.|adj\.|adv\.|prep\.|conj\.|pron\.|art\.|num\.|abbr\.)', re.IGNORECASE)


POS_HEADS = r'(?:n\.|v\.|vt\.|vi\.|aux\.|adj\.|adv\.|prep\.|conj\.|pron\.|art\.|num\.|abbr\.)'

GLUED_RE = re.compile(r'([\u4e00-\u9fff])(?=' + POS_HEADS + r')')

def _glued_fix(m):
    return m.group(1) + '；'

def clean_definition(s):
    if not s:
        return ''
    s = s.strip()
    # 人名/地名注记以 "(Mayor)人名" / "（Ago）人名" 等形态拼在释义末尾。
    # 只从注记起点处切断; 绝不整格清空。
    m = re.search(r'(?:[（(][^）)]*[)）]\s*)?(?:人名|地名)', s)
    if m:
        prefix = s[:m.start()].strip()
        if prefix:
            s = prefix
            # 注记前常带一个重复的悬空词性头(如 "...市长n. (Mayor)"),
            # 可能贴在中文字符后(无空格), 两种形态都剥掉
            s = re.sub(r'(?:\s+|(?<=\S))' + POS_HEADS + r'\s*$', '', s)
        else:
            # 极端情况: 注记位于开头, 只剥掉注记尾巴
            s = re.sub(r'\s*(?:[（(][^）)]*[)）]\s*)?(?:人名|地名).*$', '', s)
    s = re.sub(r'[（(]\s*[)）]', '', s)
    # 中文释义后直接粘连的词性头(无空格)多半是合并词条, 补成分号分隔
    s = GLUED_RE.sub(_glued_fix, s)
    s = re.sub(r'\s+', ' ', s).strip(' ；;，,')
    return s


def extract_pos(s):
    found = []
    for m in POS_RE.findall(s or ''):
        m = m.lower()
        if m not in found:
            found.append(m)
    return found


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True)
    ws = wb.worksheets[0]
    words = []
    seen = set()
    idx = 0
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        if not row or not row[1]:
            continue
        word = str(row[1]).strip().lower()
        if not word or word in seen:
            continue
        seen.add(word)
        phonetic = str(row[2]).strip() if row[2] else ''
        raw_def = str(row[3]) if row[3] else ''
        definition = clean_definition(raw_def)
        pos = extract_pos(definition)
        idx += 1
        words.append({
            'id': idx,
            'word': word,
            'phonetic': phonetic,
            'pos': pos,
            'definition': definition,
        })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False)
    with open(IDX, 'w', encoding='utf-8') as f:
        json.dump({w['word']: w['id'] for w in words}, f, ensure_ascii=False)
    print(f'wrote {len(words)} words -> {OUT}')


if __name__ == '__main__':
    main()
