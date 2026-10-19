from pathlib import Path
import json,hashlib,subprocess
from pypdf import PdfReader
root=Path('F:/Project Code/BOQ_BBS');out=root/'output/planar-path-verification';read=lambda n:json.loads((out/n).read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
unit=read('unit-results.json');assert unit['success'] and unit['numTotalTests']==1116 and not unit['numFailedTests']
cases=[]
for phase in ['setup','ui','exports','restore','pending']:
 r=read(phase+'-results.json');assert not r['errors'] and not r['cloud'];assert all(x['status']=='PASS'for x in r['results']);cases+=r['results']
protected=json.loads((root/'output/source-table-intake-isolated-verification/protected-config.json').read_text(encoding='utf8'))
for p in protected:assert sha(root/p['file'])==p['sha256']
original=json.loads((root/'output/source-table-intake-isolated-verification/context.json').read_text(encoding='utf8'))
for source in original['sources']:assert sha(root/'Referrence/ตัวอย่าง BBS'/source['name'])==source['sha256']
(out/'protected-config.json').write_text(json.dumps(protected,indent=2),encoding='utf8')
for f in read('artifacts.json'):assert sha(out/f['file'])==f['sha256']
assert read('native-results.json')['status']=='PASS';assert read('excel-view-results.json')['status']=='PASS';assert sha(out/'planar-path-study.xlsx').upper()==read('native-results.json')['sourceHash']
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe');pdfs=[]
for file in [out/'planar-path-study-A3.pdf',*(out/p['file']for p in read('native-results.json')['prints'])]:
 reader=PdfReader(file);pages=[]
 for i,p in enumerate(reader.pages):
  text=p.extract_text()or'';w=float(p.mediabox.width)*25.4/72;h=float(p.mediabox.height)*25.4/72
  (out/f'{file.stem}-page-{i+1}.txt').write_text(text,encoding='utf8');pages.append({'page':i+1,'widthMm':w,'heightMm':h,'png':f'{file.stem}-page-{str(i+1).zfill(len(str(len(reader.pages))))}.png'})
  tolerance=.01 if file.name=='planar-path-study-A3.pdf' else .3
  assert abs(w-420)<tolerance and abs(h-297)<tolerance,(file.name,w,h)
 subprocess.run([str(poppler),'-r','95','-png',str(file),str(out/(file.stem+'-page'))],check=True,stdout=subprocess.DEVNULL)
 assert all((out/p['png']).exists()for p in pages);pdfs.append({'name':file.name,'pages':pages})
text='\n'.join((out/f'planar-path-study-A3-page-{i+1}.txt').read_text(encoding='utf8')for i in range(len(pdfs[0]['pages'])))
assert 'XY / virtual / start 0 degrees' in text and 'not Figure 4 tangent dimensions' in text and '1: 6400 / 0 ; 2: 203 / 7 ; 3: 700 / -7' in text
assert '7325' in text.replace(',','') and '7300' in text.replace(',','') and 'NOT FOR CONSTRUCTION' in text
c=read('context.json');assert c['frozen']['members'][0]['bars'][0]['pathInput']==c['restored']['bars'][0]['pathInput'];assert not c['frozen']['project']['spec']['approved']
audit={'status':'PASS','unitCases':1116,'unitFiles':68,'localPaths':len(cases),'pdfs':pdfs,'worksheetViews':len(read('excel-view-results.json')['views']),'protectedFiles':len(protected),'rulesChanged':False,'rulesDeployed':False,'cloudRequests':0,'sourceCutMm':7300,'studyCutMm':7325,'syntheticEnvelope':True,'sourceBasisRadiusMaterialPlacementApproved':False,'fullEngineeringAcceptance':False,'productionAcceptance':False}
(out/'artifact-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in audit.items()if k!='pdfs'},indent=2));print([(p['name'],len(p['pages']))for p in pdfs])
