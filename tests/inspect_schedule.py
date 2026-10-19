from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import json, re, hashlib, subprocess

root=Path(__file__).resolve().parents[1]
out=root/'output/schedule-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
results=[]
for name,expected in [('working-A4.pdf',5),('frozen-member-A4.pdf',5),('frozen-package-A4.pdf',18),('retried-A4.pdf',5),('restored-A4.pdf',None),('build-frozen-A4.pdf',5)]:
    path=out/'downloads'/name
    reader=PdfReader(path)
    if expected is not None: assert len(reader.pages)==expected
    texts=[p.extract_text() for p in reader.pages]
    for p,t in zip(reader.pages,texts):
        assert abs(float(p.mediabox.width)*25.4/72-210)<.1
        assert abs(float(p.mediabox.height)*25.4/72-297)<.1
        assert 'NOT FOR CONSTRUCTION' in t and 'cutting-a4-v1' in t
        assert not re.search(r'\b(sheet|page)\b',t,re.I)
        assert 'complies with' not in t
    refs=[re.search(r'Schedule ref\s*(\d{5}[A-Z])',t).group(1) for t in texts if 'BAR CUTTING / BENDING SCHEDULE' in t]
    joined='\n'.join(texts)
    if name=='working-A4.pdf':
        assert refs==['04705C'] and 'x 9 members = 18 bars' in joined and '02 / B' in joined
    elif name in ['frozen-member-A4.pdf','retried-A4.pdf','build-frozen-A4.pdf']:
        assert refs==['04601A'] and 'x 3 members = 6 bars' in joined
        assert 'A4-SHAPES 03 T16 3 2 6 750 12 260 (510) 55' in re.sub(r'\s+',' ',texts[0])
        assert 'A + B + (C) - r - 2d = 976 mm' in joined and 'cut 1000 mm' in joined
        assert '02 / A' in joined and '04705C' not in joined
    elif name=='frozen-package-A4.pdf':
        assert refs==['04601A','04602A','04603A']
        assert 'M'*32 in joined and 'G'*40 in joined and 'Mark เกิน 6' in joined
    folder=out/'renders'/path.stem;folder.mkdir(parents=True,exist_ok=True)
    for old in folder.glob('a4-*.png'):
        assert old.resolve().is_relative_to(folder.resolve())
        old.unlink()
    subprocess.run([str(poppler),'-png','-r','90',str(path),str(folder/'a4')],check=True,stdout=subprocess.DEVNULL)
    assert len(list(folder.glob('a4-*.png')))==len(reader.pages)
    thumbs=[]
    for i,png in enumerate(sorted(folder.glob('a4-*.png')),1):
        with Image.open(png) as image:
            thumb=ImageOps.contain(image.convert('RGB'),(245,347))
        canvas=Image.new('RGB',(265,375),'#edf2ef');canvas.paste(thumb,((265-thumb.width)//2,12));ImageDraw.Draw(canvas).text((12,358),str(i),fill='#203940');thumbs.append(canvas)
    contact=Image.new('RGB',(265*3,375*((len(thumbs)+2)//3)),'white')
    for i,im in enumerate(thumbs):contact.paste(im,((i%3)*265,(i//3)*375))
    contact.save(out/(path.stem+'-contact.png'))
    results.append({'file':name,'status':'PASS','pages':len(reader.pages),'size':'A4 portrait','scheduleReferences':refs,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'renderedAllPages':True})
source=root/'Referrence/BS 8666.pdf'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'sourceUnchanged':True,'renderer':'Poppler pdftoppm'},indent=2),encoding='utf-8')
print('PASS: all A4 dimensions, original cuts/references, complete text, immutable restored source, and rendered pages')
