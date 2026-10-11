"""Register new packs: python scripts/register.py <chapter-json-file>
JSON: {"packs":[{"id","import","boss":bool,"learn":{canDo,why,keyIdea}}], "chapter":{id,story,outcomes,why,payoff}}"""
import json,sys,re
d=json.load(open(sys.argv[1],encoding='utf8'))
def rw(p,f):
    s=open(p,encoding='utf8').read(); s=f(s); open(p,'w',encoding='utf8').write(s)
def esc(x): return json.dumps(x,ensure_ascii=False)
# learning
def learn(s):
    add=''
    for p in d['packs']:
        l=p['learn']
        add+=f'  {esc(p["id"])}: {{\n    canDo: {esc(l["canDo"])},\n    why: {esc(l["why"])},\n    keyIdea: {esc(l["keyIdea"])},\n  }},\n'
    i=s.index('};\n\nexport interface ChapterLearning')
    s=s[:i]+add+s[i:]
    if 'chapter' in d:
        c=d['chapter']
        blk=f'  {c["id"]}: {{\n    story: {esc(c["story"])},\n    outcomes: {esc(c["outcomes"])},\n    why: {esc(c["why"])},\n    payoff: {esc(c["payoff"])},\n  }},\n'
        j=s.index('};\n\nexport type SectionId')
        s=s[:j]+blk+s[j:]
    return s
rw('src/content/learning.ts',learn)
# graph status
def st(s):
    add=''.join(f'  {esc(p["id"])}: "built",\n' for p in d['packs'])
    i=s.index('};\n\nfunction chapterTrack')
    return s[:i]+add+s[i:]
rw('src/content/graph.ts',st)
# index
def idx(s):
    imps=''.join(f'import {p["import"]} from "./{p["id"]}";\n' for p in d['packs'])
    s=s.replace('\nexport const PACKS',imps+'\nexport const PACKS',1)
    concepts=[p['import'] for p in d['packs'] if not p.get('boss')]
    bosses=[p['import'] for p in d['packs'] if p.get('boss')]
    if concepts: s=re.sub(r'(export const PACKS: ConceptPack\[\] = \[[^\]]*)\]',lambda m:m.group(1)+', '+', '.join(concepts)+']',s,1)
    if bosses: s=re.sub(r'(export const BOSSES: BossPack\[\] = \[[^\]]*)\]',lambda m:m.group(1)+', '+', '.join(bosses)+']',s,1)
    return s
rw('src/content/packs/index.ts',idx)
print('registered',len(d['packs']))
