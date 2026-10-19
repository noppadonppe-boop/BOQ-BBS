"""Readonly traversal anchored to the emulator's actual datastore map."""
import json,sqlite3,mmap,struct,datetime,hashlib,sys,argparse
from pathlib import Path
from functools import lru_cache
from dataclasses import dataclass
parser=argparse.ArgumentParser()
parser.add_argument('--root');parser.add_argument('--stem',default='firestore-60296');parser.add_argument('--output');parser.add_argument('--all',action='store_true')
args=parser.parse_args()
if args.root and not args.output:parser.error('A new private source requires a separate output directory')
root=Path(args.root or 'C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014')
assert '/' not in args.stem and '\\' not in args.stem
full=args.all
output=Path(args.output or ('output/full-data-recovery-verification' if full else 'output/data-recovery-verification'));output.mkdir(parents=True,exist_ok=True)
with (root/(args.stem+'.hprof.gz')).open('rb') as source:
    source_sha=hashlib.file_digest(source,'sha256').hexdigest()
classes={int(k):v for k,v in json.loads((root/'classes.json').read_text()).items()}
db=sqlite3.connect('file:'+str(root/'objects.sqlite').replace('\\','/')+'?mode=ro',uri=True)
f=(root/(args.stem+'.hprof')).open('rb'); data=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
@dataclass(frozen=True)
class Ref:id:int
@lru_cache(maxsize=100000)
def object_at(ref):
    row=db.execute('SELECT kind,cls,pos,len FROM objects WHERE id=?',(ref.id,)).fetchone()
    if not row:raise ValueError('Missing referenced heap object')
    kind,cls,pos,n=row
    if kind==0x22:return ('array',[Ref(int.from_bytes(data[p:p+8],'big')) for p in range(pos,pos+n,8)])
    if kind==0x23:return ('bytes',data[pos:pos+n])
    values={};current=cls;cursor=pos
    while current:
        definition=classes[current]
        for name,t in definition['fields']:
            size={2:8,4:1,5:2,6:4,7:8,8:1,9:2,10:4,11:8}[t];raw=data[cursor:cursor+size];cursor+=size
            value=Ref(int.from_bytes(raw,'big')) if t==2 else struct.unpack({4:'>?',5:'>H',6:'>f',7:'>d',8:'>b',9:'>h',10:'>i',11:'>q'}[t],raw)[0]
            values[name]=value
        current=definition['super']
    if cursor!=pos+n:raise ValueError('Instance layout mismatch '+classes[cls]['name'])
    return (classes[cls]['name'],values)
def deref(ref):return object_at(ref)[1]
def string(ref):
    if not ref.id:return None
    name,v=object_at(ref)
    if name!='java/lang/String':raise ValueError('Expected String, got '+name)
    return deref(v['value']).decode('latin1' if v['coder']==0 else 'utf-16-le')
def elements(ref):
    name,v=object_at(ref)
    if name=='array':return v
    if 'RegularImmutableList' in name:return elements(v['array'])[:v.get('size',len(elements(v['array'])))]
    if 'SingletonImmutableList' in name:return [v['element']]
    if 'ImmutableSortedSet' in name:return elements(v['elements'])
    raise ValueError('Unsupported list '+name)
def entries(ref):
    name,v=object_at(ref)
    if 'RegularImmutableMap' in name:
        return [(deref(item)['key'],deref(item)['value']) for item in elements(v['entries']) if item.id]
    if 'SingletonImmutableBiMap' in name:return [(v['singleKey'],v['singleValue'])]
    if name in ('java/util/HashMap','java/util/LinkedHashMap','java/util/concurrent/ConcurrentHashMap'):
        if not v['table'].id:return []
        result=[]
        for item in elements(v['table']):
            while item.id:
                node=deref(item);result.append((node['key'],node.get('val',node.get('value'))));item=node['next']
        return result
    raise ValueError('Unsupported map '+name)
def ref_path(ref):
    value=deref(ref);path=deref(value['path'])
    return [part for item in elements(path['elements']) for part in [string(deref(item)['collectionId']),string(deref(item)['string'])]]
selected_names=('AutoValue_EntityRef','AutoValue_PartitionRef','AutoValue_DatabaseRef','AutoValue_Path','AutoValue_StringPathElement','FlatLocalEntityStore','History','Value','Instant')
schema={v['name']:v for v in classes.values() if any(v['name'].endswith(x) for x in selected_names) or '/rep/values/' in v['name']}
(output/'live-object-schema.json').write_text(json.dumps(schema,indent=2))
store_class=next(k for k,v in classes.items() if v['name']=='com/google/cloud/datastore/emulator/impl/storage/FlatLocalEntityStore')
stores=db.execute('SELECT id FROM objects WHERE cls=?',(store_class,)).fetchall();assert len(stores)==1
store=Ref(stores[0][0]);rows=entries(deref(store)['rows'])
print(json.dumps({'datastoreAnchors':len(stores),'liveRows':len(rows),'storeFields':list(deref(store)), 'firstRefFields':list(deref(rows[0][0])),'pathFields':list(deref(deref(rows[0][0])['path'])),'firstPathElementFields':list(deref(elements(deref(deref(rows[0][0])['path'])['elements'])[0]))}))
(root/'live-row-references.json').write_text(json.dumps({'store':store.id,'rows':[[k.id,v.id] for k,v in rows]}))

