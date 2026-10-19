from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import json, hashlib, subprocess, re, shutil

root=Path(__file__).resolve().parents[1]
out=root/'output/shape-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
results=[]
for name,pages,size in [('wizard-working-A4.pdf',4,'A4'),('v2-frozen-A4.pdf',4,'A4'),('v2-frozen-A3.pdf',6,'A3'),('v2-frozen-A1.pdf',5,'A1'),('v1-frozen-A4.pdf',4,'A4'),('v1-frozen-A3.pdf',6,'A3'),('v2-restored-A4.pdf',4,'A4'),('built-v2-A4.pdf',4,'A4')]:
    path=out/'downloads'/name
    reader=PdfReader(path);assert len(reader.pages)==pages
    dims={'A4':(210,297),'A3':(420,297),'A1':(841,594)}[size]
    texts=[p.extract_text() for p in reader.pages];alltext=' '.join(' '.join(texts).split())
    for p,t in zip(reader.pages,texts):
        assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1
        assert abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
        assert 'NOT FOR CONSTRUCTION' in t
    if size=='A4':
        assert all('cutting-a4-v1' in t for t in texts)
        assert not re.search(r'\b(page|sheet)\b',alltext,re.I)
    if name.startswith('v1-'):
        assert 'Centerline fallback / BS pending' in alltext and 'bs8666-2000-v1' in alltext if size=='A4' else 'minimum-1.0' in alltext
        assert '1625 mm' in alltext if size=='A4' else '1,625 mm' in alltext
        assert 'สูตรอัตโนมัติรองรับ 00 / 11 / 12 / 21 ' in alltext
    elif name=='wizard-working-A4.pdf':
        assert '1044 mm' in alltext and '1172 mm' in alltext and 'รอยืนยันตำแหน่ง' in alltext and '08201A' in alltext
    else:
        assert ('A + B + C + (D) - 1.5r - 3d = '+('1597' if size=='A4' else '1,597')+' mm') in alltext
        assert ('A + B + C + D + (E) - 2r - 4d = '+('1832' if size=='A4' else '1,832')+' mm') in alltext
        assert '1600 mm' in alltext if size=='A4' else '1,600 mm' in alltext
        assert 'x 3 members = 6 bars' in alltext if size=='A4' else '6 total' in alltext
        assert 'bs8666-2000-v2' in alltext if size=='A4' else 'minimum-2.0' in alltext
    folder=out/'renders'/path.stem;folder.mkdir(parents=True,exist_ok=True)
    for old in folder.glob('drawing-*.png'):
        assert old.resolve().is_relative_to(folder.resolve())
        old.unlink()
    subprocess.run([str(poppler),'-png','-r','75',str(path),str(folder/'drawing')],check=True,stdout=subprocess.DEVNULL)
    assert len(list(folder.glob('drawing-*.png')))==len(reader.pages)
    thumbs=[]
    for i,png in enumerate(sorted(folder.glob('drawing-*.png')),1):
        with Image.open(png) as im:thumb=ImageOps.contain(im.convert('RGB'),(330,310))
        canvas=Image.new('RGB',(350,340),'#edf2ef');canvas.paste(thumb,((350-thumb.width)//2,10));ImageDraw.Draw(canvas).text((12,323),str(i),fill='#203940');thumbs.append(canvas)
    sheet=Image.new('RGB',(350*2,340*((len(thumbs)+1)//2)),'white')
    for i,thumb in enumerate(thumbs):sheet.paste(thumb,((i%2)*350,(i//2)*340))
    sheet.save(out/(path.stem+'-contact.png'))
    results.append({'file':name,'status':'PASS','pages':pages,'size':size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'renderedAllPages':True})
assert (out/'downloads/v2-frozen-A4.pdf').read_bytes()==(out/'downloads/v2-restored-A4.pdf').read_bytes()
source=root/'Referrence/BS 8666.pdf';assert hashlib.sha256(source.read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'sourceUnchanged':True,'renderer':'Poppler pdftoppm'},indent=2),encoding='utf-8')
pdf=root/'output/pdf';pdf.mkdir(exist_ok=True)
shutil.copy2(out/'downloads/v2-frozen-A4.pdf',pdf/'BS8666-2000-shapes-31-41-44-draft.pdf')
print(f'PASS {len(results)} PDF files / {sum(r["pages"] for r in results)} leaves rendered; source unchanged; restored bytes exact')
