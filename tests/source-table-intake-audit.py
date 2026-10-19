from pathlib import Path
import json,hashlib,subprocess
from pypdf import PdfReader

root=Path('F:/Project Code/BOQ_BBS');out=root/'output/source-table-intake-isolated-verification';initial=root/'output/source-table-intake-verification'
read=lambda n:json.loads((out/n).read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
unit=json.loads((initial/'unit-results.json').read_text(encoding='utf8'));assert unit['success'] and not unit['numFailedTests']
phases=[]
for phase in ['setup','ui','exports','restore']:
 r=read(phase+'-results.json');assert not r['errors'] and not r['cloud'];assert all(x['status']=='PASS'for x in r['results']);phases+=r['results']
ctx=read('context.json');assert len(ctx['crops'])==7 and sum(len(c['rows'])for c in ctx['crops'])==59
for source in ctx['sources']:assert sha(root/'Referrence/ตัวอย่าง BBS'/source['name'])==source['sha256']
protected=json.loads((root/'output/protected-source-export-verification/protected-config.json').read_text(encoding='utf8'))
for p in protected:assert sha(root/p['file'])==p['sha256']
(out/'protected-config.json').write_text(json.dumps(protected,indent=2),encoding='utf8')
for artifact in read('artifacts.json'):assert sha(out/artifact['name'])==artifact['sha256']
assert read('native-results.json')['status']=='PASS';assert read('excel-view-results.json')['status']=='PASS';assert sha(out/'GULF-source-table.xlsx').upper()==read('native-results.json')['sourceHash']
assert read('weight-status-results.json')['status']=='PASS'
assert read('print-excel-results.json')['status']=='PASS'
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
pdfs=[]
for file in [out/'GULF-source-table-A3.pdf',*(out/p['file']for p in read('native-results.json')['prints'])]:
 reader=PdfReader(file);pages=[]
 for i,p in enumerate(reader.pages):
  text=p.extract_text()or'';w=float(p.mediabox.width)*25.4/72;h=float(p.mediabox.height)*25.4/72
  (out/f'{file.stem}-page-{i+1}.txt').write_text(text,encoding='utf8');pages.append({'page':i+1,'widthMm':w,'heightMm':h,'png':f'{file.stem}-page-{i+1}.png'})
  if file.name=='GULF-source-table-A3.pdf':assert abs(w-420)<.1 and abs(h-297)<.1
 subprocess.run([str(poppler),'-r','95','-png',str(file),str(out/(file.stem+'-page'))],check=True,stdout=subprocess.DEVNULL)
 assert all((out/p['png']).exists()for p in pages);pdfs.append({'name':file.name,'pages':pages})
text=(out/'GULF-source-table-A3-page-3.txt').read_text(encoding='utf8');assert 'BBS weight pending / source 103.82 kg' in text and 'Source weight not entered' not in text
subprocess.run([str(poppler),'-r','95','-png',str(out/'before-weight-status-A3.pdf'),str(out/'before-weight-status-page')],check=True,stdout=subprocess.DEVNULL)
unchanged=[i for i in range(1,8)if sha(out/f'GULF-source-table-A3-page-{i}.png')==sha(out/f'before-weight-status-page-{i}.png')];assert unchanged==[1,2,4,5,6,7]
audit={'status':'PASS','unitCases':unit['numTotalTests'],'unitFiles':len(unit['testResults']),'actualLocalPaths':len(phases)+2,'suppliedFiles':7,'inspectedNativePages':31,'nativeTables':7,'sourceRows':59,'sourceShapeCrops':59,'appXlsx':1,'appPdfPages':len(pdfs[0]['pages']),'readonlyWorksheetViews':len(read('excel-view-results.json')['views']),'nativePrintedTabs':3,'nativePdfPages':sum(len(p['pages'])for p in pdfs[1:]),'unchangedPdfPagesAfterWeightFix':unchanged,'protectedFiles':9,'rulesChanged':False,'rulesDeployed':False,'numericalPolicyChanged':False,'sourceGeometryReconstructed':False,'engineeringApproved':False,'productionAcceptance':False,'originalServiceStopped':False,'pdfs':pdfs}
(out/'artifact-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in audit.items()if k!='pdfs'},indent=2))
