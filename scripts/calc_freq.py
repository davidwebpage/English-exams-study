#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build data/wordfreq.json: an offline importance score per library word.

Score = article corpus recurrence (strong signal, real reading text) plus a
curated list of common CET6 exam words plus a small length tiebreak. It is a
proxy ranking until real COCA/BNC corpus data is swapped in later.

Usage: python scripts/calc_freq.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORDS = os.path.join(ROOT, 'data', 'words.json')
ARTICLES = os.path.join(ROOT, 'data', 'articles.json')
OUT = os.path.join(ROOT, 'data', 'wordfreq.json')

# 常见 CET6 高频考点词(原形). 不在词库的词会被自动忽略.
EXTRA = """abandon ability abnormal abolish abstract abundant accelerate
access accommodation accompany accord accumulate accurate acknowledge acquire
adapt adequate adjacent adjust administration admire adolescent advocate
aesthetic affiliate aggravate aggregate allocate ambiguous amendment analogous
annual anticipate anxiety apparent appeal appendix applaud applicable appoint
appraise appropriate approximate arbitrary artificial ascend ascertain
assemble assert assess asset assign associate assume assurance attain attribute
authoritative avert award aware awkward bachelor behalf beneficial benign bias
bid bleak boom bounce boundary breadth brief brilliant brittle budget bulk
capable capacity career casual catastrophic cease celebrity census certify
chaos characteristic clarify classify cling clumsy cohesive collapse coincide
collaborate combat commence commend commission commodity compact comparable
compensate competent compile complement comply compose comprise concede
conceive concentrate concept condemn condense conduct confer confine confirm
conflict conform confront congress conquer conscious consecutive consensus
conserve considerable consistent conspicuous constant constrain construct
consult consume contemplate contemporary contend context contract contradict
contrary contrast contribute controversy converge conversion convey convict
cordial corporate correspond corruption counsel criterion crucial crude
cultivate curb currency curriculum cynical debris decade decay deceive decent
decline dedicate deduce defect deficit definite degrade deliberate deliver
demand democracy demonstrate denote dense depart depend deposit deprive derive
descend deserve designate despise destination destine deteriorate detect deter
deteriorate devise devote dictate dimension diminish disability disable
disaster discern disclose discourage discriminate disintegrate dismiss
dispose dispute disregard dissolve distinct distort distribute disturb diverse
divert dominate donate dose draft dramatic drastic dread due dull duplicate
dwell dynamic earnest ease economical economy edit educate elaborate elapse
eligible eliminate elite embark emergency emigrate emphasis empirical enable
enclose encounter endeavor endorse endure enforce engage enhance enroll enroll
ensure enterprise entertainment enthusiasm entitle entrepreneur enumerate
equivalent erosion escape essence establish estate estimate ethical evaluate
evident evolution exaggerate examine exceed exception excess exclusive execute
exercise exert exhaust exhibit expand expel expenditure experiment expertise
exploit explosion expose extend extension extent exterior external extract
facilitate faculty fade faith fancy fascinate fatigue feasible feast federal
feeble feedback fertile fiction finance finite flexible fluctuate focus
foresee foster fraction fragment fragile frequent friction frontier frustrate
fulfill fundamental furnish furthermore gamble generous genius genuine gesture
glamour global gradual grateful gravity guarantee guideline guilty habitat
hazard headline heritage hesitate highlight horizon hostile household humble
identical identify ignorance illustrate imitate immigrant immune impact
implement implicit imply impose incentive incidence incline incorporate
indicate indifferent indispensable individual induce inevitable infect infer
inflation inflict influence inform inherent inherit inhibit initial initiative
inject injure innovation input inquire insight inspire install instance
instant instinct institute insult insurance integrate integrity intellectual
intense interact interfere interior interpret interrupt interval intervene
intimate invisible involve irony isolate issue jealous join journey junction
justify keen obtain humble carbon emission renewable climate transition
platform contractor municipal pedestrian commute density migrate inhabit
adapt suburb transport privacy consent disclose reputation monitor ethical
pension retirement dependent volunteer welfare healthcare fatigue workplace
psychology anxiety depression symptom therapy restore holistic consume
nutrition dietary obesity diabetes vitamin protein appetite preserve conserve
biodiversity degrade ecosystem pollution recycle contaminate hurricane urban
lifestyle resilience freedom""".split()

WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

# 功能词/常见虚词: 不算"考试重要度", 排序时压到末尾
STOPWORDS = """
the a an and or but if than so that this these those he she it we you they i
my your his her our their its me us them to of from in on at by for with
without as into upon within between during through under over across against
of off out up down is are was were be been being am do does did have has had
not no yes will would can could should shall may might must all any both each
every few many much more most other some such which who whom whose what when
where why how then now here there only just very also too about above after
before because though although while since until even still once again always
never ever therefore however thereupon therewith because etc   
""".split()


def stem(word):
    """Approximate the JS lookup so recurrence maps to the base word id."""
    w = word.lower()
    lib = LIB
    if w in lib:
        return w
    sl = []
    if w.endswith('ies'):
        sl.append(w[:-3] + 'y')
    if w.endswith('es'):
        sl.append(w[:-2])
    if w.endswith('s'):
        sl.append(w[:-1])
    if w.endswith('ed'):
        sl.append(w[:-2])
        sl.append(w[:-1])
    if w.endswith('ing') and len(w) > 4:
        sl.append(w[:-3])
        sl.append(w[:-3] + 'e')
    for t in sl:
        if t in lib:
            return t
    der = ['ment', 'tion', 'sion', 'ness', 'ity', 'er', 'or', 'ly', 'al', 'ous', 'ive', 'ance', 'ence', 'ure']
    for suf in der:
        if w.endswith(suf) and len(w) > len(suf) + 2:
            stem0 = w[:-len(suf)]
            for t in (stem0, stem0 + 'e', stem0[:-1] + 'i' if stem0.endswith('y') else stem0):
                if t in lib:
                    return t
    return None


def main():
    global LIB
    words = json.load(open(WORDS, encoding='utf-8'))
    data = json.load(open(ARTICLES, encoding='utf-8'))
    LIB = {w['word'] for w in words}

    occ = {w['word']: 0 for w in words}
    for a in data['articles']:
        for p in a['paragraphs']:
            for m in WORD_RE.finditer(p.lower()):
                base = stem(m.group(0))
                if base in occ:
                    occ[base] += 1

    extra = {w for w in EXTRA if w in LIB}
    scores = {}
    for w in words:
        s = occ[w['word']] * 25
        if w['word'] in extra:
            s += 40
        n = len(w['word'])
        s += 6 if n <= 5 else (3 if n <= 7 else 0)
        if w['word'] in STOPWORDS:
            s = min(s, 3)
        scores[w['word']] = s

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(scores, f, ensure_ascii=False)
    top = sorted(scores, key=lambda k: scores[k], reverse=True)[:20]
    print(f'wrote {len(scores)} scores -> {OUT}')
    print('top:', ', '.join(top))
    print('extra kept:', len(extra))


if __name__ == '__main__':
    main()
