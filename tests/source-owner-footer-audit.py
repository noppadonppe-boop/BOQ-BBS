from pathlib import Path
import pdfplumber,json
root=Path('output/source-owner-pagination-verification');results=[]
for name,size in [('Owner-C1-A3.pdf','A3'),('Owner-C1-A1.pdf','A1'),('Synthetic-300-A3.pdf','A3'),('Synthetic-300-A1.pdf','A1')]:
 checked=0
 with pdfplumber.open(root/name) as pdf:
  for i,p in enumerate(pdf.pages):
   if i==0:continue
   words=p.extract_words();frame_top=(297 if size=='A3' else 594)-65
   refs=[w for w in words if w['text']=='REFERENCE' and w['top']>p.height-120*72/25.4]
   assert refs,(name,i+1,'missing footer reference')
   assert all(w['bottom']<(frame_top-2)*72/25.4 for w in refs),(name,i+1,'reference intersects owner frame')
   checked+=1
 results.append({'file':name,'checkedSupplementalPages':checked,'referenceAboveOwnerFrame':True,'status':'PASS'})
(root/'footer-geometry-results.json').write_text(json.dumps({'results':results,'basis':'Rendered footer reference text coordinates checked on every supplemental page, not structural engineering acceptance'},indent=2),encoding='utf-8')
print('PASS footer reference geometry on all supplemental owner-frame pages')
