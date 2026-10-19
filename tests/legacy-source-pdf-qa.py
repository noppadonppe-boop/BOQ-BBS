from pathlib import Path
import json,subprocess,hashlib,sys
import pdfplumber
from PIL import Image,ImageDraw
sys.stdout.reconfigure(encoding='utf-8')
root=Path.cwd();out=root/'output/legacy-source-verification';dest=out/'pdf-render';dest.mkdir(parents=True,exist_ok=True)
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
results=[];pt=72/25.4
for name,size,pages in [('legacy-source-adoption-A3-draft.pdf','A3',3),('legacy-source-adoption-A1-draft.pdf','A1',5)]:
 path=root/'output/pdf'/name;label='adoption-'+size
 with pdfplumber.open(path) as pdf:
  assert len(pdf.pages)==pages
  texts=[]
  for i,p in enumerate(pdf.pages):
   expected={'A3':(420,297),'A1':(841,594)}[size]
   assert abs(p.width/pt-expected[0])<.03 and abs(p.height/pt-expected[1])<.03
   text=p.extract_text() or '';texts.append(text)
   assert 'NOT FOR CONSTRUCTION' in text and 'R002' in text
   assert 'B09' not in text and '4000 mm' not in text
   outside=[c for c in p.chars if c['x0']<-.1 or c['x1']>p.width+.1 or c['top']<-.1 or c['bottom']>p.height+.1]
   assert not outside,(name,i,outside[:1])
  full='\n'.join(texts)
  for value in ['Legacy source adopted','prior rev none','hash first recorded at adoption','Draft references reviewed','UNVERIFIED installation','legacy-owner-plan.png / Source rev A','S01/p1/#001','S01/p1/#002','2 / 1000']:
   assert value in full,(name,value)
  assert sum('Legacy source adopted' in t for t in texts)==1
  source=pdf.pages[-1];assert 'Source sheet 1/1 / '+size in (source.extract_text() or '')
  if size=='A1':assert all('LUI-0'+str(i) in full for i in range(1,4))
  else:assert 'LUI-02' not in full and 'LUI-03' not in full
  subprocess.run([poppler,'-scale-to','1800','-png',str(path),str(dest/label)],check=True,capture_output=True)
  (dest/(label+'-text.txt')).write_text(full,encoding='utf-8')
  results.append({'file':str(path.relative_to(root)).replace('\\','/'),'paper':size,'pages':pages,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'allPagesRendered':True,'outOfPageCharacters':0,'noLaterWorkingData':True,'adoptionHashBasisCaption':True,'sourceCalloutReferences':2,'visualInspection':'pending'})
 images=sorted(dest.glob(label+'-*.png'));canvas=Image.new('RGB',(1100,420*len(images)),'#e2e8ea');draw=ImageDraw.Draw(canvas)
 for i,image in enumerate(images):
  im=Image.open(image);im.thumbnail((1080,390));canvas.paste(im,((1100-im.width)//2,420*i+25));draw.text((10,420*i+5),image.name,fill='black')
 canvas.save(dest/(label+'-contact.jpg'))
(out/'pdf-results.json').write_text(json.dumps({'results':results,'visualInspection':'pending','scope':'Two actual application downloads, all eight leaves; synthetic manual1000mm box fixture, legacy landscape frame. General Spec originals remain reference metadata and are not extra source-callout sheets. Not engineering/owner template acceptance.'},indent=2),encoding='utf-8')
print('PASS actual PDF paper/text/bounds: 2 files / 8 leaves; visual review pending')
