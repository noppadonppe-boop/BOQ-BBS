from pathlib import Path
import json,hashlib,subprocess
from pypdf import PdfReader
from PIL import Image,ImageDraw
root=Path('F:/Project Code/BOQ_BBS');out=root/'output/code99-excel-verification'
read=lambda n:json.loads((out/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected=read('protected-config.json')
for p in protected:assert sha(root/p['file'])==p['sha256'],p['file']
sources=json.loads((root/'output/source-table-intake-isolated-verification/context.json').read_text())['sources']
for s in sources:assert sha(root/'Referrence/ตัวอย่าง BBS'/s['name'])==s['sha256']
for a in read('artifacts.json'):assert sha(out/a['file'])==a['sha256']
native=read('native-results.json');assert native['status']=='PASS'and read('excel-view-results.json')['status']=='PASS'
pdfs=[];poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
for book in native['workbooks']:
 assert sha(out/book['file']).upper()==book['sourceHash']
 for f in book['prints']:
  file=out/f['file'];reader=PdfReader(file);pages=[]
  for i,p in enumerate(reader.pages):
   w=float(p.mediabox.width)*25.4/72;h=float(p.mediabox.height)*25.4/72;assert abs(w-420)<.3 and abs(h-297)<.3,(file.name,w,h)
   text=p.extract_text()or'';(out/f'{file.stem}-page-{i+1}.txt').write_text(text,encoding='utf-8');pages.append({'page':i+1,'widthMm':w,'heightMm':h,'png':f'{file.stem}-page-{str(i+1).zfill(len(str(len(reader.pages))))}.png'})
  subprocess.run([str(poppler),'-r','90','-png',str(file),str(out/(file.stem+'-page'))],check=True,stdout=subprocess.DEVNULL)
  text=' '.join('\n'.join((p.extract_text()or'')for p in reader.pages).split())
  if f['sheet']=='Code99 Details':
   for t in ['L02','600','(L03)','111','NOT FOR CONSTRUCTION']:assert t in text,(file.name,t)
   if book['file'].startswith('Code99'):
    for t in ['(L08)','610','L07','580','OUTSIDE PENDING','part 2/2']:assert t in text,(file.name,t)
    assert len(pages)==6,(file.name,'Expected6 parts',len(pages))
   else:assert len(pages)==1,(file.name,len(pages))
  if f['sheet']=='Code99 Coordinates':
   for t in ['56.000000','170.000000','3500.000000','P00']:assert t in text,(file.name,t)
   assert len(pages)==(5 if book['file'].startswith('Code99') else 1),(file.name,len(pages))
  for p in pages:assert(out/p['png']).exists()
  pdfs.append({'name':file.name,'sheet':f['sheet'],'pages':pages})
allpages=[p for f in pdfs for p in f['pages']];thumb=Image.new('RGB',(1050,((len(allpages)+2)//3)*270),'#eef2f0');draw=ImageDraw.Draw(thumb)
for i,p in enumerate(allpages):
 im=Image.open(out/p['png']);im.thumbnail((334,236));x=(i%3)*350;y=(i//3)*270;thumb.paste(im,(x+(350-im.width)//2,y+26));draw.text((x+6,y+6),str(i+1)+': '+p['png'][:46],fill='#203940')
thumb.save(out/'native-contact-sheet.png')
(out/'files-audit.json').write_text(json.dumps({'status':'PASS','protectedFiles':len(protected),'originalDrawings':len(sources),'nativePages':len(allpages),'pdfs':pdfs},indent=2))
print('PASS original/reference hashes, source workbook hashes, native A3 pagination and complete typed dimension text')
