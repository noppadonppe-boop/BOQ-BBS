from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import pdfplumber, json, hashlib, subprocess, re, shutil
root=Path(__file__).resolve().parents[1];out=root/'output/general-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
ctx=json.loads((out/'context.json').read_text(encoding='utf-8'));results=[]
files=[('working-v4-A3.pdf',14,'A3'),('frozen-v4-A3.pdf',14,'A3'),('frozen-v4-A1.pdf',13,'A1'),('old-v3-A3.pdf',9,'A3'),('retry-v4-A3.pdf',14,'A3'),('restored-v4-A1.pdf',13,'A1'),('built-v4-A1.pdf',13,'A1'),('regression-v3-A3.pdf',9,'A3'),('regression-v3-A1.pdf',8,'A1')]
for name,pages,size in files:
    path=out/'downloads'/name
    if name.startswith('regression'):
        shutil.copy2(root/'output/fabrication-verification/downloads'/name.replace('regression','frozen'),path)
    reader=PdfReader(path);assert len(reader.pages)==pages,(name,len(reader.pages))
    dims={'A3':(420,297),'A1':(841,594)}[size];texts=[p.extract_text() for p in reader.pages];alltext=' '.join(' '.join(texts).split())
    for p,t in zip(reader.pages,texts):
        assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1 and abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
        assert 'NOT FOR CONSTRUCTION' in t
        assert ('Layout fabrication-v3' if (name.startswith('old') or name.startswith('regression')) else 'Layout general-v4') in t
    if (name.startswith('old') or name.startswith('regression')):
        
        if name.startswith('old'):assert alltext.count('OUTSIDE DETAIL PENDING')==6
        else:
            assert 'OUTSIDE DETAIL PENDING' not in alltext
            for cut in ['925','750','1,000','1,600','1,850']:assert f'Cut used by BOQ: {cut} mm' in alltext
            assert 'r = 55 (inside)' in alltext and 'formula R = inside 55 mm' in alltext
    else:
        assert alltext.count('OUTSIDE DETAIL PENDING')==2
        assert 'bent in two planes' in alltext and 'Figure 4' in alltext
        for mark,cut in zip(['G01','G02','G03','G04','G05','G06','G07'],ctx['cuts']):
            detail=next(t for t in texts if mark+' / ' in t and ('outside detail' in t or 'Standard outside detail' in t))
            assert f'Cut used by BOQ: {cut:,} mm' in detail,(name,mark,cut)
            assert '6 total' in detail
        assert '(L02) = 403.314' in alltext and 'L01 = 503.314' in alltext
        assert '45' in alltext and '30' in alltext and 'No tolerance adjustment applied' in alltext
        assert '(L12) = 100' in alltext and '(L12)=100' in alltext
        long_pages=[t for t in texts if 'G04 / ' in t]
        assert len(long_pages)==3,(name,len(long_pages))
        coordinates=next(t for t in long_pages if 'Coordinates and bending basis' in t)
        for i in range(13):assert f'P{i:02}' in coordinates
        for i in range(1,13):assert f'L{i:02}' in ' '.join(long_pages)
        compact=lambda s:re.sub(r'\s','',s).replace('\u200b','')
        note=('ตรวจรูปพิเศษและมิติอิสระ '*30)[:500]
        assert compact(note) in compact(coordinates),(name,'note truncated')
        for i in range(26):assert f'{chr(65+i)}={(i+1)*100:,}' in coordinates,(name,i)
        assert 'G'*40 in alltext
        summary=2 if size=='A3' else 1
        for offset in [1,3,5,7,10,11,12]:assert f'F{summary+offset:02}' in alltext,(name,offset)
    with pdfplumber.open(path) as pdf:
        for i,p in enumerate(pdf.pages):
            assert p.chars and all(-2<c['x0']<p.width+2 and -2<c['x1']<p.width+2 and -2<c['top']<p.height+2 and -2<c['bottom']<p.height+2 for c in p.chars),(name,i,'text outside page')
            if not (name.startswith('old') or name.startswith('regression')) and 'Code 99 outside detail' in texts[i] and 'OUTSIDE DETAIL PENDING' not in texts[i]:
                green=[line for line in p.lines if isinstance(line.get('stroking_color'),(tuple,list)) and len(line['stroking_color'])==3 and all(abs(a-b)<.015 for a,b in zip(line['stroking_color'],[31/255,117/255,88/255]))]
                assert len(green)>4,(name,i,'no physical envelope')
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
    results.append({'file':name,'status':'PASS','pages':pages,'size':size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'renderedAllPages':True,'textWithinPage':True})
assert (out/'downloads/frozen-v4-A1.pdf').read_bytes()==(out/'downloads/restored-v4-A1.pdf').read_bytes()
assert hashlib.sha256((root/'Referrence/BS 8666.pdf').read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'sourceUnchanged':True,'renderer':'Poppler pdftoppm','visualReview':'Pending agent visual inspection'},indent=2),encoding='utf-8')
shutil.copy2(out/'downloads/frozen-v4-A3.pdf',root/'output/pdf/BS8666-2000-planar-code99-draft.pdf')
print(f'PASS {len(results)} actual PDF files / {sum(r["pages"] for r in results)} leaves rendered; source unchanged; restored bytes exact')
