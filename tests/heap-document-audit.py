"""Readonly HPROF scan. Retained messages are never authoritative restored data."""
import gzip, struct, json, re, hashlib, time
from pathlib import Path
from collections import Counter
from functools import lru_cache

root = Path('C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014')
source = root/'firestore-60296.hprof.gz'
out = root/'candidate-scan-v2'
out.mkdir(exist_ok=True)
source_sha = 'ab668d48309558297bd33b106777fa2ea0c8ac043b591306428f4b0f4d7779d3'
types = {2:None,4:1,5:2,6:4,7:8,8:1,9:2,10:4,11:8}
counts = Counter(); candidates = {}; versions = {}; deletes = {}; removals = Counter(); started = time.time()

def timestamp_key(value):
    if not value: return ''
    match = re.fullmatch(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z',value)
    if not match: raise ValueError('Unrecognized timestamp')
    return match[1]+'.'+(match[2] or '').ljust(9,'0')+'Z'

def provenance(oid,encoding): return {'heapArrayId':hex(oid),'encoding':encoding}

def walk(value,oid,encoding):
    if isinstance(value,list):
        for child in value: walk(child,oid,encoding)
    elif isinstance(value,dict):
        name = value.get('name')
        if isinstance(name,str) and re.fullmatch(r'projects/[^/]+/databases/\(default\)/documents/.+',name) and isinstance(value.get('fields'),dict):
            counts['documentOccurrences'] += 1
            stamp = timestamp_key(value.get('updateTime','')); old = candidates.get(name)
            digest = hashlib.sha256(json.dumps(value['fields'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
            versions.setdefault(name,{}).setdefault(stamp,{}).setdefault(digest,{'occurrences':0,**provenance(oid,encoding)})['occurrences'] += 1
            if old is None or stamp > timestamp_key(old['document'].get('updateTime','')):
                candidates[name] = {'document':value,**provenance(oid,encoding),'fieldsSha256':digest,'snapshotSha256':source_sha,'basis':'Retained serialized message; current state/completeness UNPROVEN'}
            return
        for kind in ('documentDelete','documentRemove'):
            event = value.get(kind)
            if isinstance(event,dict) and isinstance(event.get('document'),str):
                counts[kind] += 1
                if kind == 'documentDelete':
                    name = event['document']; stamp = timestamp_key(event.get('readTime',''))
                    deletes.setdefault(name,{}).setdefault(stamp,{'occurrences':0,**provenance(oid,encoding)})['occurrences'] += 1
                else: removals[event['document']] += 1
        for child in value.values(): walk(child,oid,encoding)

@lru_cache(maxsize=20000)
def parse_payload(data,encoding): return json.loads(data.decode(encoding))

def inspect(data,oid):
    if not data: return
    counts['byteArrays'] += 1
    for encoding,needle in [('utf8',b'/documents/'),('utf-16-le','/documents/'.encode('utf-16-le')),('utf-16-be','/documents/'.encode('utf-16-be'))]:
        if needle not in data: continue
        try:
            text = data.decode(encoding)
            if text.lstrip()[:1] not in ('{','['): continue
            walk(parse_payload(data,encoding),oid,encoding)
            counts['parsedJsonArrays-'+encoding] += 1
        except (UnicodeDecodeError,json.JSONDecodeError): counts['nonJsonDocumentArrays-'+encoding] += 1

with gzip.open(source,'rb') as f:
    header = bytearray()
    while True:
        b = f.read(1)
        if b == b'\0': break
        if not b: raise ValueError('Truncated header')
        header += b
    ids = struct.unpack('>I',f.read(4))[0]; f.read(8); types[2] = ids
    def read(n):
        b = f.read(n)
        if len(b) != n: raise ValueError('Truncated record')
        return b
    def skip(n):
        while n:
            chunk = min(n,1048576); read(chunk); n -= chunk
    def u1(): return read(1)[0]
    def u2(): return struct.unpack('>H',read(2))[0]
    def u4(): return struct.unpack('>I',read(4))[0]
    def oid(): return int.from_bytes(read(ids),'big')
    while True:
        b = f.read(1)
        if not b: break
        tag = b[0]; read(4); length = u4(); end = f.tell()+length
        if tag not in (0x0c,0x1c): skip(length); continue
        while f.tell() < end:
            t = u1(); counts['heapRecords'] += 1
            if t in (0xff,0x05,0x07): skip(ids)
            elif t == 0x01: skip(2*ids)
            elif t in (0x02,0x03,0x08): skip(ids+8)
            elif t in (0x04,0x06): skip(ids+4)
            elif t == 0x20:
                skip(ids+4+6*ids+4)
                for _ in range(u2()): skip(2); kind = u1(); skip(types[kind])
                for _ in range(u2()): skip(ids); kind = u1(); skip(types[kind])
                skip(u2()*(ids+1))
            elif t == 0x21: skip(ids+4+ids); skip(u4())
            elif t == 0x22: skip(ids+4); n = u4(); skip(ids+n*ids)
            elif t == 0x23:
                idvalue = oid(); skip(4); n = u4(); kind = u1(); size = n*types[kind]
                if kind == 8 and size <= 16777216: inspect(read(size),idvalue)
                else: skip(size)
            else: raise ValueError(f'Unknown heap record {t:x} at {f.tell()}')
        if f.tell() != end: raise ValueError('Segment boundary mismatch')
        if counts['heapRecords']//5000000 > counts.get('lastProgress',0):
            counts['lastProgress'] = counts['heapRecords']//5000000
            print('Scanned',counts['heapRecords'],'records;',len(candidates),'candidate documents',flush=True)

index = []
for i,(name,value) in enumerate(sorted(candidates.items())):
    stamp = timestamp_key(value['document'].get('updateTime','')); delete_times = deletes.get(name,{})
    conflict = len(versions[name][stamp]) > 1
    deleted = any(not t or not stamp or t >= stamp for t in delete_times)
    value.update({'latestTimestampConflict':conflict,'hasUpdateTime':bool(stamp),'deleteAfterOrAtCandidate':deleted,'tombstones':delete_times,'observedVersions':versions[name]})
    filename = f'doc-{i:06}.json'
    (out/filename).write_text(json.dumps(value,ensure_ascii=False),encoding='utf8')
    index.append({'name':name,'file':filename,'updateTime':value['document'].get('updateTime'),'fieldsSha256':value['fieldsSha256'],'conflict':conflict,'deletedOrUncertain':deleted,'hasUpdateTime':bool(stamp)})
(out/'index.json').write_text(json.dumps(index,ensure_ascii=False),encoding='utf8')
(out/'tombstones.json').write_text(json.dumps({'documentDelete':deletes,'documentRemoveIsNotDeletion':dict(removals)},ensure_ascii=False),encoding='utf8')
summary = {'sourceBytes':source.stat().st_size,'snapshotSha256':source_sha,'format':header.decode(),'idSize':ids,'elapsedSeconds':round(time.time()-started,1),'counts':dict(counts),'uniqueCandidateDocuments':len(candidates),'latestTimestampConflicts':sum(r['conflict'] for r in index),'missingUpdateTimes':sum(not r['hasUpdateTime'] for r in index),'deletedOrUncertainCandidates':sum(r['deletedOrUncertain'] for r in index),'deleteDocumentNames':len(deletes),'removeDocumentNames':len(removals),'restorationComplete':False,'activeDataWritten':False}
(out/'scan-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print(json.dumps(summary),flush=True)
