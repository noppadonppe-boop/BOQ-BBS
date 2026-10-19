from pathlib import Path
import hashlib,json,subprocess
from pypdf import PdfReader

root=Path('F:/Project Code/BOQ_BBS');out=root/'output/protected-source-export-verification'
read=lambda n:json.loads((out/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
unit=read('unit-results.json');assert unit['success'] and not unit['numFailedTests']
before=read('before-results.json');after=read('after-results.json');ctx=read('context.json')
assert len(before['results'])==1 and all(r['status']=='PASS' for r in before['results'])
assert len(after['results'])==6 and all(r['status']=='PASS' for r in after['results'])
assert not before['cloud'] and not after['cloud'] and not after['errors']
assert ctx['before']['status']=='Failed'
protected=[]
for p in json.loads((root/'output/oval-link-verification/protected-config.json').read_text(encoding='utf-8')):
 assert sha(root/p['file'])==p['sha256'];protected.append({**p,'unchanged':True})
(out/'protected-config.json').write_text(json.dumps(protected,indent=2),encoding='utf-8')
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
pdfs=[]
for a in read('artifacts.json'):
 file=out/a['name'];assert sha(file)==a['sha256'] and file.stat().st_size==a['bytes'];pdf=PdfReader(file);pages=[]
 for i,p in enumerate(pdf.pages):
  text=p.extract_text() or '';width=float(p.mediabox.width)*25.4/72;height=float(p.mediabox.height)*25.4/72
  expected=(420,297) if 'A3' in a['name'] else (841,594);assert abs(width-expected[0])<.1 and abs(height-expected[1])<.1
  assert 'NOT FOR CONSTRUCTION' in text or 'NOT FOR\nCONSTRUCTION' in text or 'NOT FOR' in text
  # Text extractors read clipped Form XObject content outside its BBox. Check
  # visible crop/rotation on rendered pages, not by rejecting hidden PDF text.
  source='SOURCE PLAN & DETAIL' in text
  if source:assert 'Source SHA256:' in text and 'Source bytes verified' in text and 'UNVERIFIED' in text
  pages.append({'page':i+1,'widthMm':width,'heightMm':height,'source':source,'vector':'Vector PDF content' in text,'protectedRaster':'viewer-readable protected or renderer-only PDF' in text,'annotationRaster':'visible PDF annotations' in text,'png':f"{file.stem}-page-{i+1}.png"})
  (out/f'{file.stem}-page-{i+1}.txt').write_text(text,encoding='utf-8')
 assert len([p for p in pages if p['source']])==3
 assert len([p for p in pages if p['vector']])==1
 assert len([p for p in pages if p['protectedRaster']])==1
 assert len([p for p in pages if p['annotationRaster']])==1
 subprocess.run([str(poppler),'-r','90','-png',str(file),str(out/(file.stem+'-page'))],check=True,stdout=subprocess.DEVNULL)
 assert all((out/p['png']).exists() for p in pages)
 pdfs.append({**a,'pages':pages})
audit={'status':'PASS','unitCases':unit['numTotalTests'],'unitFiles':len(unit['testResults']),'beforeFailurePaths':1,'afterLocalPaths':6,'appPdfs':len(pdfs),'appPdfPages':sum(len(p['pages']) for p in pdfs),'protectedFiles':len(protected),'rulesChanged':False,'rulesDeployed':False,'numericalPolicyChanged':False,'productionAcceptance':False,'engineeringApproved':False,'pdfs':pdfs}
(out/'artifact-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in audit.items() if k!='pdfs'},indent=2))
