from pathlib import Path
from pypdf import PdfReader
import json,re
root=Path('output/source-owner-pagination-verification');results=[]
for name,size,maxrows in [('Owner-C1-A3.pdf','A3',False),('Owner-C1-A1.pdf','A1',False),('Synthetic-300-A3.pdf','A3',True),('Synthetic-300-A1.pdf','A1',True)]:
 r=PdfReader(root/name);texts=[];unit_pages=[];expected_number='QA-MAX-300' if maxrows else 'QA-C1-001'
 for i,p in enumerate(r.pages):
  t=p.extract_text() or '';texts.append(t)
  assert expected_number in t,(name,i+1,'missing drawing number')
  assert 'NOT FOR CONSTRUCTION' in t,(name,i+1,'missing draft status')
  assert 'โครงการทดสอบกรอบชื่อแบบ' in t,(name,i+1,'missing project frame')
  assert f'{i+1}/{len(r.pages)}' in t,(name,i+1,'missing sheet progression')
  assert abs(float(p.mediabox.width)-(1190.55 if size=='A3' else 2383.94))<.1
  if 'Per-piece weight rows' in t:unit_pages.append(i+1)
 text=''.join(texts);compact=re.sub(r'\s+','',text)
 if maxrows:
  assert len(r.pages)==(202 if size=='A3' else 142),(name,len(r.pages))
  for i in range(300):
   mark='QA'+str(i+1).zfill(3)+'-'+'M'*24
   assert compact.count(mark)==3,(name,mark,compact.count(mark))
  assert len(unit_pages)==(50 if size=='A3' else 20)
 else:
  assert len(r.pages)==8,(name,len(r.pages));assert len(unit_pages)==1
  u=texts[unit_pages[0]-1];assert '0.7' in u and '28.13' in u and '2.26' in u
 results.append({'file':name,'size':size,'pages':len(r.pages),'frameOnEveryPage':True,'sheetNumbersComplete':True,'unitWeightPages':unit_pages,'sourceMarksCoverage':'all300 appear exactly once in numerical comparison, notes and per-piece pages' if maxrows else 'all3 original source-only rows','status':'PASS'})
(root/'pdf-audit.json').write_text(json.dumps({'results':results,'basis':'Text/dimensions/coverage checks for all pages; render/visual inspection recorded separately'},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['file','pages','status']}for r in results]))
