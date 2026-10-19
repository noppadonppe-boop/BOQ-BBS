from pathlib import Path
import json,hashlib
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageDraw
out=Path('output/quantity-basis-verification');file=out/'Quantity-Basis-Pending-A3.pdf';pdf=PdfReader(file);assert len(pdf.pages)==4
for i,p in enumerate(pdf.pages):
    assert abs(float(p.mediabox.width)-1190.55)<.1 and abs(float(p.mediabox.height)-841.89)<.1
    assert f'Page {i+1}/4' in (p.extract_text() or '')
with pdfplumber.open(file) as doc:
    table=next(t for t in doc.pages[0].extract_tables() if t and t[0][0]=='Member')
    pending=next(r for r in table if r[0]=='F-PROVISIONAL');legacy=next(r for r in table if r[0]=='LEGACY-QA');total=next(r for r in table if r[0]=='TOTAL')
    assert pending[3:8]==['PENDING']*5 and total[3:8]==['PENDING']*5
    assert legacy[3]=='1.000' and legacy[4]=='6.000'
    assert 'PROVISIONAL QUANTITY INPUTS' in (doc.pages[1].extract_text() or '')
    assert 'RAW PREVIEW / INPUT PENDING' in (doc.pages[3].extract_text() or '')
canvas=Image.new('RGB',(1260,632),'#edf1f0');draw=ImageDraw.Draw(canvas)
for i in range(4):
    img=Image.open(out/f'BOQ-A3-{i+1}.png').convert('RGB');img.thumbnail((400,285));x=i%3*420+10;y=i//3*316+22;canvas.paste(img,(x,y));draw.text((x,y-17),f'A3{i+1}/4',fill='black')
canvas.save(out/'boq-pdf-contact.png');(out/'pdf-audit.json').write_text(json.dumps({'status':'PASS','pages':4,'paper':'A3','pendingMainCells':10,'legacyConcrete':1,'rawEarthworkLabelledPreview':True,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()},indent=2),encoding='utf8')
print('PASS4PDF pages: main/member/TOTAL pending, legacy value and explicit raw-preview appendix')
