#!/usr/bin/env python3
"""Merge data/parts/*.py into data/laws.json and validate it.
Run: python3 tools/build_laws.py
Each part exposes LAWS = [law(...), ...]. Source of truth for page numbers: the supplied PDF.
"""
import re, json, glob, importlib.util, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AR = re.compile(r'[\u0600-\u06FF]+(?:[ ][\u0600-\u06FF]+)*')

def fx(s):
    """Wrap Arabic runs in \\text{} so MathJax renders them as text."""
    return AR.sub(lambda m: '\\text{%s}' % m.group(0), s) if s else ''

def fxm(s):
    """Wrap Arabic runs found inside inline \\( ... \\) math of free text."""
    return re.sub(r'\\\((.*?)\\\)', lambda m: '\\(' + fx(m.group(1)) + '\\)', s)

def law(chapter, topic, title, pdf_page, formula='', rule='', variables=None,
        when='', keywords=None, example=None, kind='law'):
    return {
        'chapter': chapter, 'topic': topic, 'kind': kind, 'title': title,
        'formula': fx(formula), 'rule': rule,
        'variables': [{'symbol': a, 'meaning': b} for a, b in (variables or [])],
        'when_to_use': when, 'keywords': keywords or [],
        'example': {'question': fxm(example[0]), 'solution': fxm(example[1])} if example else None,
        'pdf_page': pdf_page, 'printed_page': pdf_page - 1, 'video_url': ''}

def load_parts():
    laws = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'data/parts/*.py'))):
        spec = importlib.util.spec_from_file_location('p', f)
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        laws += m.LAWS
    for i, l in enumerate(laws, 1):
        l['id'] = 'LAW_%03d' % i
    return [{'id': l.pop('id'), **l} for l in laws]

def validate(laws):
    errs, ids = [], set()
    for l in laws:
        if l['id'] in ids: errs.append('dup ' + l['id'])
        ids.add(l['id'])
        if not l['title']: errs.append(l['id'] + ' no title')
        if not l['formula'] and not l['rule']: errs.append(l['id'] + ' no formula/rule')
        if not 2 <= l['pdf_page'] <= 37: errs.append(l['id'] + ' bad page')
        if l['formula'].count('{') != l['formula'].count('}'): errs.append(l['id'] + ' brace mismatch')
        if l['video_url']: errs.append(l['id'] + ' video_url must be empty for now')
    return errs

if __name__ == '__main__':
    laws = load_parts()
    errs = validate(laws)
    if errs: print('\n'.join(errs)); sys.exit(1)
    with open(os.path.join(ROOT, 'data/laws.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'source': 'ملخص قوانين المعاصر 11', 'laws': laws}, f, ensure_ascii=False, indent=2)
    print('OK', len(laws), 'laws')
