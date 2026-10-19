from pathlib import Path
import json,re,hashlib
from pypdf import PdfReader
import pypdfium2 as pdfium
from PIL import Image,ImageDraw

root=Path(__file__).resolve().parents[1];out=root/'output/bending-verification';files=out/'downloads';results=[]
source=root/'Referrence/BS 8666.pdf';source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
assert source_hash=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
for name,size,expected in [('frozen-details-A3.pdf','A3',25),('frozen-details-A1.pdf','A1',13),('live-details-A3.pdf','A3',25),('retried-details-A3.pdf','A3',25),('legacy-retried-A3.pdf','A3',3),('bs2000-frozen-A3.pdf','A3',7),('bs2000-frozen-A1.pdf','A1',6)]:
 p=files/name;r=PdfReader(p);assert len(r.pages)==expected,(name,len(r.pages),expected);texts=[page.extract_text() or '' for page in r.pages];text='\n'.join(texts);wh=(420,297) if size=='A3' else (841,594)
 for i,page in enumerate(r.pages):
  assert abs(float(page.mediabox.width)*25.4/72-wh[0])<.01
  assert abs(float(page.mediabox.height)*25.4/72-wh[1])<.01
  assert 'NOT FOR CONSTRUCTION' in texts[i]
  assert 'R001' in texts[i] or name.startswith('live-')
 if name.startswith('bs2000'):
  assert source_hash in text;assert 'A + B + (C) - r - 2d = 976 mm' in text
  assert 'BS 8666:2000 code 21 / 1,000 mm / increment 25 mm' in text
  assert 'inner r 55' in text;assert 'PASS for implemented minimum checks only' in text
 elif name!='legacy-retried-A3.pdf':
  assert 'D-OTHER' not in text
  for n in range(1,100):assert f'L{n:02}' in text,(name,n)
  assert 'P100' in text and 'Z = 125 mm' in text
  assert 'END_SOURCE_NOTE' in text
  assert 'Layout details-v2' in text
  if not name.startswith('live-'):assert 'A = 904 mm' in text and 'R = 40 mm' in text
  else:assert 'A = 910 mm' in text and 'B = 987 mm' in text and 'R = 60 mm' in text
 else:assert 'D-OTHER' in text and 'Layout details-v2' not in text
 results.append({'name':name,'status':'PASS','pages':len(r.pages),'paper':size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 # Render every page for a contact sheet, plus stress pages at legible resolution.
 if name in ['frozen-details-A3.pdf','bs2000-frozen-A3.pdf','bs2000-frozen-A1.pdf']:
  doc=pdfium.PdfDocument(p);thumbs=[]
  stress=[1,2,3,5,13,14,16,17,24] if name=='frozen-details-A3.pdf' else list(range(len(r.pages)))
  for i in range(len(doc)):
   page=doc[i];im=page.render(scale=.8).to_pil().convert('RGB');im.thumbnail((500,355));thumbs.append(im)
   if i in stress:page.render(scale=1.5 if size=='A3' else 1).to_pil().save(out/(p.stem+f'-page-{i+1}.png'))
   page.close()
  contact=Image.new('RGB',(1040,390*((len(thumbs)+1)//2)), '#edf1ee');d=ImageDraw.Draw(contact)
  for i,im in enumerate(thumbs):x=20+(i%2)*520;y=20+(i//2)*390;contact.paste(im,(x,y));d.text((x,y+358),f'{name} / page {i+1}',fill='#203b3b')
  contact.save(out/(p.stem+'-contact.png'));doc.close()
(out/'pdf-verification.json').write_text(json.dumps({'sourceSha256':source_hash,'results':results,'allPagesRenderedFor':['frozen-details-A3.pdf','bs2000-frozen-A3.pdf','bs2000-frozen-A1.pdf']},indent=2),encoding='utf-8')
print('PASS',len(results),'actual PDF files; all selected member legs/points/references and BS equation/cuts retained')
