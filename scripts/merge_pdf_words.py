#!/usr/bin/env python3
"""把新东方四级/六级 PDF 词表里「本地词库没有的词」合并进 data/words.json。

规则:
  * 已有词的 id 一律不动(前端 localStorage 的学习进度按 id 存, 不能动);
  * 新词 id 从 6001 起顺延, 追加在末尾;
  * 音标: 四级表里有就带上(转成 /.../ 形式), 六级表没有音标 -> 留空;
  * 释义: 直接用 PDF 的释义文本, 词性从文本里的 a./n./vt./... 标记提取;
  * 过滤掉解析产生的垃圾条目(截断/粘连/拼写错误)。

用法: python scripts/merge_pdf_words.py [--apply]
不带 --apply 只试算并打印, 不写文件。
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
D = os.path.join(ROOT, 'data')

JUNK = {'inser', 'accommodatio', 'resistanceam', 'reservior', 'mishief', 'ndefinite',
        'ile', 'twatt', 'coordinatea', 'bc', 'esp', 'pm'}   # 截断/粘连/PDF 拼写错误
POS_FIND = re.compile(r'(?:^|(?<=[^A-Za-z]))((?:a|ad|adj|adv|n|v|vt|vi|prep|conj|pron|num|int|art|aux)\.)')


def clean(w):
    return re.sub(r"[^a-z\-']", '', str(w).lower()).strip()


def to_phonetic(raw):
    """四级表音标是半 ASCII 写法('plæstik / sti:l), 转成 app 的 /.../ 形式。"""
    s = (raw or '').strip().strip('/')
    if not s:
        return ''
    s = s.replace("'", 'ˈ').replace(':', 'ː').replace(',', ', ')
    return f'/{s}/'


def guess_phonetic(word):
    """六级表没有音标, 用离线 CMU 词典(eng_to_ipa)补, 只做一次。"""
    try:
        import eng_to_ipa
    except ImportError:
        return ''
    try:
        ipa = eng_to_ipa.convert(word.lower())
    except Exception:
        return ''
    if not ipa or '*' in ipa:
        return ''
    return f'/{ipa}/'


def main():
    apply = '--apply' in sys.argv
    words = json.load(open(os.path.join(D, 'words.json'), encoding='utf-8'))
    c4 = json.load(open(os.path.join(D, 'pdf-cet4.json'), encoding='utf-8'))['words']
    c6 = json.load(open(os.path.join(D, 'pdf-cet6.json'), encoding='utf-8'))['words']

    have = {clean(w['word']): w for w in words}
    next_id = 6001
    added, skipped = [], []

    for src, tag in ((c4, 'CET4'), (c6, 'CET6')):
        for e in src:
            raw = (e['word'] or '').strip()
            k = clean(raw)
            if not k or len(k) < 2:
                continue
            if k in have:
                continue
            if k in JUNK:
                skipped.append((k, 'junk'))
                continue
            definition = re.sub(r'\s+', ' ', (e.get('def') or '')).strip()
            if not definition:
                skipped.append((k, 'no-def'))
                continue
            pos = []
            for m in POS_FIND.finditer(definition):
                p = m.group(1)
                if p not in pos:
                    pos.append(p)
            item = {
                'id': next_id,
                'word': raw if tag == 'CET4' else raw.lower(),
                'phonetic': to_phonetic(e.get('phonetic', '')) if tag == 'CET4' else '',
                'pos': pos,
                'definition': definition,
                'from': tag,
            }
            if not item['phonetic']:
                item['phonetic'] = guess_phonetic(item['word'])
            have[k] = item
            added.append(item)
            next_id += 1

    print(f'原词库 {len(words)} 词; 新增 {len(added)} 词 '
          f'(四级 {sum(1 for a in added if a["from"] == "CET4")} / '
          f'六级 {sum(1 for a in added if a["from"] == "CET6")}); 跳过 {len(skipped)} {skipped[:8]}')
    print('新词样例:', [(a['word'], a['phonetic'], a['definition'][:16]) for a in added[:6]])
    print('无音标的占比:', f'{sum(1 for a in added if not a["phonetic"])}/{len(added)}')

    if not apply:
        print('\n(试算, 未写文件; 加 --apply 才真正写入)')
        return

    bak = os.path.join(D, 'words.before-pdf-merge.json')
    if not os.path.exists(bak):
        shutil.copy2(os.path.join(D, 'words.json'), bak)
        print(f'备份 -> {os.path.relpath(bak, ROOT)}')
    merged = words + [{k: v for k, v in a.items() if k != 'from'} for a in added]
    json.dump(merged, open(os.path.join(D, 'words.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f'写入 data/words.json: {len(words)} -> {len(merged)} 词')


if __name__ == '__main__':
    main()
