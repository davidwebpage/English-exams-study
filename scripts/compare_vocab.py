#!/usr/bin/env python3
"""把新东方四级/六级 PDF 词表与本地词库(data/words.json)做对照。

产出:
  data/vocab-diff.json   —— 机器可读的差异清单
  data/vocab-diff.md     —— 人看的对照报告
"""
import json
import os
import re
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
D = os.path.join(ROOT, 'data')


def load(name):
    return json.load(open(os.path.join(D, name), encoding='utf-8'))


def clean(w):
    return re.sub(r"[^a-z\-']", '', str(w).lower()).strip()


def main():
    # 对照用「合并前」的词库: 这份报告的意义就是给出合并清单
    base_file = 'words.before-pdf-merge.json' if os.path.exists(os.path.join(D, 'words.before-pdf-merge.json')) else 'words.json'
    ours = load(base_file)
    now = load('words.json')
    c4 = load('pdf-cet4.json')['words']
    c6 = load('pdf-cet6.json')['words']
    common = [w['word'] for w in load('common-words.retired.json')['words']]
    basic = [w['word'] for w in load('basic-words.json')['words']]
    extra = [w['word'] for w in load('extra-words.json')['words']]
    mastered = set(load('mastered.json')['mastered'])

    ours_map = {}
    for w in ours:
        ours_map.setdefault(clean(w['word']), w)
    ours_set = set(ours_map)

    c4_set = {clean(e['word']) for e in c4 if clean(e['word'])}
    c6_set = {clean(e['word']) for e in c6 if clean(e['word'])}
    c6_suspect = load('pdf-cet6.json').get('unresolved', [])

    # ---- 差异 ----
    only_c4 = sorted(c4_set - ours_set)
    only_c6 = sorted(c6_set - ours_set)
    not_in_pdf = sorted(ours_set - c4_set - c6_set)
    ours_in_c4 = sorted(ours_set & c4_set)
    ours_in_c6_only = sorted((ours_set & c6_set) - c4_set)

    com_in_c4 = sorted({clean(w) for w in common} & c4_set)
    com_in_c6 = sorted(({clean(w) for w in common} & c6_set) - c4_set)
    com_not_in_pdf = sorted({clean(w) for w in common} - c4_set - c6_set)
    bas_in_pdf = sorted({clean(w) for w in basic} & (c4_set | c6_set))

    dup_c4 = {}
    for e in c4:
        k = clean(e['word'])
        dup_c4[k] = dup_c4.get(k, 0) + 1

    diff = {
        'ourTotal': len(ours),
        'pdfCet4': len(c4_set),
        'pdfCet6': len(c6_set),
        'oursInCet4': len(ours_in_c4),
        'oursInCet6Only': len(ours_in_c6_only),
        'oursNotInAnyPdf': len(not_in_pdf),
        'missingFromOursCet4': len(only_c4),
        'missingFromOursCet6': len(only_c6),
        'commonTotal': len(common),
        'commonActuallyCet4': len(com_in_c4),
        'commonActuallyCet6': len(com_in_c6),
        'commonNotInPdf': len(com_not_in_pdf),
        'basicWordsInPdf': len(bas_in_pdf),
        'cet6SuspectTokens': len(c6_suspect),
        'onlyCet4': only_c4,
        'onlyCet6': only_c6,
        'oursNotInAnyPdfList': not_in_pdf,
        'commonWordsInPdf': sorted(set(com_in_c4) | set(com_in_c6)),
        'cet6Suspect': c6_suspect,
    }
    json.dump(diff, open(os.path.join(D, 'vocab-diff.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    # ---- 报告 ----
    L = []
    L.append('# 词表对照：本地词库 vs 新东方四级/六级乱序版\n')
    L.append(f'生成时间：{__import__("datetime").datetime.now():%Y-%m-%d %H:%M}\n')
    L.append('## 一、规模\n')
    L.append('| 来源 | 词条数 | 说明 |')
    L.append('|---|---|---|')
    L.append(f'| 本地词库（合并前 `words.before-pdf-merge.json`） | {len(ours)} | App 原来的「全部」大纲词 |')
    L.append(f'| 本地词库（合并后 `words.json`） | {len(now)} | 现在 App 里「全部」的量 |')
    L.append(f'| 新东方四级乱序版 | {len(c4_set)} | PDF 共 {len(c4)} 条，去重后 |')
    L.append(f'| 新东方六级乱序版 | {len(c6_set)} | PDF 解析 {len(c6)} 条（含粘连噪声），修复后 |')
    L.append('')
    L.append('## 二、本地词库和这两份表的重合度\n')
    L.append('| 指标 | 数量 |')
    L.append('|---|---|')
    L.append(f'| 本地词库中，四级表里也有 | {len(ours_in_c4)} |')
    L.append(f'| 本地词库中，只在六级表里（不在四级） | {len(ours_in_c6_only)} |')
    L.append(f'| 本地词库中，两份表都没有 | {len(not_in_pdf)} |')
    L.append('')
    L.append('## 三、缺词：PDF 有、本地词库没有\n')
    L.append(f'- 四级表里有、本地缺：**{len(only_c4)}** 个')
    L.append(f'- 六级表里有、本地缺：**{len(only_c6)}** 个')
    L.append('\n### 四级缺词（前 200）\n')
    L.append('```\n' + ' '.join(only_c4[:200]) + '\n```\n')
    L.append('### 六级缺词（前 200）\n')
    L.append('```\n' + ' '.join(only_c6[:200]) + '\n```\n')
    L.append('## 四、「常用词」这一层的真伪\n')
    L.append(f'`common-words.json` 共 {len(common)} 个词，它们被强制标记为「已斩」且不可斩。\n')
    L.append(f'- 其中 **{len(com_in_c4)}** 个出现在四级表里、**{len(com_in_c6)}** 个出现在六级表里')
    L.append(f'- 两份表都没有：{len(com_not_in_pdf)} 个')
    L.append('\n四级表里也有、却被强制算作已斩的词：\n')
    L.append('```\n' + ' '.join(com_in_c4) + '\n```\n')
    if com_in_c6:
        L.append('六级表里也有、却被强制算作已斩的词：\n')
        L.append('```\n' + ' '.join(com_in_c6) + '\n```\n')
    L.append(f'\n> 基础词（basic-words.json，{len(basic)} 个）里有 {len(bas_in_pdf)} 个也在 PDF 表里。\n')
    L.append('## 五、本地词库中两份表都没有的词（候选超纲/可疑）\n')
    L.append(f'共 {len(not_in_pdf)} 个，前 300：\n')
    L.append('```\n' + ' '.join(not_in_pdf[:300]) + '\n```\n')
    if c6_suspect:
        L.append('## 附：六级 PDF 解析未能确认的 token\n')
        L.append('```\n' + ' '.join(c6_suspect[:80]) + '\n```\n')
    L.append('\n## 六、已执行的合并\n')
    L.append(f'- 合并前 `data/words.json`：{len(ours)} 词；合并后：**{len(now)} 词**（新增 {len(now) - len(ours)}）')
    L.append('- 已有词的 id 一个没动，新词从 id 6001 起顺延，所以历史学习进度不受影响；'
             '合并前的原文件备份在 `data/words.before-pdf-merge.json`')
    L.append(f'- 「常用词」层已取消（原 {len(common)} 词存档于 `data/common-words.retired.json`），'
             '这层原先会把 performance / applicant / oversight 这类词强制标成「已斩」')
    L.append('- 音标：四级表自带音标；六级表没有音标，用离线 CMU 词典补，'
             f'新增的 {len([x for x in now if x["id"] >= 6001])} 词里 '
             f'{sum(1 for x in now if x["id"] >= 6001 and x.get("phonetic"))} 个带上了音标')
    open(os.path.join(D, 'vocab-diff.md'), 'w', encoding='utf-8').write('\n'.join(L))

    print(f'本地词库 {len(ours)} | CET4 {len(c4_set)} | CET6 {len(c6_set)}')
    print(f'本地∩四级 {len(ours_in_c4)} | 本地只在六级 {len(ours_in_c6_only)} | 本地两份都没有 {len(not_in_pdf)}')
    print(f'缺词: 四级 {len(only_c4)} | 六级 {len(only_c6)}')
    print(f'常用词 {len(common)}: 在四级 {len(com_in_c4)} | 在六级 {len(com_in_c6)} | 都不在 {len(com_not_in_pdf)}')
    print(f'六级可疑 token {len(c6_suspect)}: {c6_suspect[:10]}')
    print('-> data/vocab-diff.json / data/vocab-diff.md')


if __name__ == '__main__':
    main()