def instant(ref):
    v=deref(ref);return (v['seconds'],v['nanos'])
def iso(stamp):
    return datetime.datetime.fromtimestamp(stamp[0],datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')+f'.{stamp[1]:09d}Z'
def field_value(ref):
    name,v=object_at(ref);short=name.rsplit('/',1)[-1]
    if short=='WrappedValue':return field_value(v['nested'])
    if short=='StringValue':return {'stringValue':string(v['value'])}
    if short=='MapValue':return {'mapValue':{'fields':{string(k):field_value(x) for k,x in entries(v['value'])}}}
    if short=='ArrayValue':return {'arrayValue':{'values':[field_value(x) for x in elements(v['value'])]}}
    if short=='AutoValue_LongValue':return {'integerValue':str(v['value'])}
    if short=='AutoValue_DoubleValue':return {'doubleValue':v['value']}
    if short=='BooleanValue':return {'booleanValue':v['value']}
    if short=='NullValue':return {'nullValue':None}
    if short=='AutoValue_TimestampValue':return {'timestampValue':iso((v['seconds'],v['nanos']))}
    raise ValueError('Unsupported datastore value '+name)
selection=root/'candidate-scan-v2/diagnostic-selection.json'
known=json.loads(selection.read_text(encoding='utf8'))['projectId'] if selection.exists() else None
if not full and not known:raise ValueError('Selected-project inspection requires an explicit existing diagnostic selection')
selected=[];deleted=0;deleted_names=[];covered=0;sample_revision_counts=[]
for key,history in rows:
    parts=ref_path(key)
    if not full and not(parts[:2]==['projects',known] or parts[:1]==['my-boq-app']):continue
    partition=deref(deref(key)['partitionRef']);database=deref(partition['databaseRef'])
    if string(database['rawProjectId'])!='demo-boq-v041':continue
    database_id=string(database['databaseId']);namespace=string(partition['namespace'])
    if database_id not in ('(default)','',None) or namespace not in ('',None):
        raise ValueError('Unexpected internal database scope '+repr((database_id,namespace)))
    snapshots=elements(deref(history)['snapshots']); covered+=1
    timestamps=[instant(deref(s)['commitTimestamp']) for s in snapshots]
    assert len(set(timestamps))==len(timestamps),'Ambiguous commit timestamp in stored history'
    latest=max(snapshots,key=lambda s:instant(deref(s)['commitTimestamp']))
    state=deref(latest);entity=deref(state['entity'])['value']
    if not entity.id:
        deleted+=1;deleted_names.append('projects/demo-boq-v041/databases/(default)/documents/'+'/'.join(parts));continue
    actual=deref(entity);assert ref_path(actual['ref'])==parts
    doc={'name':'projects/demo-boq-v041/databases/(default)/documents/'+'/'.join(parts),'fields':{string(k):field_value(v) for k,v in entries(actual['propertyMap'])},'updateTime':iso(instant(state['commitTimestamp']))}
    created=deref(state['createdAt'])['value']
    if created.id:doc['createTime']=iso(instant(created))
    selected.append({'document':doc,'storeAnchor':hex(store.id),'historyObject':hex(history.id),'latestStoredEntity':hex(latest.id),'storedVersions':len(snapshots),'basis':'Latest timestamp in the unique FlatLocalEntityStore.rows history, not serialized message history'})
assert len({d['document']['name'] for d in selected})==len(selected),'Duplicate live document names'
index=root/('live-database.json' if full else 'live-selection.json');index.write_text(json.dumps({'documents':selected,'deletedNames':deleted_names,'projectId':known,'snapshotSha256':source_sha,'scope':'all-default-database-row-histories' if full else 'selected-project-and-identity'},ensure_ascii=False,allow_nan=False),encoding='utf8')
summary={'status':'EXTRACTED','datastoreAnchors':len(stores),'allRowHistories':len(rows),'selectedHistories':covered,'selectedLiveDocuments':len(selected),'selectedDeletedDocumentsExcluded':deleted,'memberDocuments':sum('/members/' in d['document']['name'] for d in selected),'privateSelectionSha256':hashlib.sha256(index.read_bytes()).hexdigest(),'basis':'Latest stored commit per selected row; no full database or external parity certification','originalDataWritten':False}
(output/'live-extraction-results.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary))
