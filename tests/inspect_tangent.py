from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import pdfplumber, json, hashlib, subprocess, re, shutil
root=Path(__file__).resolve().parents[1];out=root/'output/tangent-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
ctx=json.loads((out/'context.json').read_text(encoding='utf-8-sig'));results=[]
files=[('working-v5-A3.pdf',13,'A3','tangent-v5'),('frozen-v5-A3.pdf',13,'A3','tangent-v5'),('frozen-v5-A1.pdf',12,'A1','tangent-v5'),('old-v4-A3.pdf',9,'A3','general-v4'),('retry-v5-A3.pdf',13,'A3','tangent-v5'),('restored-v5-A1.pdf',12,'A1','tangent-v5'),('built-v5-A1.pdf',12,'A1','tangent-v5'),('regression-v4-A3.pdf',14,'A3','general-v4'),('regression-v4-A1.pdf',13,'A1','general-v4'),('regression-v3-A3.pdf',9,'A3','fabrication-v3'),('regression-v3-A1.pdf',8,'A1','fabrication-v3')]
for name,pages,size,layout in files:
    path=out/'downloads'/name
    if name.startswith('regression'):
        source='general-verification' if layout=='general-v4' else 'fabrication-verification'
        shutil.copy2(root/'output'/source/'downloads'/name.replace('regression','frozen'),path)
    reader=PdfReader(path);assert len(reader.pages)==pages,(name,len(reader.pages))
    dims={'A3':(420,297),'A1':(841,594)}[size];texts=[p.extract_text() for p in reader.pages];alltext=' '.join(' '.join(texts).split())
    for p,t in zip(reader.pages,texts):
        assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1 and abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
        assert 'NOT FOR CONSTRUCTION' in t and 'Layout '+layout in t
    if layout=='tangent-v5':
        assert alltext.count('OUTSIDE DETAIL PENDING')==2
        assert 'Figure 4' in alltext and 'R = 32 (inside)' in alltext
        for mark,cut in zip(['T01','T02','T03','T04','T05','T06','T07'],ctx['cuts']):
            detail=next(t for t in texts if mark+' / ' in t and ('outside detail' in t or 'Standard outside detail' in t))
            assert f'Cut used by BOQ: {cut:,} mm' in detail,(name,mark,cut)
            assert '6 total' in detail
        for value in ['C = 495.871','(A) = 395.871','B = 396.441','C = 478.718','(A) = 378.718','C = 398.718','(A) = 298.718','B = 214.928']:
            assert value in alltext,(name,value)
        assert 'TA' in alltext and 'TC' in alltext and 'No tolerance adjustment applied' in alltext
        for mark in ['T01','T02','T03','T04']:
            coordinates=next(t for t in texts if mark+' / Coordinates and bending basis' in t)
            for point in ['P00','P01','P02']:assert point in coordinates
            assert 'Figure 4 tangent dimensions' in coordinates
        coordinates=next(t for t in texts if 'T03 / Coordinates and bending basis' in t)
        compact=lambda s:re.sub(r'\s','',s).replace('\u200b','')
        assert compact(('ตรวจมุมแหลมเส้นสัมผัสและมิติอิสระ '*30)[:500]) in compact(coordinates),(name,'note truncated')
        for i in range(26):assert f'{chr(65+i)}={(i+1)*100:,}' in coordinates
        assert 'G'*40 in alltext
        summary=2 if size=='A3' else 1
        for offset in [1,3,5,7,9,10,11]:assert f'F{summary+offset:02}' in alltext,(name,offset)
    elif name=='old-v4-A3.pdf':
        assert alltext.count('OUTSIDE DETAIL PENDING')==6 and 'Figure 4' in alltext
    elif layout=='general-v4':
        assert alltext.count('OUTSIDE DETAIL PENDING')==2
        assert '(L02) = 403.314' in alltext and '(L12) = 100' in alltext
    else:
        assert 'OUTSIDE DETAIL PENDING' not in alltext
        for cut in ['925','750','1,000','1,600','1,850']:assert f'Cut used by BOQ: {cut} mm' in alltext
    with pdfplumber.open(path) as pdf:
        for i,p in enumerate(pdf.pages):
            assert p.chars and all(-2<c['x0']<p.width+2 and -2<c['x1']<p.width+2 and -2<c['top']<p.height+2 and -2<c['bottom']<p.height+2 for c in p.chars),(name,i,'text outside page')
            if layout=='tangent-v5' and 'Code 99 outside detail' in texts[i] and 'OUTSIDE DETAIL PENDING' not in texts[i]:
                blue=[line for line in p.lines if isinstance(line.get('stroking_color'),(tuple,list)) and len(line['stroking_color'])==3 and all(abs(a-b)<.015 for a,b in zip(line['stroking_color'],[69/255,116/255,165/255]))]
                assert len(blue)>=2,(name,i,'missing tangent constructions')
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
assert (out/'downloads/frozen-v5-A1.pdf').read_bytes()==(out/'downloads/restored-v5-A1.pdf').read_bytes()
assert hashlib.sha256((root/'Referrence/BS 8666.pdf').read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'sourceUnchanged':True,'renderer':'Poppler pdftoppm','visualReview':'Pending agent visual inspection'},indent=2),encoding='utf-8')
shutil.copy2(out/'downloads/frozen-v5-A3.pdf',root/'output/pdf/BS8666-2000-acute-tangent-draft.pdf')
print(f'PASS {len(results)} actual PDF files / {sum(r["pages"] for r in results)} leaves rendered; source unchanged; restored bytes exact')
