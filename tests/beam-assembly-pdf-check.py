from pathlib import Path
import json,subprocess
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageOps,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'output/beam-assembly-verification';render=out/'pdf-rendered';render.mkdir(exist_ok=True)
results=[]
for size,dimensions,dpi in [('A3',(420,297),100),('A1',(841,594),65),('A4',(210,297),110)]:
    path=out/f'BEAM-{size}-draft.pdf';reader=PdfReader(path,strict=True);texts=[p.extract_text() for p in reader.pages]
    assert len(texts)>0
    for p,t in zip(reader.pages,texts):
        actual=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72)
        assert all(abs(a-b)<.2 for a,b in zip(actual,dimensions)),(size,actual)
        assert 'NOT FOR CONSTRUCTION' in t,(size,t[:120])
    combined=' '.join(texts)
    assert all(mark in combined for mark in ['CB-01','S1','S2','S3','CONT'])
    for cut in ['3,925','4,925','3,425','12,425']:assert cut in combined or cut.replace(',','') in combined,(size,cut)
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for char in page.chars:assert char['x0']>=-.5 and char['x1']<=page.width+.5 and char['top']>=-.5 and char['bottom']<=page.height+.5,(size,page.page_number,char)
    prefix=render/f'beam-{size.lower()}'
    subprocess.run(['pdftoppm','-r',str(dpi),'-png',str(path),str(prefix)],check=True,capture_output=True)
    images=sorted(render.glob(prefix.name+'-*.png'));assert len(images)==len(reader.pages)
    tw=650;th=460 if size!='A4' else 960;contact=Image.new('RGB',(tw*2,(th+30)*((len(images)+1)//2)),'#e6eee9');draw=ImageDraw.Draw(contact)
    for i,img in enumerate(images):
        with Image.open(img) as source:thumb=ImageOps.contain(source,(tw-16,th-16))
        x=(i%2)*tw+(tw-thumb.width)//2;y=(i//2)*(th+30)+30;contact.paste(thumb,(x,y));draw.text(((i%2)*tw+12,y-20),f'{size} / page {i+1}',fill='#203940')
    contact.save(out/f'pdf-{size}-contact.png');results.append({'size':size,'status':'PASS','pages':len(images),'dimensionsMm':dimensions,'textBoundsVerified':True,'renderedFiles':[str(p.relative_to(out)) for p in images]})
(out/'pdf-results.json').write_text(json.dumps({'results':results,'renderedPages':sum(r['pages'] for r in results),'engineeringAcceptance':False},indent=2),encoding='utf-8')
print('PASS: three actual PDF exports and',sum(r['pages'] for r in results),'rendered pages')
