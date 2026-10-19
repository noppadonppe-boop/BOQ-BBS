from pathlib import Path
import json,subprocess
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageOps,ImageDraw

root=Path(__file__).resolve().parents[1];out=root/'output/arc-verification';render=out/'pdf-rendered';render.mkdir(exist_ok=True)
results=[]
for label,size,dimensions,pages_expected,dpi in [('A3','A3',(420,297),4,100),('A1','A1',(841,594),4,65),('A4','A4',(210,297),5,110),('coordinates-A3','A3',(420,297),9,100),('coordinates-A1','A1',(841,594),8,65)]:
    path=out/f'BS67-{label}-draft.pdf';reader=PdfReader(path,strict=True)
    assert len(reader.pages)==pages_expected
    texts=[p.extract_text() for p in reader.pages]
    for p,t in zip(reader.pages,texts):
        actual=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72)
        assert all(abs(a-b)<.2 for a,b in zip(actual,dimensions)),(size,actual)
        assert 'NOT FOR CONSTRUCTION' in t,(size,t[:120])
    combined=' '.join(texts)
    assert all(mark in combined for mark in ['ARC','RIB','SITE'])
    assert 'analytic' in combined.lower() and 'Supply straight' in combined
    if label in ('A3','A1'):assert 'radius leader shortened' in combined
    if label.startswith('coordinates'):
        assert 'P1 start / P2 exact halfway / P3 end of continuous arc' in combined
        assert 'C01: sweep' in combined and 'C01 @ P2: turn' not in combined
        assert 'R inside = 1,000 mm' in texts[0]
        assert 'Table 5 supply' in combined
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for char in page.chars:
                assert char['x0']>=-.5 and char['x1']<=page.width+.5 and char['top']>=-.5 and char['bottom']<=page.height+.5,(size,page.page_number,char)
    prefix=render/f'bs67-{label.lower()}'
    subprocess.run(['pdftoppm','-r',str(dpi),'-png',str(path),str(prefix)],check=True,capture_output=True)
    images=sorted(render.glob(prefix.name+'-*.png'));assert len(images)==pages_expected
    thumb_w=650;thumb_h=460 if size!='A4' else 960;contact=Image.new('RGB',(thumb_w*2,(thumb_h+30)*((len(images)+1)//2)),'#e6eee9');draw=ImageDraw.Draw(contact)
    for i,img in enumerate(images):
        with Image.open(img) as source:thumb=ImageOps.contain(source,(thumb_w-16,thumb_h-16))
        x=(i%2)*thumb_w+(thumb_w-thumb.width)//2;y=(i//2)*(thumb_h+30)+30
        contact.paste(thumb,(x,y));draw.text(((i%2)*thumb_w+12,y-20),f'{label} / page {i+1}',fill='#203940')
    contact.save(out/f'pdf-{label}-contact.png')
    results.append({'label':label,'size':size,'status':'PASS','pages':len(images),'dimensionsMm':dimensions,'textBoundsVerified':True,'renderedFiles':[str(p.relative_to(out)) for p in images]})
(out/'pdf-results.json').write_text(json.dumps({'results':results,'renderedPages':sum(r['pages'] for r in results),'engineeringAcceptance':False},indent=2),'utf8')
print('PASS: five actual PDF exports, page dimensions, text bounds and30 rendered pages')
