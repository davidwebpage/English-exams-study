#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 离线建库: batch-generate CET6-style articles into data/articles.json.

Generation runs ONCE offline; the deployed site never calls the model, it only
reads the built JSON (zero token at runtime). Works with any OpenAI-compatible
/chat/completions endpoint (DashScope Qwen, OpenAI, ...) via env vars.

Usage:
  export LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
  export LLM_API_KEY=sk-...
  export LLM_MODEL=qwen3-30b-a3b          # optional, default qwen3-8b
  python scripts/build_corpus.py --count 40
  python scripts/build_corpus.py --count 40 --topics '科技与人工智能,老龄化社会'
"""
import argparse
import hashlib
import json
import os
import random
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORDS = os.path.join(ROOT, 'data', 'words.json')
ARTICLES = os.path.join(ROOT, 'data', 'articles.json')
BASE_URL = os.environ.get('LLM_BASE_URL')
API_KEY = os.environ.get('LLM_API_KEY')
MODEL = os.environ.get('LLM_MODEL', 'qwen3-8b')

TOPICS = ["科技与人工智能","自动化与就业","老龄化社会","城市化与智慧城市","教育与在线学习",
          "心理健康与压力","睡眠与健康","饮食与营养","运动与久坐","环境与气候变化","能源转型",
          "全球化","零工经济","社交媒体影响","语言学习与文化","媒体素养与假新闻","消费主义与广告",
          "交通与新能源车","科技伦理与隐私","家庭结构变化"]

# 主题 -> 推荐种子词（都在 六级词表内, 已在入库时对词库过滤兜底）
TOPIC_WORDS = {
 "科技与人工智能": ["artificial", "circuit", "compute", "device", "digital", "disrupt", "innovation", "logical", "operate", "screen", "software", "transmit", "virtual"],
 "自动化与就业": ["assembly", "competent", "displace", "earn", "efficiency", "enterprise", "incentive", "mechanic", "occupation", "productivity", "redundant", "skilled"],
 "老龄化社会": ["age", "decline", "dependent", "elder", "generation", "grant", "lonely", "nurse", "pension", "retire", "senior", "volunteer", "welfare"],
 "城市化与智慧城市": ["adapt", "commute", "density", "inhabit", "migrate", "municipal", "pedestrian", "suburb", "transport"],
 "教育与在线学习": ["assess", "classroom", "criterion", "curriculum", "diligent", "discipline", "enroll", "intellect", "lecture", "literacy", "qualification", "scholarship", "seminar", "tuition", "vocational"],
 "心理健康与压力": ["anxiety", "anxious", "depression", "distress", "endure", "fatigue", "mood", "occupation", "overwhelm", "psychological", "stress", "symptom", "therapy"],
 "睡眠与健康": ["dawn", "deprive", "dream", "energy", "fatigue", "hazard", "moderate", "mood", "night", "recover", "refresh", "regime", "regular", "relax", "remedy", "rest", "routine", "schedule", "symptom"],
 "饮食与营养": ["appetite", "cereal", "desert", "diet", "digest", "feast", "hunger", "moderate", "oil", "portion", "protein", "quantity", "recipe", "salt", "season", "sugar", "vitamin"],
 "运动与久坐": ["athlete", "breath", "daily", "endurance", "exercise", "flexible", "frequency", "gradual", "intensity", "joint", "muscle", "routine", "strength", "stretch", "train"],
 "环境与气候变化": ["carbon", "climate", "conservation", "contaminate", "finite", "harsh", "pollution", "preserve", "recycle"],
 "能源转型": ["alternative", "consumption", "efficiency", "electric", "generation", "intermittent", "pipeline", "reliance", "reserve", "solar", "storage", "subsidy", "transition"],
 "全球化": ["boundary", "citizen", "converge", "exceed", "export", "import", "prosperity", "ratio", "supply", "tariff", "transaction"],
 "零工经济": ["agreement", "arrangement", "bonus", "casual", "commission", "contract", "duration", "earn", "income", "overtime", "platform", "shift", "temporary", "wage"],
 "社交媒体影响": ["attention", "audience", "broadcast", "distract", "engage", "feedback", "filter", "habit", "impulse", "screen", "virtual"],
 "语言学习与文化": ["accent", "acquisition", "custom", "grammar", "heritage", "identity", "proficiency", "pronunciation", "translation", "vocabulary"],
 "媒体素养与假新闻": ["bias", "circulate", "discern", "editorial", "exaggerate", "fabricate", "journalist", "propaganda", "scrutiny", "verify"],
 "消费主义与广告": ["advertise", "bargain", "commodity", "consumer", "debt", "durable", "expenditure", "luxury", "tempt"],
 "交通与新能源车": ["battery", "convenience", "electric", "fleet", "fuel", "pollution", "subsidy", "traffic", "transit", "vehicle"],
 "科技伦理与隐私": ["authentic", "autonomy", "consensus", "consent", "disclose", "monitor", "privacy", "reputation", "transparent"],
 "家庭结构变化": ["adopt", "bond", "divorce", "domestic", "family", "guardian", "household", "marriage", "nuclear", "unite"],
}
COMMON = set("""
the a an and or but if then so that this these those he she it we you they i
of in on at by for with without from to as up down over under out off
is are was were be been being am do does did have has had can could should
would will shall may might must not no yes very just about around between
through during before after while when where why how what which who whom whose
""".split())

_LIB = None
def get_lib():
    global _LIB
    if _LIB is None:
        with open(WORDS, encoding='utf-8') as f:
            _LIB = {w['word'] for w in json.load(f)}
    return _LIB


def call_llm(messages):
    if not (BASE_URL and API_KEY):
        raise SystemExit('缺少 LLM_BASE_URL / LLM_API_KEY 环境变量')
    body = json.dumps({"model": MODEL, "messages": messages, "temperature": 0.7}).encode()
    req = urllib.request.Request(BASE_URL.rstrip('/') + '/chat/completions', data=body,
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())['choices'][0]['message']['content']


def split_paragraphs(text):
    lines = [ln.strip() for ln in re.split(r'\n\s*\n|\n', text)]
    return [ln for ln in lines if ln]


def validate(article, target_words):
    reasons = []
    full = '\n'.join(article['paragraphs'])
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", full.lower())
    wc = len(words)
    if not (300 <= wc <= 450):
        reasons.append(f'长度 {wc} 超出 300-450')
    if not (4 <= len(article['paragraphs']) <= 6):
        reasons.append(f'段落数 {len(article["paragraphs"])} 不在 4-6')
    hit = sum(1 for t in target_words if t in words)
    if hit < max(1, len(target_words) * 0.4):
        reasons.append(f'目标词命中率 {hit}/{len(target_words)} 低于 40%')
    lib = get_lib()
    hard = [w for w in words if len(w) >= 8 and w not in lib and w not in COMMON]
    report = {'wordCount': wc, 'paragraphs': len(article['paragraphs']),
              'targetHits': hit, 'targetCount': len(target_words),
              'hardTokensTentative': len(hard)}
    return (not reasons, reasons, report)


def pick_targets(topic, lib):
    seed = TOPIC_WORDS.get(topic, [])
    curated = [w for w in seed if w in lib]
    if len(curated) >= 16:
        return curated[:16]
    # top up from the library to 16 targets
    pool = [w['word'] for w in json.load(open(WORDS, encoding='utf-8')) if w['word'] not in curated]
    random.shuffle(pool)
    return (curated + [w for w in pool if w in lib])[:16]


def build(topic, targets):
    prompt = (
        f"Write an expository essay of 320-430 English words about: {topic}.\n"
        "Style: formal academic, similar to CET-6 reading passages. Structure: state the issue, "
        "analyze causes/evidence, discuss impact, give a measured conclusion.\n"
        "Requirements:\n"
        f"- Use each of these words at least once (exact spelling or base form): {', '.join(targets)}\n"
        "- Keep difficulty around CET-6; do not use rare advanced vocabulary.\n"
        "- 4-5 short paragraphs separated by blank lines. No bullets, no title, no headings.\n"
        "- Write original prose; never quote existing passages.")
    sys_prompt = ("You are a careful English writer producing CET-6 reading practice passages. "
                  "Output only the essay text.")
    text = call_llm([{"role": "system", "content": sys_prompt},
                     {"role": "user", "content": prompt}])
    pars = split_paragraphs(text)
    if not pars:
        raise ValueError('empty model output')
    article = {
        "id": "gen_" + hashlib.sha1((topic + text).encode()).hexdigest()[:6],
        "title": re.sub(r'^[#*\-.\s]+', '', pars[0])[:80],
        "topic": topic, "level": "CET6", "words": 4,
        "coreWords": targets, "paragraphs": pars,
    }
    ok, reasons, report = validate(article, targets)
    return article, ok, reasons, report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--count', type=int, default=40)
    ap.add_argument('--topics', default='')
    ap.add_argument('--seed', type=int, default=0)
    args = ap.parse_args()
    if args.seed:
        random.seed(args.seed)

    list_topics = [t for t in (x.strip() for x in args.topics.split(',')) if t] or TOPICS
    corpus = json.load(open(ARTICLES, encoding='utf-8'))['articles']
    used = {a['id'] for a in corpus}
    lib = get_lib()
    made = skipped = 0
    batches = 0
    while made < args.count and batches < args.count * 4:
        batches += 1
        topic = list_topics[batches % len(list_topics)]
        targets = pick_targets(topic, lib)
        try:
            art, ok, reasons, report = build(topic, targets)
        except Exception as e:
            skipped += 1
            print(f'skip: {e}')
            continue
        if ok and art['id'] not in used:
            corpus.append(art); used.add(art['id']); made += 1
            print(f"[{made}] {art['id']} {topic} {report}")
        else:
            skipped += 1
            print(f"skip: {reasons}")

    json.dump({'articles': corpus}, open(ARTICLES, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'done: generated {made}, skipped {skipped}; total {len(corpus)} articles -> data/articles.json')


if __name__ == '__main__':
    main()
