#!/usr/bin/env python3
"""解析两版新东方 CET 词表 PDF -> data/pdf-cet4.json / data/pdf-cet6.json

四级版: 113 页, 四列(序号/单词/注音/释义), 序号 1..4327 连续。
        get_text() 已近似按行输出, 用状态机按「序号 -> 单词 -> 音标 -> 释义」推进;
        单词偶尔被折行(recommendati/on), 用音标行做终止判据。
六级版: 30 页, 双栏排版, 每行左右两条, 条目形如 "word n.释义" 常粘连。
        用 get_text('words') 取坐标, 先按 y 聚行再按页面中线切左右栏,
        然后在第一个词性标记(a./ad./n./vt./vi./v./prep./...)处切开。
"""
import bisect
import json
import os
import re

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PDF4 = os.path.join(ROOT, '大学英语四级词汇带音标-乱序版.pdf')
PDF6 = os.path.join(ROOT, '大学英语六级词汇乱序版.pdf')

IPA = set('əʃɔɑːɪʊɛæʌθðŋʒɡˈˌː')
POS_RE = re.compile(r'(?:^|(?<=[^A-Za-z]))(?:a|ad|adj|adv|n|v|vt|vi|prep|conj|pron|num|int|art|aux)\.')


def page_lines(page, tol=3.0):
    """按 y 聚成视觉行, 返回 [(y, [words...])]"""
    ws = page.get_text('words')
    ws.sort(key=lambda w: (w[1], w[0]))
    rows, cur, last_y = [], [], None
    for x0, y0, x1, y1, w, *_ in ws:
        if last_y is None or abs(y0 - last_y) <= tol:
            cur.append((x0, w))
        else:
            rows.append((last_y, cur)); cur = [(x0, w)]
        last_y = y0
    if cur:
        rows.append((last_y, cur))
    return rows


def parse_cet4():
    """四级表: 四列固定 —— 序号 x<50 / 单词 50..125 / 注音 125..235 / 释义 >=235。

    坑: 序号行的 y 跟本条的单词/释义不齐平(长释义会把整块撑高, 序号沉到底部),
    所以不能拿序号当锚点。注音列才是每条恰好一个、且位于块顶部的锚点,
    于是: 单词/释义/序号一律「归属到上方最近的注音行」——
    折行的单词片段(recommendati + on)也因此落回同一条。
    """
    doc = pymupdf.open(PDF4)
    out = []
    for page in doc:
        toks = [t for t in page.get_text('words') if t[4] not in ('序号单词', '注音', '释义')]
        ipa = sorted((t for t in toks if 125 <= t[0] < 235), key=lambda t: t[1])
        anchors = []                      # [[y, 音标文本], ...]
        for t in ipa:
            if anchors and abs(t[1] - anchors[-1][0]) <= 4:
                anchors[-1][1] += ' ' + t[4]
            else:
                anchors.append([t[1], t[4]])
        if not anchors:
            continue
        ys = [a[0] for a in anchors]
        ents = [{'no': None, 'word': '', 'phonetic': a[1], 'def': ''} for a in anchors]

        def idx_above(y):
            i = bisect.bisect_right(ys, y + 4) - 1
            return max(0, min(i, len(ents) - 1))

        for x0, y0, x1, y1, tok, *_ in toks:
            i = idx_above(y0)
            if x0 < 50:                    # 序号列
                if re.fullmatch(r'\d{1,4}', tok):
                    ents[i]['no'] = int(tok)
            elif x0 < 125:                 # 单词列(折行片段直接拼, 不加空格)
                ents[i]['word'] += re.sub(r"[^A-Za-z\-']", '', tok)
            elif x0 < 235:                 # 注音列已作为锚点
                continue
            else:                          # 释义列
                ents[i]['def'] = (ents[i]['def'] + ' ' + tok).strip()
        out.extend(e for e in ents if e['word'])
    return out


def looks_ipa(s):
    return any(c in IPA for c in s) or ':' in s or s.startswith("'")


def clean_word(s):
    return re.sub(r"[^A-Za-z\-' ]", '', s).strip()


POS_LIST = ('prep', 'conj', 'pron', 'adv', 'adj', 'aux', 'num', 'int', 'art', 'vt', 'vi', 'ad', 'n', 'v', 'a')


def split_word_def(line):
    """六级表里词和释义经常粘死(delayvi.推迟 / conceitn.自负 / superba.壮丽的)。
    做法: 找第一个「.」, 再往回最多 4 个字母, 看能否凑出一个词性缩写。"""
    dot = line.find('.')
    if dot < 0:
        return None
    for ln in (4, 3, 2, 1):
        if dot - ln < 0:
            continue
        abbr = line[dot - ln:dot].lower()
        if abbr in POS_LIST:
            head = line[:dot - ln].strip()
            tail = line[dot - ln:]
            # 词性缩写前面必须是字母(词的一部分)或空白, 不能是另一个词的中间
            if head and re.fullmatch(r"[A-Za-z\-' ]+", head):
                return head, tail
    return None


