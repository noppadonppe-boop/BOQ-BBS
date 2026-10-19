from pathlib import Path
import json,hashlib,subprocess
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
root=Path('F:/Project Code/BOQ_BBS');out=root/'output/perimeter-layout-verification';read=lambda n:json.loads((out/n).read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
unit=read('unit-results.json');assert unit['success'] and not unit['numFailedTests'];cases=[]
for phase in ['setup','ui','exports','restore']:
 r=read(phase+'-results.json');assert not r['errors'] and not r['cloud'];assert all(x['status']=='PASS'for x in r['results']);cases+=r['results']
c=read('context.json');assert c['calculation']['concrete']==3.234 and c['calculation']['quantity']==1 and c['calculation']['rows'][0]['cutLength']==7300 and c['bar']['count']==24
assert not c['bar']['placementConfirmed'] and not c['bar']['bsDimensionsConfirmed'] and 'bsType'not in c['bar'];assert c['bar']['pathInput']['templateRotation']==[0,0,-45]
assert c['restoredArtifacts']==[a['sha256']for a in read('artifacts.json')]
protected=json.loads((root/'output/source-table-intake-isolated-verification/protected-config.json').read_text(encoding='utf8'))
for p in protected:assert sha(root/p['file'])==p['sha256']
source=json.loads((root/'output/source-table-intake-isolated-verification/context.json').read_text(encoding='utf8'))
for s in source['sources']:assert sha(root/'Referrence/ตัวอย่าง BBS'/s['name'])==s['sha256']
(out/'protected-config.json').write_text(json.dumps(protected,indent=2),encoding='utf8')
for a in read('artifacts.json'):assert sha(out/a['file'])==a['sha256']
assert sha(out/'C1-main-bar-draft.xlsx').upper()==read('native-results.json')['sourceHash'];assert read('native-results.json')['status']=='PASS';assert read('excel-view-results.json')['status']=='PASS';assert sha(out/'C1-main-bar-draft.xlsx')==read('excel-view-results.json')['sourceHash']
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe');pdfs=[]
for file in [out/'C1-main-bar-draft-A3.pdf',*(out/p['file']for p in read('native-results.json')['prints'])]:
 reader=PdfReader(file);pages=[]
 for i,p in enumerate(reader.pages):
  text=p.extract_text()or'';w=float(p.mediabox.width)*25.4/72;h=float(p.mediabox.height)*25.4/72;tolerance=.01 if file.name=='C1-main-bar-draft-A3.pdf'else .3
  assert abs(w-420)<tolerance and abs(h-297)<tolerance,(file.name,w,h)
  (out/f'{file.stem}-page-{i+1}.txt').write_text(text,encoding='utf8');pages.append({'page':i+1,'widthMm':w,'heightMm':h,'png':f'{file.stem}-page-{str(i+1).zfill(len(str(len(reader.pages))))}.png'})
 subprocess.run([str(poppler),'-r','95','-png',str(file),str(out/(file.stem+'-page'))],check=True,stdout=subprocess.DEVNULL)
 assert all((out/p['png']).exists()for p in pages);pdfs.append({'name':file.name,'pages':pages})
text='\n'.join((out/f'C1-main-bar-draft-A3-page-{i+1}.txt').read_text(encoding='utf8')for i in range(len(pdfs[0]['pages'])))
assert 'Template rotation XYZ degrees' in text and '0 / 0 / -45' in text and 'rebar-flat-ends-1.0' in text and 'NOT FOR CONSTRUCTION' in text
assert '3.234' in (out/'native-boq-print-page-1.txt').read_text(encoding='utf8')
files=[out/p['png']for p in pdfs[0]['pages']];canvas=Image.new('RGB',(1920,370*((len(files)+3)//4)),'#edf2f3');draw=ImageDraw.Draw(canvas)
for i,f in enumerate(files):canvas.paste(ImageOps.contain(Image.open(f).convert('RGB'),(465,330)),((i%4)*480,(i//4)*370+25));draw.text(((i%4)*480+12,(i//4)*370+6),f'App PDF page{i+1}',fill='black')
canvas.save(out/'pdf-contact.png')
audit={'status':'PASS','unitCases':unit['numTotalTests'],'unitFiles':len(unit['testResults']),'localPaths':len(cases),'ownedConcreteM3':3.234,'memberQuantity':1,'mainBarCount':24,'mainCutMm':7300,'completeSteelAvailable':False,'mainPositionsApproved':False,'materialMappingApproved':False,'upperReferenceApproved':False,'engineeringApproved':False,'productionAcceptance':False,'rulesChanged':False,'rulesDeployed':False,'protectedFiles':9,'originalSourcesUnchanged':7,'worksheetViews':len(read('excel-view-results.json')['views']),'pdfs':pdfs}
(out/'artifact-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in audit.items()if k!='pdfs'},indent=2));print([(p['name'],len(p['pages']))for p in pdfs])
