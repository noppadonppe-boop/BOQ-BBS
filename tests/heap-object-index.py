"""Private readonly heap index for inspecting live datastore objects, not message history."""
import gzip, shutil, json, struct, mmap, sqlite3, time, argparse
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--root');parser.add_argument('--stem',default='firestore-60296');parser.add_argument('--output')
args=parser.parse_args()
if args.root and not args.output:parser.error('A new private source requires a separate output directory')
root=Path(args.root or 'C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014')
assert '/' not in args.stem and '\\' not in args.stem
output=Path(args.output or 'output/data-recovery-verification');output.mkdir(parents=True,exist_ok=True)
source=root/(args.stem+'.hprof.gz'); raw=root/(args.stem+'.hprof')
if not raw.exists():
    staging=root/(args.stem+'.hprof.partial')
    with gzip.open(source,'rb') as src, staging.open('wb') as dst: shutil.copyfileobj(src,dst,4*1024*1024)
    staging.rename(raw)
    print('Preserved uncompressed private snapshot',raw.stat().st_size,'bytes',flush=True)
db=sqlite3.connect(root/'objects.sqlite'); db.execute('PRAGMA journal_mode=OFF');db.execute('PRAGMA synchronous=OFF')
db.execute('CREATE TABLE IF NOT EXISTS objects (id INTEGER PRIMARY KEY,kind INTEGER,cls INTEGER,pos INTEGER,len INTEGER)')
if db.execute('SELECT COUNT(*) FROM objects').fetchone()[0]: raise ValueError('Existing index: do not overwrite')
names={};loaded={};classes={};batch=[];count=0;started=time.time()
with raw.open('rb') as f, mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as data:
    p=data.find(b'\0')+1; ids=struct.unpack_from('>I',data,p)[0];p+=12
    sizes={2:ids,4:1,5:2,6:4,7:8,8:1,9:2,10:4,11:8}
    def read(n):
        global p
        value=data[p:p+n];p+=n;return value
    def u1():return read(1)[0]
    def u2():return int.from_bytes(read(2),'big')
    def u4():return int.from_bytes(read(4),'big')
    def oid():return int.from_bytes(read(ids),'big')
    def keep(id,kind,cls,pos,length):
        global count
        batch.append((id,kind,cls,pos,length));count+=1
        if len(batch)>=20000:db.executemany('INSERT INTO objects VALUES (?,?,?,?,?)',batch);batch.clear()
    while p<len(data):
        tag=u1();p+=4;length=u4();end=p+length
        if tag==1:
            id=oid();names[id]=read(end-p).decode('utf8','replace')
        elif tag==2:
            p+=4;cid=oid();p+=4;loaded[cid]=oid()
        elif tag in (0x0c,0x1c):
            while p<end:
                t=u1()
                if t in (0xff,0x05,0x07):p+=ids
                elif t==1:p+=2*ids
                elif t in (2,3,8):p+=ids+8
                elif t in (4,6):p+=ids+4
                elif t==0x20:
                    cid=oid();p+=4;superid=oid();p+=5*ids+4
                    for _ in range(u2()):p+=2;kind=u1();p+=sizes[kind]
                    static=[]
                    for _ in range(u2()):
                        fid=oid();kind=u1();value=read(sizes[kind]);static.append([fid,kind,value.hex()])
                    fields=[]
                    for _ in range(u2()):fields.append([oid(),u1()])
                    classes[cid]={'super':superid,'fields':fields,'static':static}
                elif t==0x21:
                    id=oid();p+=4;cid=oid();n=u4();cname=names.get(loaded.get(cid),'')
                    useful=(cname=='java/lang/String' or cname.startswith('java/util/') or cname.startswith('com/google/common/collect/') or cname.startswith('com/google/cloud/datastore/core/rep/') or cname.startswith('com/google/cloud/datastore/emulator/impl/storage/') or cname.startswith('com/google/protobuf/Timestamp') or cname.startswith('java/time/'))
                    if useful:keep(id,t,cid,p,n)
                    p+=n
                elif t==0x22:
                    id=oid();p+=4;n=u4();cid=oid();keep(id,t,cid,p,n*ids);p+=n*ids
                elif t==0x23:
                    id=oid();p+=4;n=u4();kind=u1();n*=sizes[kind]
                    if n<=1048576:keep(id,t,kind,p,n)
                    p+=n
                else:raise ValueError(f'Unknown heap tag {t:x}')
            if p!=end:raise ValueError('Heap segment boundary mismatch')
        else:p=end
        if count//2000000>getattr(keep,'reported',0):
            keep.reported=count//2000000;print('Indexed',count,'objects',flush=True)
db.executemany('INSERT INTO objects VALUES (?,?,?,?,?)',batch);db.commit();db.close()
for cid,value in classes.items():
    value['name']=names.get(loaded.get(cid),'')
    value['fields']=[[names.get(fid,str(fid)),kind] for fid,kind in value['fields']]
    value['static']=[[names.get(fid,str(fid)),kind,hexval] for fid,kind,hexval in value['static']]
(root/'classes.json').write_text(json.dumps(classes),encoding='utf8')
schema={v['name']:v for v in classes.values() if 'AutoValue_Entity' in v['name'] or 'AutoValue_StoredEntity' in v['name'] or 'StoredEntity$History' in v['name']}
(output/'object-schema.json').write_text(json.dumps(schema,indent=2),encoding='utf8')
print(json.dumps({'indexedObjects':count,'elapsedSeconds':round(time.time()-started,1),'privateIndexBytes':(root/'objects.sqlite').stat().st_size}),flush=True)
