from pathlib import Path
import json, subprocess, re
from pypdf import PdfReader
import pdfplumber
from PIL import Image, ImageOps, ImageDraw
root=Path(__file__).resolve().parents[1];out=root/'output/source-schedule-verification';render=out/'pdf-rendered';render.mkdir(exist_ok=True)
files=[('SRC-frozen-A3',(420,297)),('SRC-frozen-A1',(841,594)),('SRC-frozen-A4',(210,297)),('GULF-source-reference-A3',(420,297)),('SRC-max-notes-A3',(420,297)),('SRC-max-notes-A4',(210,297))]
files.extend([('SRC-max-owner-A3',(420,297)),('SRC-max-owner-A1',(841,594))])
if (out/'SRC-built-working-A4.pdf').exists():files.append(('SRC-built-working-A4',(210,297)))
results=[]
for name,dimensions in files:
    path=out/(name+'.pdf');reader=PdfReader(path,strict=True);texts=[p.extract_text() for p in reader.pages];combined='\n'.join(texts)
    assert 'Source BBS comparison' in combined,(name,'missing supplement')
    for i,(p,t) in enumerate(zip(reader.pages,texts)):
        actual=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72)
        assert all(abs(a-b)<.2 for a,b in zip(actual,dimensions)),(name,actual)
        assert 'NOT FOR CONSTRUCTION' in t or 'NOT FOR\nCONSTRUCTION' in t,(name,i,'missing draft')
    if name.startswith('SRC-max'):
        assert 'END_SCOPE12' in combined,(name,'scope note truncated')
        for i in range(8):assert 'END_ROW_'+str(i)+'12' in combined,(name,i,'note truncated')
        assert ('Rows 7-8' in combined if dimensions==(420,297) else 'Rows 5-8' in combined if dimensions==(210,297) else 'Rows 1-8' in combined)
    if name.startswith('SRC-frozen'):
        assert '790' in combined and '800' in combined and 'R01' in combined and 'R02' in combined
    if name.startswith('GULF'):
        assert '862.5' in combined and '862.49' in combined and 'Unmapped' in combined
    with pdfplumber.open(path) as pdf:
        for p in pdf.pages:
            for c in p.chars:assert c['x0']>=-.5 and c['x1']<=p.width+.5 and c['top']>=-.5 and c['bottom']<=p.height+.5,(name,p.page_number,c)
            if name in ['SRC-frozen-A3','SRC-frozen-A1','SRC-max-owner-A3','SRC-max-owner-A1']:
                # App owner footer registers/stamps each source appendix page too.
                assert re.search(r'Sheet\s*:',p.extract_text() or '',re.I),(name,p.page_number,'owner footer missing')
    prefix=render/name.lower();subprocess.run(['C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe','-r','70' if dimensions!=(841,594) else '45','-png',str(path),str(prefix)],check=True,capture_output=True)
    images=sorted(render.glob(prefix.name+'-*.png'),key=lambda p:int(p.stem.rsplit('-',1)[1]));assert len(images)==len(texts)
    tw=600;th=430 if dimensions!=(210,297) else 870;contact=Image.new('RGB',(tw*2,(th+30)*((len(images)+1)//2)),'#e6eee9');draw=ImageDraw.Draw(contact)
    for i,img in enumerate(images):
        with Image.open(img) as source:thumb=ImageOps.contain(source,(tw-16,th-16))
        x=(i%2)*tw+(tw-thumb.width)//2;y=(i//2)*(th+30)+30;contact.paste(thumb,(x,y));draw.text(((i%2)*tw+12,y-20),f'{name} / page {i+1}',fill='#203940')
    contact.save(out/f'pdf-{name}-contact.png');results.append({'name':name,'status':'PASS','pages':len(texts),'dimensionsMm':dimensions,'textBoundsVerified':True,'completeMaximumNotesVerified':name.startswith('SRC-max'),'strictPdfParsing':True,'renderedFiles':[str(p.relative_to(out)) for p in images]})
(out/'pdf-results.json').write_text(json.dumps({'results':results,'renderedPages':sum(r['pages'] for r in results),'engineeringAcceptance':False},indent=2),encoding='utf-8')
print('PASS:',sum(r['pages'] for r in results),'actual app PDF pages rendered; notes/bounds/owner-footer checked')
