from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import pdfplumber, json, hashlib, subprocess, re, shutil, sys
root=Path(__file__).resolve().parents[1];out=root/'output/measurements-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
ctx=json.loads((out/'context.json').read_text(encoding='utf-8'));results=[]
files=[('working-v7-A3.pdf',13,'A3','measurements-v7'),('frozen-v7-A3.pdf',13,'A3','measurements-v7'),('frozen-v7-A1.pdf',11,'A1','measurements-v7'),('old-v6-A3.pdf',8,'A3','spatial-v6'),('retry-v7-A3.pdf',13,'A3','measurements-v7'),('restored-v7-A1.pdf',11,'A1','measurements-v7'),('built-v7-A1.pdf',11,'A1','measurements-v7')]
if '--regression' in sys.argv:
    for name,pages,size in [('frozen-v6-A3.pdf',19,'A3'),('frozen-v6-A1.pdf',17,'A1')]:
        target='regression-'+name;shutil.copy2(out/'regression-v6/downloads'/name,out/'downloads'/target);files.append((target,pages,size,'spatial-v6'))
compact=lambda s:re.sub(r'\s','',s).replace('\u200b','')
source=('แบบ QA-102 หน้า 2 จุดกำกับที่ระบุด้วยพิกัด รอตรวจสอบกับผิวนอกจริง '*20)[:300]
for name,pages,size,layout in files:
    path=out/'downloads'/name;reader=PdfReader(path);assert len(reader.pages)==pages,(name,len(reader.pages))
    dims={'A3':(420,297),'A1':(841,594)}[size];texts=[p.extract_text() for p in reader.pages];alltext=' '.join(' '.join(texts).split())
    for i,(p,t) in enumerate(zip(reader.pages,texts)):
        assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1 and abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
        assert 'NOT FOR CONSTRUCTION' in t and 'Layout '+layout in t and f'Sheet {i+1}/{pages}' in t,(name,i,'frame')
    assert 'outside bending dimensions PENDING' in alltext
    if layout=='measurements-v7':
        assert alltext.count('ISOMETRIC DETAIL PENDING')==1
        for mark,cut in zip(['D01','D02','D03'],ctx['cuts']):
            detail=next(t for t in texts if mark+' / ' in t and '/ part' in t)
            assert f'Cut used by BOQ: {cut:,} mm' in detail and '6 total' in detail
        d1=next(t for t in texts if 'D01 / Proposed dimension references' in t)
        for text in ['Abs delta X','Abs delta Y','Straight 3D','100 / 92 / 100','No tolerance adjustment','Outside proposal / UNVERIFIED','C = 13']:assert text in d1,(name,text)
        assert ('(A) = 510' in d1 and '610 / 92 / 100' in d1) if name.startswith('working') else ('A = 508' in d1 and '(B) = 400' in d1 and '608 / 92 / 100' in d1)
        d2=[t for t in texts if 'D02 / Proposed dimension references' in t];assert len(d2)==(4 if size=='A3' else 2)
        d2text=' '.join(d2)
        for c in 'ABCDEFGHIJKL':assert re.search(r'\(?'+c+r'\)? = [\d,.]+',d2text),(name,c)
        for t in d2:assert compact(source) in compact(t),(name,'source lost')
        assert '(L)' in d2text
        coords=next(t for t in texts if 'D02 / Coordinates and length basis' in t)
        assert compact(('ตรวจจุดอ้างอิงและมิติสามมิติ '*40)[:500]) in compact(coords),(name,'note lost')
        for ref in ['F02','F06','F13' if size=='A3' else 'F11']:assert ref in alltext,(name,ref)
    elif name=='old-v6-A3.pdf':assert 'Proposed dimension references / part' not in alltext
    else:
        for text in ['S04 / Isometric view / part 2/2','L12','P12','S01 / Bend tangent coordinates']:assert text in alltext,(name,text)
    with pdfplumber.open(path) as pdf:
        for i,p in enumerate(pdf.pages):
            assert p.chars and all(-2<c['x0']<p.width+2 and -2<c['x1']<p.width+2 and -2<c['top']<p.height+2 and -2<c['bottom']<p.height+2 for c in p.chars),(name,i,'text outside paper')
            if '/ Proposed dimension references / part' in texts[i]:assert len(p.lines)>100,(name,i,'missing geometry')
    folder=out/'renders'/path.stem;folder.mkdir(parents=True,exist_ok=True)
    subprocess.run([str(poppler),'-png','-r','75',str(path),str(folder/'drawing')],check=True,stdout=subprocess.DEVNULL)
    pngs=sorted(folder.glob('drawing-*.png'));assert len(pngs)==pages
    contact=Image.new('RGB',(1410,365*((pages+2)//3)),'white')
    for i,png in enumerate(pngs):
        with Image.open(png) as im:thumb=ImageOps.contain(im.convert('RGB'),(450,330))
        tile=Image.new('RGB',(470,365),'#edf2ef');tile.paste(thumb,((470-thumb.width)//2,10));ImageDraw.Draw(tile).text((12,348),str(i+1),fill='#203940');contact.paste(tile,((i%3)*470,(i//3)*365))
    contact.save(out/(path.stem+'-contact.png'))
    results.append({'file':name,'status':'PASS','pages':pages,'size':size,'layout':layout,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'renderedAllPages':True,'textWithinPage':True})
assert (out/'downloads/frozen-v7-A1.pdf').read_bytes()==(out/'downloads/restored-v7-A1.pdf').read_bytes()
assert hashlib.sha256((root/'Referrence/BS 8666.pdf').read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'sourceUnchanged':True,'renderer':'Poppler pdftoppm','visualReview':'Pending agent visual inspection'},indent=2),encoding='utf-8')
shutil.copy2(out/'downloads/frozen-v7-A3.pdf',root/'output/pdf/BS8666-2000-spatial-dimension-references-draft.pdf')
print(f'PASS {len(results)} actual PDF files / {sum(r["pages"] for r in results)} leaves rendered; source unchanged; restored bytes exact')
