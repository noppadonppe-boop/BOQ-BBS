"""Recover historical serialized root inputs only; hashes must prove any rebuilt file."""
import json,sqlite3,mmap,hashlib,time,sys
from pathlib import Path
root=Path('C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014')
known=json.loads((root/'live-selection.json').read_text())['projectId']
name='projects/demo-boq-v041/databases/(default)/documents/projects/'+known
members='--members' in sys.argv
db=sqlite3.connect('file:'+str(root/'objects.sqlite').replace('\\','/')+'?mode=ro',uri=True); f=(root/'firestore-60296.hprof').open('rb'); data=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
needle_text=name+'/members/' if members else name+'"'
needles=[(encoding,needle_text.encode(encoding)) for encoding in ('utf8','utf-16-le','utf-16-be')]
seen=set();documents={};scanned=0;started=time.time()
def walk(value):
    if isinstance(value,list):
        for child in value:walk(child)
    elif isinstance(value,dict):
        candidate=value.get('name','')
        if (candidate.startswith(name+'/members/') if members else candidate==name) and isinstance(value.get('fields'),dict):
            digest=hashlib.sha256(json.dumps(value['fields'],sort_keys=True,separators=(',',':')).encode()).hexdigest();documents[digest]=value
            return
        for child in value.values():walk(child)
for id,pos,length in db.execute('SELECT id,pos,len FROM objects WHERE kind=35 AND cls=8 AND len BETWEEN 200 AND 40000'):
    scanned+=1;raw=data[pos:pos+length]
    for encoding,needle in needles:
        if needle not in raw:continue
        digest=hashlib.sha256(raw).digest()
        if digest in seen:continue
        seen.add(digest)
        try:walk(json.loads(raw.decode(encoding)))
        except (UnicodeDecodeError,json.JSONDecodeError):pass
        break
    if scanned%1000000==0:print('Historical root scan arrays',scanned,'unique root versions',len(documents),flush=True)
(root/('retained-member-history.json' if members else 'retained-root-history.json')).write_text(json.dumps(list(documents.values()),ensure_ascii=False),encoding='utf8')
summary={'scannedByteArrays':scanned,'distinctRootFieldPayloads':len(documents),'versions':sorted({int(d['fields']['version']['integerValue']) for d in documents.values()}),'elapsedSeconds':round(time.time()-started,1),'currentStateAuthority':False,'originalDataWritten':False}
Path('output/full-data-recovery-verification/'+('member-history-results.json' if members else 'root-history-results.json')).write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
