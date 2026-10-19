from pathlib import Path
import json,subprocess
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageOps,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'output/placement-context-verification';render=out/'pdf-rendered';render.mkdir(exist_ok=True)
results=[]
for name,dimensions,dpi in [('CTX-A3-draft',(420,297),100),('CTX-A1-draft',(841,594),65),('CTX-A4-draft',(210,297),110),('CTX-built-working-A4',(210,297),110),('GULF-original-reference',(841,594),65)]:
    path=out/(name+'.pdf');reader=PdfReader(path,strict=name.startswith('CTX'));texts=[p.extract_text() for p in reader.pages]
    assert len(texts)>0
    for p,t in zip(reader.pages,texts):
        actual=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72)
        if p.rotation%180:actual=(actual[1],actual[0])
        assert all(abs(a-b)<.2 for a,b in zip(actual,dimensions)),(name,actual)
        if name.startswith('CTX'):assert 'NOT FOR CONSTRUCTION' in t,(name,t[:120])
    combined=' '.join(texts)
    if name.startswith('CTX'):
        assert all(mark in combined for mark in ['CTX-01','C01'])
        assert '7,800' in combined or '7800' in combined
        assert 'context' in combined.lower() and 'BOQ' in combined
    else:
        assert len(reader.pages)==1 # Original PDF, byte hash verified against intake source; manual visual reference only
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for char in page.chars:assert char['x0']>=-.5 and char['x1']<=page.width+.5 and char['top']>=-.5 and char['bottom']<=page.height+.5,(name,page.page_number,char)
    prefix=render/name.lower()
    subprocess.run(['pdftoppm','-r',str(dpi),'-png',str(path),str(prefix)],check=True,capture_output=True)
    images=sorted(render.glob(prefix.name+'-*.png'));assert len(images)==len(reader.pages)
    tw=650;th=460 if 'A4' not in name else 960;contact=Image.new('RGB',(tw*2,(th+30)*((len(images)+1)//2)),'#e6eee9');draw=ImageDraw.Draw(contact)
    for i,img in enumerate(images):
        with Image.open(img) as source:thumb=ImageOps.contain(source,(tw-16,th-16))
        x=(i%2)*tw+(tw-thumb.width)//2;y=(i//2)*(th+30)+30;contact.paste(thumb,(x,y));draw.text(((i%2)*tw+12,y-20),f'{name} / page {i+1}',fill='#203940')
    contact.save(out/f'pdf-{name}-contact.png');results.append({'name':name,'status':'PASS','pages':len(images),'dimensionsMm':dimensions,'textBoundsVerified':True,'strictPdfParsing':name.startswith('CTX'),'originalSourceDuplicatePageModeTolerated':not name.startswith('CTX'),'renderedFiles':[str(p.relative_to(out)) for p in images]})
(out/'pdf-results.json').write_text(json.dumps({'results':results,'renderedPages':sum(r['pages'] for r in results),'engineeringAcceptance':False,'sourceRebarGeometryReconstructed':False},indent=2),encoding='utf-8')
print('PASS: four actual PDF exports plus unchanged source PDF and',sum(r['pages'] for r in results),'rendered pages')
