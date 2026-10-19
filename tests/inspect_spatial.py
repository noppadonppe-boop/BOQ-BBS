from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import pdfplumber, json, hashlib, subprocess, re, shutil, sys
root=Path(__file__).resolve().parents[1];out=root/'output/spatial-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
ctx=json.loads((out/'context.json').read_text(encoding='utf-8-sig'));results=[]
files=[('working-v6-A3.pdf',19,'A3','spatial-v6'),('frozen-v6-A3.pdf',19,'A3','spatial-v6'),('frozen-v6-A1.pdf',17,'A1','spatial-v6'),('old-v4-A3.pdf',8,'A3','general-v4'),('retry-v6-A3.pdf',19,'A3','spatial-v6'),('restored-v6-A1.pdf',17,'A1','spatial-v6'),('built-v6-A1.pdf',17,'A1','spatial-v6'),('regression-v5-A3.pdf',13,'A3','tangent-v5'),('regression-v5-A1.pdf',12,'A1','tangent-v5'),('regression-v4-A3.pdf',14,'A3','general-v4'),('regression-v4-A1.pdf',13,'A1','general-v4'),('regression-v3-A3.pdf',9,'A3','fabrication-v3'),('regression-v3-A1.pdf',8,'A1','fabrication-v3')]
if '--regression-only' in sys.argv:
    results=[r for r in json.loads((out/'pdf-verification.json').read_text(encoding='utf-8'))['results'] if not r['file'].startswith('regression')]
    for r in results:assert hashlib.sha256((out/'downloads'/r['file']).read_bytes()).hexdigest()==r['sha256']
    files=[f for f in files if f[0].startswith('regression')]
for name,pages,size,layout in files:
    path=out/'downloads'/name
    if name.startswith('regression'):
        source={'general-v4':'general-verification','tangent-v5':'tangent-verification','fabrication-v3':'fabrication-verification'}[layout]
        shutil.copy2(root/'output'/source/'downloads'/name.replace('regression','frozen'),path)
    reader=PdfReader(path);assert len(reader.pages)==pages,(name,len(reader.pages))
    dims={'A3':(420,297),'A1':(841,594)}[size];texts=[p.extract_text() for p in reader.pages];alltext=' '.join(' '.join(texts).split())
    for p,t in zip(reader.pages,texts):
        assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1 and abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
        assert 'NOT FOR CONSTRUCTION' in t and 'Layout '+layout in t
    if layout=='spatial-v6':
        assert alltext.count('ISOMETRIC DETAIL PENDING')==1
        assert 'outside bending dimensions PENDING' in alltext and 'BS 8666:2000 clauses 8.6, 8.8' in alltext
        for mark,cut in zip(['S01','S02','S03','S04','S05','S06'],ctx['cuts']):
            detail=next(t for t in texts if mark+' / ' in t and '/ part' in t)
            assert f'Cut used by BOQ: {cut:,} mm' in detail,(name,mark,cut)
            assert '6 total' in detail
        for mark in ['S01','S02','S03','S04']:
            coordinates=next(t for t in texts if mark+' / Coordinates and length basis' in t)
            last=12 if mark=='S04' else 3
            for i in range(last+1):assert f'P{i:02}' in coordinates
            assert 'NOT bend tangent points' in coordinates
            bendpages=[t for t in texts if mark+' / Bend tangent coordinates' in t]
            assert len(bendpages)==(3 if size=='A3' else 2) if mark=='S04' else len(bendpages)==1
            bendtext=' '.join(bendpages)
            for i in range(1,12 if mark=='S04' else 3):assert f'B{i:02}' in bendtext
        tangents=next(t for t in texts if 'S01 / Bend tangent coordinates' in t)
        for value in ['560 / 100 / 100','600 / 140 / 100','600 / 460 / 100','600 / 500 / 140','0 / 0 / 1','1 / 0 / 0']:assert value in tangents,(name,value)
        coordinates=next(t for t in texts if 'S03 / Coordinates and length basis' in t)
        compact=lambda s:re.sub(r'\s','',s).replace('\u200b','')
        assert compact(('ตรวจพิกัดหลายระนาบและจุดสัมผัสโค้ง '*30)[:500]) in compact(coordinates),(name,'note truncated')
        for i in range(26):assert f'{chr(65+i)}={(i+1)*100:,}' in coordinates
        assert 'G'*40 in alltext
        for ref in ([3,6,9,12,18,19] if size=='A3' else [2,5,8,11,16,17]):assert f'F{ref:02}' in alltext,(name,ref)
    elif name=='old-v4-A3.pdf':assert alltext.count('OUTSIDE DETAIL PENDING')==5
    elif layout=='tangent-v5':
        assert alltext.count('OUTSIDE DETAIL PENDING')==2
        for value in ['(A) = 395.871','C = 495.871','R = 32 (inside)','TA','TC']:assert value in alltext
    elif layout=='general-v4':
        assert alltext.count('OUTSIDE DETAIL PENDING')==2
        assert '(L02) = 403.314' in alltext and '(L12) = 100' in alltext
    else:
        assert 'OUTSIDE DETAIL PENDING' not in alltext
        for cut in ['925','750','1,000','1,600','1,850']:assert f'Cut used by BOQ: {cut} mm' in alltext
    with pdfplumber.open(path) as pdf:
        for i,p in enumerate(pdf.pages):
            assert p.chars and all(-2<c['x0']<p.width+2 and -2<c['x1']<p.width+2 and -2<c['top']<p.height+2 and -2<c['bottom']<p.height+2 for c in p.chars),(name,i,'text outside page')
            if layout=='spatial-v6' and '/ Isometric view / part' in texts[i]:assert len(p.lines)>100,(name,i,'missing isometric surface curves')
    folder=out/'renders'/path.stem;folder.mkdir(parents=True,exist_ok=True)
    for old in folder.glob('drawing-*.png'):
        assert old.resolve().is_relative_to(folder.resolve());old.unlink()
    subprocess.run([str(poppler),'-png','-r','75',str(path),str(folder/'drawing')],check=True,stdout=subprocess.DEVNULL)
    pngs=sorted(folder.glob('drawing-*.png'));assert len(pngs)==pages
    contact=Image.new('RGB',(1410,365*((pages+2)//3)),'white')
    for i,png in enumerate(pngs):
        with Image.open(png) as im:thumb=ImageOps.contain(im.convert('RGB'),(450,330))
        tile=Image.new('RGB',(470,365),'#edf2ef');tile.paste(thumb,((470-thumb.width)//2,10));ImageDraw.Draw(tile).text((12,348),str(i+1),fill='#203940');contact.paste(tile,((i%3)*470,(i//3)*365))
    contact.save(out/(path.stem+'-contact.png'))
    results.append({'file':name,'status':'PASS','pages':pages,'size':size,'layout':layout,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'renderedAllPages':True,'textWithinPage':True})
assert (out/'downloads/frozen-v6-A1.pdf').read_bytes()==(out/'downloads/restored-v6-A1.pdf').read_bytes()
assert hashlib.sha256((root/'Referrence/BS 8666.pdf').read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'sourceUnchanged':True,'renderer':'Poppler pdftoppm','visualReview':'Pending agent visual inspection'},indent=2),encoding='utf-8')
shutil.copy2(out/'downloads/frozen-v6-A3.pdf',root/'output/pdf/BS8666-2000-multiple-plane-draft.pdf')
print(f'PASS {len(results)} actual PDF files / {sum(r["pages"] for r in results)} leaves rendered; source unchanged; restored bytes exact')
