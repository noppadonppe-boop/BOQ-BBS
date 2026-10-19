"""Read private recovery candidates; publish counts, never document payloads."""
import json
from pathlib import Path
from collections import Counter

root = Path('C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014/candidate-scan-v2')
context = json.loads(Path('output/area-change-verification/context.json').read_text(encoding='utf-8'))
def find_id(value):
    if isinstance(value, dict):
        for key in ('projectId', 'pid'):
            if isinstance(value.get(key), str): return value[key]
        for child in value.values():
            result = find_id(child)
            if result: return result
    return None
pid = find_id(context)
if not pid: raise ValueError('Known project ID missing')
def decode(value):
    if 'mapValue' in value: return {k: decode(v) for k,v in value['mapValue'].get('fields',{}).items()}
    if 'arrayValue' in value: return [decode(v) for v in value['arrayValue'].get('values',[])]
    if 'integerValue' in value: return int(value['integerValue'])
    if 'doubleValue' in value: return float(value['doubleValue'])
    return next(iter(value.values()), None)
projects = Counter(); categories = Counter(); known = Counter(); root_state = None; selected = []; project = None; members = []
index = json.loads((root/'index.json').read_text(encoding='utf-8'))
for row in index:
    candidate = json.loads((root/row['file']).read_text(encoding='utf-8')); doc = candidate['document']
    parts = doc['name'].split('/'); projects[parts[1]] += 1
    relative = parts[5:]; categories['/'.join(relative[::2])] += 1
    identity = relative[:1] == ['my-boq-app']
    if parts[1] == 'demo-boq-v041' and len(relative)>1 and relative[:2] == ['projects',pid]:
        if row['conflict'] or row['deletedOrUncertain'] or not row['hasUpdateTime']: raise ValueError('Unsafe known-project candidate')
        selected.append(doc)
        known['/'.join(relative[::2])] += 1
        fields = {k:decode(v) for k,v in doc['fields'].items()}
        if len(relative)==4 and relative[2]=='members': members.append(fields)
        if len(relative)==2:
            project = fields
            job = fields.get('specChangeState') or {}
            root_state = {'fieldNames':sorted(fields),'version':fields.get('version'), 'updateTime':doc.get('updateTime'),'job':{k:job.get(k) for k in ('status','completed','total')} if isinstance(job,dict) else None}
    elif parts[1]=='demo-boq-v041' and identity and not(row['conflict'] or row['deletedOrUncertain'] or not row['hasUpdateTime']): selected.append(doc)
assert project and project['version']==66 and len(members)==57
(root/'diagnostic-selection.json').write_text(json.dumps({'projectId':pid,'documents':selected,'project':project,'members':members,'diagnosticOnly':True,'completeDatabase':False},ensure_ascii=False),encoding='utf-8')
areas = Counter()
for member in members:
    for occurrence in member['occurrences']: areas[json.dumps([occurrence['zone'],occurrence['floor']])] += occurrence['quantity']
summary = {'projects':dict(projects),'collectionPaths':dict(categories),'knownProjectCandidates':dict(known),'knownProjectRoot':root_state,'knownProjectAreas':dict(areas),'activeDataWritten':False,'currentStateVerified':False}
Path('output/data-recovery-verification/candidate-inventory.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary))
