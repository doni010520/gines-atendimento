#!/usr/bin/env python3
"""Coleta Serper /shopping — Arthi. Uso: SERPER_KEY=... python3 serp_run.py queries_todo.json res_serper.json [limite]
Retoma do checkpoint; para no primeiro erro de crédito/autenticação (401/402/403)."""
import json,os,sys,time,re,requests
from concurrent.futures import ThreadPoolExecutor
key=os.environ['SERPER_KEY']; qf,of=sys.argv[1],sys.argv[2]; lim=int(sys.argv[3]) if len(sys.argv)>3 else 10**9
Q=json.load(open(qf)); out=json.load(open(of)) if os.path.exists(of) else {}
todo=[x for x in Q if str(x['i']) not in out][:lim]
def price(s):
    if isinstance(s,(int,float)): return float(s)
    m=re.search(r'([\d\.]+,\d{2})',s or ''); return float(m.group(1).replace('.','').replace(',','.')) if m else None
stop=False
def run(x):
    global stop
    if stop: return
    for t in range(4):
        try:
            r=requests.post('https://google.serper.dev/shopping',headers={'X-API-KEY':key,'Content-Type':'application/json'},json={'q':x['q'],'gl':'br','hl':'pt-br','location':'Brazil','num':20},timeout=30)
            if r.status_code in (401,402,403) or (r.status_code==400 and "credit" in r.text.lower()): stop=True; print('PARADO',r.status_code,r.text[:120]); return
            if r.status_code==429: time.sleep(2+2*t); continue
            r.raise_for_status(); d=r.json()
            out[str(x['i'])]=[[s.get('title','')[:110],price(s.get('price')),(s.get('source') or '')[:30],s.get('rating'),s.get('ratingCount')] for s in d.get('shopping',[]) if price(s.get('price'))]
            return
        except Exception as e: time.sleep(2)
with ThreadPoolExecutor(4) as ex:
    for n,_ in enumerate(ex.map(run,todo)):
        if n%50==0: json.dump(out,open(of,'w'),ensure_ascii=False); print(n,len(out))
json.dump(out,open(of,'w'),ensure_ascii=False); print('fim',len(out),'de',len(Q))
