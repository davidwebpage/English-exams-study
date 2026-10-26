#!/usr/bin/env python3
"""Validate that every article's out-of-syllabus (超纲) word share stays ≤ 3%.

Uses the same classification as the frontend: CET syllabus + derived variants,
basic grammar words, common words, and the extra (超纲-with-def) table all count
as covered; only words resolving to nothing count as 超纲.

Usage: python scripts/check_articles.py [--threshold 0.03]
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

IRREG = {
 'built':'build','made':'make','seen':'see','told':'tell','grew':'grow','meant':'mean','hidden':'hide',
 'paid':'pay','won':'win','lost':'lose','sent':'send','spent':'spend','lent':'lend','bent':'bend',
 'dealt':'deal','felt':'feel','kept':'keep','left':'leave','held':'hold','met':'meet','ran':'run',
 'sat':'sit','stood':'stand','understood':'understand','became':'become','came':'come','took':'take',
 'gave':'give','got':'get','found':'find','said':'say','went':'go','knew':'know','threw':'throw',
 'drew':'draw','flew':'fly','blew':'blow','swore':'swear','bore':'bear','tore':'tear','wore':'wear',
 'arose':'arise','chose':'choose','froze':'freeze','stole':'steal','spoke':'speak','broke':'break',
 'woke':'wake','ate':'eat','fell':'fall','drove':'drive','rode':'ride','rose':'rise','wrote':'write',
 'bit':'bite','hid':'hide','slid':'slide','rang':'ring','sang':'sing','drank':'drink','shrank':'shrink',
 'sank':'sink','began':'begin','children':'child','men':'man','women':'woman','feet':'foot','teeth':'tooth',
 'geese':'goose','mice':'mouse','caught':'catch','begun':'begin','fallen':'fall','sold':'sell',
 'blurs':'blur','erodes':'erode','equipped':'equip',
 'taken':'take','known':'know','grown':'grow','outgrown':'outgrow','heard':'hear',
 'brought':'bring','led':'lead','eaten':'eat','spoken':'speak','shaken':'shake',
 'worn':'wear','woven':'weave','written':'write','rebuilt':'rebuild','borne':'bear',
 'crises':'crisis','analyses':'analysis','theses':'thesis','bases':'basis',
}
DER = ['ment','tion','sion','ness','ity','er','or','ly','al','ous','ive','ance','ence','ure','ation','ization','ally']


def load_tables():
    tables = {}
    for f, kind in [('words.json', None), ('basic-words.json', 'basic'),
                    ('common-words.json', 'common'), ('extra-words.json', 'extra')]:
        d = json.load(open(os.path.join(ROOT, 'data', f), encoding='utf-8'))
        items = d if isinstance(d, list) else d.get('words', [])
        for w in items:
            logy = 'syll' if kind is None else kind
            tables.setdefault(w['word'], set()).add(logy)
    return tables


def resolve(w, tables):
    if w in tables:
        return True
    if IRREG.get(w) in tables:
        return True
    def strip_double(s_):
        return s_[:-1] if len(s_) > 1 and s_.endswith(s_[-1]) else s_
    cands = []
    if w.endswith('ies'):
        cands.append(w[:-3] + 'y')
    if w.endswith('es'):
        cands.append(w[:-2])
    if w.endswith('s'):
        cands.append(w[:-1])
    if w.endswith('ed'):
        s2 = w[:-2]
        cands.append(s2)
        if len(w) > 3:
            cands.append(s2 + 'e')
            cands.append(strip_double(s2))
    if w.endswith('ied') and len(w) > 4:
        cands.append(w[:-3] + 'y')
    if w.endswith('ves') and len(w) > 4:
        cands.append(w[:-3] + 'f')
        cands.append(w[:-3] + 'fe')
    for suf in ('est', 'er'):
        if w.endswith(suf) and len(w) > len(suf) + 1:
            stem = w[:-len(suf)]
            cands.extend([stem, stem + 'e', strip_double(stem)])
            if stem.endswith('i'):
                cands.append(stem[:-1] + 'y')
    if w.endswith('ing') and len(w) > 4:
        s2 = w[:-3]
        cands.append(s2)
        cands.append(s2 + 'e')
        cands.append(strip_double(s2))
    for t in cands:
        if t and t != w and t in tables:
            return True
    for suf in DER:
        if w.endswith(suf) and len(w) > len(suf) + 2:
            stem = w[:-len(suf)]
            for t in [stem, stem + 'e', (stem[:-1] + 'i') if stem.endswith('y') else stem]:
                if t in tables:
                    return True
            if suf == 'ity':
                for t in [stem + 'ous', stem + 'al', stem + 'e']:
                    if t in tables:
                        return True
            if suf == 'ness':
                for t in [stem + 'y', stem + 'ful']:
                    if t in tables:
                        return True
    if w.endswith('ility') and len(w) > 6:
        if (w[:-5] + 'le') in tables:
            return True
    if w.endswith('ibility') and len(w) > 8:
        if (w[:-5] + 'ible') in tables:
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--threshold', type=float, default=0.03)
    args = ap.parse_args()
    tables = load_tables()
    arts = json.load(open(os.path.join(ROOT, 'data', 'articles.json'), encoding='utf-8'))['articles']
    re_word = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
    bad = []
    print(f'articles: {len(arts)} | threshold {args.threshold:.0%}')
    for a in arts:
        total = outline = 0
        outlines = set()
        for p in a['paragraphs']:
            for m in re_word.finditer(p.lower()):
                w = m.group(0)
                if w.endswith("'s"):
                    w = w[:-2]
                total += 1
                if not resolve(w, tables) or ('extra' in (tables.get(w) or set())):
                    outline += 1
                    outlines.add(w)
        ratio = outline / total if total else 0
        flag = 'OK ' if ratio <= args.threshold else 'OVER'
        print(f'  [{flag}] {a["id"]} {ratio:6.1%} outline={outline}/{total}  {sorted(outlines)[:6]}')
        if ratio > args.threshold:
            bad.append((a['id'], ratio, sorted(outlines)))
    print('\nRESULT:', 'ALL PASS' if not bad else f'FAIL ({len(bad)})')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
