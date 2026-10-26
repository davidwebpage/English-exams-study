#!/usr/bin/env python3
"""Check whether comma-separated words are covered by the CET6 corpus tables.

Usage:
  python scripts/check_words.py between,although,infrastructure
"""
import re
import sys
from check_articles import load_tables, resolve


def main():
    words = []
    for chunk in sys.argv[1:]:
        words += [w.strip().lower() for w in chunk.replace('，', ',').split(',') if w.strip()]
    tables = load_tables()
    outlined = []
    for w in words:
        w2 = w[:-2] if w.endswith("'s") else w
        ok = resolve(w2, tables)
        print(f"{'OK' if ok else 'OUTLINE':8s} {w}")
        if not ok:
            outlined.append(w)
    print(f"\ncovered={len(words)-len(outlined)}/{len(words)}  outline={len(outlined)} -> {outlined}")


if __name__ == '__main__':
    main()
