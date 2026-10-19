from pathlib import Path
import json,subprocess
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageOps,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'output/fabrication-inspection-verification';render=out/'pdf-rendered-record-layout';render.mkdir(exist_ok=True);results=[]
for name in ['INS-frozen-A4','INS-ui-working-A4','INS-built-working-A4','INS-max-A4']:
 p=out/(name+'.pdf');reader=PdfReader(p,strict=True);text=' '.join(page.extract_text() for page in reader.pages);assert len(reader.pages)==(23 if name=='INS-max-A4' else 6),(name,len(reader.pages))
 for page in reader.pages:
  assert abs(float(page.mediabox.width)*25.4/72-210)<.2 and abs(float(page.mediabox.height)*25.4/72-297)<.2
 assert 'PER-PIECE FABRICATION MEASUREMENTS' in text and 'USER RECORDED / NOT FOR CONSTRUCTION' in text and 'I11' in text
 if name=='INS-max-A4':
  for i in range(1,21):assert 'MAX SOURCE '+str(i).zfill(2) in text and 'MAX NOTE '+str(i).zfill(2) in text and 'MAX PIECE '+str(i).zfill(2) in text
 else:
  assert '750' in text and '510' in text
  for label in ['Piece 001','Piece 002','Piece 003'] if name=='INS-frozen-A4' else ['UI-P001','UI-P002','UI-P003']:assert label in text
  assert ('Stale nominal' in text)==(name!='INS-frozen-A4')
 with pdfplumber.open(p) as pdf:
  for page in pdf.pages:
   for c in page.chars:assert -.5<=c['x0'] and c['x1']<=page.width+.5 and -.5<=c['top'] and c['bottom']<=page.height+.5,(name,page.page_number,c)
 prefix=render/name.lower();subprocess.run(['pdftoppm','-r','85','-png',str(p),str(prefix)],check=True,capture_output=True);images=sorted(render.glob(prefix.name+'-*.png'),key=lambda p:int(p.stem.rsplit('-',1)[1]));assert len(images)==len(reader.pages)
 width=900;height=650;contact=Image.new('RGB',(width*2,(height+25)*((len(images)+1)//2)),'#e9f0eb');draw=ImageDraw.Draw(contact)
 for i,img in enumerate(images):
  with Image.open(img) as source:thumb=ImageOps.contain(source,(width-20,height-20))
  x=(i%2)*width+(width-thumb.width)//2;y=(i//2)*(height+25)+25;contact.paste(thumb,(x,y));draw.text(((i%2)*width+10,y-20),f'{name} / page {i+1}',fill='#203940')
 contact.save(out/f'pdf-{name}-contact.png');results.append({'name':name,'status':'PASS','pages':len(images),'paperMm':[210,297],'strictParsing':True,'textBoundsVerified':True,'recordReferencesPresent':True})
(out/'pdf-results.json').write_text(json.dumps({'results':results,'renderedPages':sum(r['pages'] for r in results),'nativeExcelPrintingVerified':False,'engineeringAcceptance':False},indent=2),encoding='utf-8');print('PASS PDF:',sum(r['pages'] for r in results),'actual exported pages')
