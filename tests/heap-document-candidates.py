"""Readonly HPROF byte-array scan. Candidate history is NEVER active restored data."""
import gzip,struct,json,re,hashlib,time
from pathlib import Path
from collections import Counter
root=Path('C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014')
source=root/'firestore-60296.hprof.gz';out=root/'candidate-scan';out.mkdir(exist_ok=True)
types={2:None,4:1,5:2,6:4,7:8,8:1,9:2,10:4,11:8}
counts=Counter();candidates={};samples=[];started=time.time()
def walk(value,oid):
 if isinstance(value,list):
  for child in value:walk(child,oid)
 elif isinstance(value,dict):
  name=value.get('name')
  if isinstance(name,str) and re.fullmatch(r'projects/[^/]+/databases/\(default\)/documents/.+',name) and isinstance(value.get('fields'),dict):
   counts['documentOccurrences']+=1;timestamp=value.get('updateTime','');old=candidates.get(name)
   if old is None or timestamp>old['document'].get('updateTime',''):candidates[name]={'document':value,'heapArrayId':hex(oid),'basis':'Retained serialized message; current state/completeness UNPROVEN'}
  if 'documentDelete'in value or 'documentRemove'in value:counts['deleteOrRemoveMessages']+=1
  for child in value.values():walk(child,oid)
def inspect(data,oid):
 if not data:return
 counts['byteArrays']+=1
 if b'/documents/'in data:counts['arraysWithDocumentPath']+=1
 if len(samples)<20 and b'/documents/'in data:
  samples.append({'arrayId':hex(oid),'bytes':len(data),'startsJson':data.lstrip()[:1]in(b'{',b'['),'hasDocumentChange':b'documentChange'in data,'hasFieldsJson':b'"fields"'in data,'hasUpdateTime':b'updateTime'in data})
 for encoding,needle in [('utf8',b'/documents/'),('utf-16-le','/documents/'.encode('utf-16-le')),('utf-16-be','/documents/'.encode('utf-16-be'))]:
  if needle not in data:continue
  try:
   text=data.decode(encoding)
   if text.lstrip()[:1]not in ('{','['):continue
   walk(json.loads(text),oid);counts['parsedJsonArrays-'+encoding]+=1
  except (UnicodeDecodeError,json.JSONDecodeError):counts['nonJsonDocumentArrays-'+encoding]+=1
with gzip.open(source,'rb') as f:
 header=bytearray()
 while True:
  b=f.read(1)
  if b==b'\0':break
  if not b:raise ValueError('Truncated header')
  header+=b
 ids=struct.unpack('>I',f.read(4))[0];f.read(8);types[2]=ids
 def read(n):
  b=f.read(n)
  if len(b)!=n:raise ValueError('Truncated record')
  return b
 def skip(n):
  while n:chunk=min(n,1048576);read(chunk);n-=chunk
 def u1():return read(1)[0]
 def u2():return struct.unpack('>H',read(2))[0]
 def u4():return struct.unpack('>I',read(4))[0]
 def oid():return int.from_bytes(read(ids),'big')
 while True:
  b=f.read(1)
  if not b:break
  tag=b[0];read(4);length=u4();end=f.tell()+length
  if tag not in(0x0c,0x1c):skip(length);continue
  while f.tell()<end:
   t=u1();counts['heapRecords']+=1
   if t in(0xff,0x05,0x07):skip(ids)
   elif t==0x01:skip(2*ids)
   elif t in(0x02,0x03,0x08):skip(ids+8)
   elif t in(0x04,0x06):skip(ids+4)
   elif t==0x20:
    skip(ids+4+6*ids+4)
    for _ in range(u2()):skip(2);kind=u1();skip(types[kind])
    for _ in range(u2()):skip(ids);kind=u1();skip(types[kind])
    skip(u2()*(ids+1))
   elif t==0x21:skip(ids+4+ids);skip(u4())
   elif t==0x22:skip(ids+4);n=u4();skip(ids+n*ids)
   elif t==0x23:
    idvalue=oid();skip(4);n=u4();kind=u1();size=n*types[kind]
    if kind==8 and size<=16777216:inspect(read(size),idvalue)
    else:skip(size)
   else:raise ValueError(f'Unknown heap record {t:x} at{f.tell()}')
  if f.tell()!=end:raise ValueError('Segment boundary mismatch')
  if counts['heapRecords']%100000<1000:print('Scanned',counts['heapRecords'],'records;',len(candidates),'candidate documents',flush=True)
for i,(name,value)in enumerate(sorted(candidates.items())):
 (out/f'doc-{i:06}.json').write_text(json.dumps(value,ensure_ascii=False),encoding='utf8')
summary={'sourceBytes':source.stat().st_size,'format':header.decode(),'idSize':ids,'elapsedSeconds':round(time.time()-started,1),'counts':dict(counts),'uniqueCandidateDocuments':len(candidates),'arraySamples':samples,'restorationComplete':False,'activeDataWritten':False}
(out/'scan-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in summary.items() if k!='arraySamples'}),flush=True)
