import json
from pathlib import Path
root=Path('C:/Users/Administrator/.codex/visualizations/2026/10/11/01a129b2-060b-7c63-a2a0-fac757b13757/service-recovery/heap-20261014/candidate-scan-v2')
selection=json.loads((root/'diagnostic-selection.json').read_text(encoding='utf8'))
def decode(v):
    if 'mapValue' in v:return {k:decode(x) for k,x in v['mapValue'].get('fields',{}).items()}
    if 'arrayValue' in v:return [decode(x) for x in v['arrayValue'].get('values',[])]
    if 'integerValue' in v:return int(v['integerValue'])
    return next(iter(v.values()),None)
jobs=[]
for doc in selection['documents']:
    if '/specChangeJobs/' in doc['name']:
        value={k:decode(v) for k,v in doc['fields'].items()};jobs.append(value)
(root/'known-jobs.json').write_text(json.dumps(jobs,ensure_ascii=False),encoding='utf8')
for job in jobs:
    print(json.dumps({k:job.get(k) for k in ('id','status','completed','total','sourceVersion','areaChange','manifest')}))