def parse_cet6():
    doc = pymupdf.open(PDF6)
    out = []
    for page in doc:
        mid = page.rect.width / 2
        left, right = [], []
        for y, items in page_lines(page):
            l = ' '.join(w for x, w in items if x < mid)
            r = ' '.join(w for x, w in items if x >= mid)
            if l.strip():
                left.append(l)
            if r.strip():
                right.append(r)
        for col in (left, right):
            for line in col:
                line = line.strip()
                if not line or line.startswith('新东方') or line in ('新', '教育'):
                    continue
                parsed = split_word_def(line)
                if not parsed:
                    continue
                head, body = parsed
                head = re.sub(r'[^A-Za-z\-\' ]', '', head).strip()
                if not head or len(head) > 24:
                    continue
                out.append({'word': head, 'def': body})
    return out


# ---- 用系统词典(韦氏)修 PDF 文本层的粘连/截断 ----
DICT_FILE = '/usr/share/dict/words'
# 少数被 PDF 文本层咬掉字母 / web2 未收的词, 人工兜底
MANUAL_FIX = {'rmost': 'utmost', 'outeintegral': 'integral', 'jewellery': 'jewellery',
               'harbour': 'harbour', 'theatre': 'theatre', 'coordinate': 'coordinate',
               'automate': 'automate', 'paralyse': 'paralyse', 'dependant': 'dependant',
               'commonsense': 'commonsense', 'makeup': 'makeup'}


def load_dict():
    try:
        with open(DICT_FILE, encoding='utf-8', errors='ignore') as f:
            return {w.strip().lower() for w in f if w.strip().isalpha()}
    except OSError:
        return set()


def repair_word(w, dic):
    """六级表里单词常被前一格释义挤坏: rmost(掉字) / outeintegral(前缀粘连) /
    veilvt(词尾粘了词性)。只做「有明确损坏信号」的修复, 认不出来就原样保留——
    宁可留个可疑词, 也不能把 automate 修成 mate。"""
    if not w:
        return w, False
    if w in dic:
        return w, True
    # 情况 A: 词尾粘了词性缩写 veilvt -> veil
    for suf in ('vt', 'vi', 'ad', 'a', 'n', 'v', 'prep', 'conj', 'pron', 'adv'):
        if w.endswith(suf) and len(w) - len(suf) >= 3 and w[:-len(suf)] in dic:
            return w[:-len(suf)], True
    # 情况 B: 前面粘了释义尾巴(长词才有可能) -> 取最长的一截后缀是词
    if len(w) >= 11:
        for cut in range(1, len(w) - 6):
            if w[cut:] in dic:
                return w[cut:], True
    # 情况 C 关掉了: web2 里有大量生僻词(farmost/sapropel/recontend), 用「以它结尾」
    # 反查会把 propel 修成 sapropel。认不出来就留着, 由 main() 里的人工映射兜底。
    return MANUAL_FIX.get(w, w), w in MANUAL_FIX


def main():
    c4 = parse_cet4()
    nos = [e['no'] for e in c4 if e['no'] is not None]
    missing = sorted(set(range(1, (max(nos) if nos else 0) + 1)) - set(nos))
    print(f'CET4: {len(c4)} 条, 序号 {min(nos)}..{max(nos)}, 缺号 {len(missing)} 个 {missing[:10]}')
    dup = len(c4) - len({e['word'].lower() for e in c4})
    print(f'CET4: 去重后 {len({e["word"].lower() for e in c4})} 个词 (重复 {dup})')
    print('  样例:', [f"{e['no']} {e['word']} {e['phonetic']}" for e in c4[:5]])
    print('  折行修复:', [e['word'] for e in c4 if e['word'].lower() == 'recommendation'])

    c6 = parse_cet6()
    dic = load_dict()
    fixed, bad = [], []
    for e in c6:
        raw = e['word']
        w, ok = repair_word(raw.lower(), dic)
        if w != raw.lower():
            e['raw'] = raw
        e['word'] = w
        fixed.append(e)
        if not ok:
            bad.append(raw)
    print(f'CET6: {len(c6)} 条, 词典修复 {sum(1 for e in fixed if e.get("raw"))} 条, '
          f'词典未收录 {len(bad)} 条 {bad[:10]}')
    print(f'CET6: 去重后 {len({e["word"].lower() for e in fixed})}')

    json.dump({'source': os.path.basename(PDF4), 'count': len(c4), 'words': c4},
              open(os.path.join(ROOT, 'data', 'pdf-cet4.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump({'source': os.path.basename(PDF6), 'count': len(fixed), 'words': fixed,
               'unresolved': bad},
              open(os.path.join(ROOT, 'data', 'pdf-cet6.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('-> data/pdf-cet4.json, data/pdf-cet6.json')


if __name__ == '__main__':
    main()
