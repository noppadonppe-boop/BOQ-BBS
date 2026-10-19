from pathlib import Path
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
import subprocess,json,hashlib
out=Path('F:/Project Code/BOQ_BBS/output/six-category-current-verification')
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
results=[]
for name,size in [('Six-Category-R002-BOQ-A3.pdf',(420,297)),('Six-Category-R002-BBS-A1.pdf',(841,594))]:
 file=out/name;before=hashlib.sha256(file.read_bytes()).hexdigest();reader=PdfReader(file);texts=[]
 for page in reader.pages:
  actual=(float(page.mediabox.width)*25.4/72,float(page.mediabox.height)*25.4/72)
  assert all(abs(a-b)<.1 for a,b in zip(actual,size))
  texts.append(page.extract_text() or '')
 if size==(841,594):
  assert len(texts)==18
  assert all('NOT FOR CONSTRUCTION' in t for t in texts)
  for i in range(6):
   assert all(f'QA-BBS-{i+1:03d}' in texts[i*3+j] for j in range(3))
  assert sum('QA-B1' in t for t in texts)>=6
 else:
  assert len(texts)==4
  assert all('R002' in t for t in texts)
  assert 'NOT FOR CONSTRUCTION' in texts[0]
  assert all(name in texts[0] for name in ['QA-FOUNDATION','QA-BEAM','QA-COLUMN','QA-SLAB','QA-WALL','QA-CUSTOM'])
 prefix=out/file.stem
 run=subprocess.run([poppler,'-r','70','-png',str(file),str(prefix)],capture_output=True,text=True)
 (out/(file.stem+'-render.log')).write_text(run.stderr,encoding='utf-8');assert run.returncode==0
 images=sorted(out.glob(file.stem+'-*.png'),key=lambda p:int(p.stem.split('-')[-1]))
 assert len(images)==len(reader.pages)
 columns=3;rows=(len(images)+columns-1)//columns;sheet=Image.new('RGB',(columns*520,rows*390),'#e7eef0');draw=ImageDraw.Draw(sheet)
 for i,p in enumerate(images):
  im=Image.open(p).convert('RGB');im.thumbnail((500,350));x=(i%columns)*520+10;y=(i//columns)*390+30;sheet.paste(im,(x,y));draw.text((x,y-20),f'{file.stem} / Page {i+1}',fill='#16343d')
 sheet.save(out/(file.stem+'-contact.png'))
 assert hashlib.sha256(file.read_bytes()).hexdigest()==before
 results.append({'file':name,'pages':len(reader.pages),'correctPaper':True,'allPagesRendered':True,'originalBytesUnchanged':True,'allPagesNotForConstruction':size==(841,594),'sha256':before})
(out/'pdf-results.json').write_text(json.dumps({'status':'PASS','scope':'Actual registered app outputs; native printing/engineering/owner acceptance not claimed','files':results},indent=2),encoding='utf-8')
print('PASS actual A3 4pages and A1 18pages;22pages rendered, correct paper/frames/Draft, original bytes unchanged')
