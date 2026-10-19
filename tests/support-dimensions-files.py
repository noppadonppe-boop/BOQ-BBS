from pathlib import Path
import json,hashlib,subprocess
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw

root=Path('F:/Project Code/BOQ_BBS');out=root/'output/support-dimensions-verification'
read=lambda n:json.loads((out/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
unit=read('unit-results.json');assert unit['success'] and unit['numFailedTests']==0
cases=[]
for phase in ['setup','ui','exports','restore']:
 r=read(phase+'-results.json');assert not r['cloud'] and not r['errors'];assert all(c['status']=='PASS'for c in r['results']);cases+=r['results']
c=read('context.json');assert c['bar']['count']==1 and c['bar']['pathInput']['basis']=='support'
assert not c['bar']['bsDimensionsConfirmed'] and not c['bar']['placementConfirmed'] and 'bsType'not in c['bar']
assert c['calculation']['concrete']==3.234 and c['calculation']['rows'][0]['cutLength']==800
assert c['restoredArtifacts']==[a['sha256']for a in read('artifacts.json')]
protected=read('protected-config.json')
for p in protected:assert sha(root/p['file'])==p['sha256'],p['file']
sources=json.loads((root/'output/source-table-intake-isolated-verification/context.json').read_text())['sources']
for s in sources:assert sha(root/'Referrence/ตัวอย่าง BBS'/s['name'])==s['sha256']
for a in read('artifacts.json'):assert sha(out/a['file'])==a['sha256']
assert read('native-results.json')['status']=='PASS' and read('excel-view-results.json')['status']=='PASS'
assert sha(out/'C1-Mark4-dimension-review.xlsx').upper()==read('native-results.json')['sourceHash']
assert sha(out/'C1-Mark4-dimension-review.xlsx')==read('excel-view-results.json')['sourceHash']
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
pdfs=[]
for file in [out/a['file']for a in read('artifacts.json')if a['kind']=='drawing']+[out/a['file']for a in read('native-results.json')['prints']]:
 reader=PdfReader(file);pages=[];expected=(841,594)if'-A1'in file.name else(420,297);tolerance=.01 if'-review-A'in file.name else .3
 for i,p in enumerate(reader.pages):
  text=p.extract_text()or'';w=float(p.mediabox.width)*25.4/72;h=float(p.mediabox.height)*25.4/72
  assert abs(w-expected[0])<tolerance and abs(h-expected[1])<tolerance,(file.name,w,h)
  (out/f'{file.stem}-page-{i+1}.txt').write_text(text,encoding='utf-8')
  pages.append({'page':i+1,'widthMm':w,'heightMm':h,'png':f'{file.stem}-page-{str(i+1).zfill(len(str(len(reader.pages))))}.png'})
 subprocess.run([str(poppler),'-r','72','-png',str(file),str(out/(file.stem+'-page'))],check=True,stdout=subprocess.DEVNULL)
 if'-review-A'in file.name:
  text='\n'.join((p.extract_text()or'')for p in reader.pages)
  for expectedText in ['L01 = 111','L02 = 600','(L03) = 111','T02i','T02o','800','790','NOT FOR CONSTRUCTION']:
   assert expectedText in text,(file.name,expectedText)
 for p in pages:assert(out/p['png']).exists()
 pdfs.append({'name':file.name,'pages':pages})
app=[p for f in pdfs[:2]for p in f['pages']]
thumb=Image.new('RGB',(900,((len(app)+2)//3)*240),'#eef2f0');draw=ImageDraw.Draw(thumb)
for i,p in enumerate(app):
 im=Image.open(out/p['png']);im.thumbnail((288,204));x=(i%3)*300;y=(i//3)*240
 thumb.paste(im,(x+(300-im.width)//2,y+24));draw.text((x+8,y+5),p['png'],fill='#203940')
thumb.save(out/'pdf-contact-sheet.png')
(out/'files-audit.json').write_text(json.dumps({'status':'PASS','unitCases':unit['numPassedTests'],'unitFiles':len(unit['testResults']),'localPaths':len(cases),'protectedFiles':len(protected),'originalDrawings':len(sources),'appPdfPages':len(app),'nativePdfPages':sum(len(p['pages'])for p in pdfs[2:]),'pdfs':pdfs},indent=2))
print('PASS file hashes, protected files, original references, actual restored artifacts and A3/A1 PDF pages')
