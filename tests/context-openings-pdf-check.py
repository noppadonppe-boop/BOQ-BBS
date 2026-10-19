from pathlib import Path
import json,subprocess,os
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageOps,ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'output/context-openings-verification';render=out/'pdf-rendered';render.mkdir(exist_ok=True)
selected=os.environ.get('PDF_NAME');results=json.loads((out/'pdf-results.json').read_text(encoding='utf-8'))['results'] if selected else [];results=[r for r in results if r['name']!=selected]
files=[('CTX2-A3-draft',(420,297),6,85),('CTX2-A1-draft',(841,594),6,60),('CTX2-A4-draft',(210,297),3,100),('CTX2-built-working-A4',(210,297),3,100),('CTX2-owner-max-A3',(420,297),22,65),('CTX2-owner-max-A1',(841,594),10,50),('CTX2-built-owner-A3',(420,297),22,65),('CTX2-owner-two-A3',(420,297),8,85),('CTX2-built-owner-two-A3',(420,297),8,85)]
for name,dimensions,expected,dpi in files:
    if selected and selected!=name:continue
    path=out/(name+'.pdf');reader=PdfReader(path,strict=True);texts=[p.extract_text() for p in reader.pages]
    assert len(texts)==expected,(name,len(texts),expected)
    for i,(p,t) in enumerate(zip(reader.pages,texts)):
        actual=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72)
        assert all(abs(a-b)<.2 for a,b in zip(actual,dimensions)),(name,actual)
        assert 'NOT FOR CONSTRUCTION' in t or 'NOT FOR\nCONSTRUCTION' in t,(name,i)
        if 'owner' in name:assert f'{i+1}/{expected}' in t and 'QA-CTX2-BBS-360' in t and '0B' in t,(name,i,'owner numbering')
    combined=' '.join(texts)
    assert 'C02' in combined and ('7,800' in combined or '7800' in combined)
    assert 'context' in combined.lower() and 'BOQ' in combined
    if 'owner' in name:
        assert combined.count('SOURCE REFERENCE')==(2 if 'two' in name else 6),(name,'region text lost')
        assert combined.count('SLOT REFERENCE')==(4 if 'two' in name else 24),(name,'opening text lost')
        for i in range(1,3 if 'two' in name else 5):assert combined.count('Opening '+str(i))==(2 if 'two' in name else 6),(name,i,'opening labels lost')
    elif dimensions!=(210,297):
        assert 'Lower slot' in combined and 'Upper slot' in combined
        assert '-600' in combined and ('6,800' in combined or '6800' in combined)
        assert 'Regional cover used mm' in combined and '70' in combined and '30' in combined
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for char in page.chars:assert char['x0']>=-.5 and char['x1']<=page.width+.5 and char['top']>=-.5 and char['bottom']<=page.height+.5,(name,page.page_number,char)
    prefix=render/name.lower();subprocess.run(['pdftoppm','-r',str(dpi),'-png',str(path),str(prefix)],check=True,capture_output=True)
    images=sorted(render.glob(prefix.name+'-*.png'),key=lambda p:int(p.stem.rsplit('-',1)[1]));assert len(images)==expected
    tw=600;th=430 if dimensions!=(210,297) else 870;contact=Image.new('RGB',(tw*2,(th+30)*((len(images)+1)//2)),'#e6eee9');draw=ImageDraw.Draw(contact)
    for i,img in enumerate(images):
        with Image.open(img) as source:thumb=ImageOps.contain(source,(tw-16,th-16))
        x=(i%2)*tw+(tw-thumb.width)//2;y=(i//2)*(th+30)+30;contact.paste(thumb,(x,y));draw.text(((i%2)*tw+12,y-20),f'{name} / page {i+1}',fill='#203940')
    contact.save(out/f'pdf-{name}-contact.png');results.append({'name':name,'status':'PASS','pages':expected,'dimensionsMm':dimensions,'textBoundsVerified':True,'strictPdfParsing':True,'renderedFiles':[str(p.relative_to(out)) for p in images]})
(out/'pdf-results.json').write_text(json.dumps({'results':results,'renderedPages':sum(r['pages'] for r in results),'ownerMaxReferencesVerified':True,'engineeringAcceptance':False},indent=2),encoding='utf-8')
print('PASS:',sum(r['pages'] for r in results),'actual app PDF pages rendered; owner page register and complete maximum references checked')
