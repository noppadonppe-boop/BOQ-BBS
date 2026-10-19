from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import pdfplumber, json, hashlib, subprocess, re, shutil

root=Path(__file__).resolve().parents[1]
out=root/'output/fabrication-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
results=[]
for name,pages,size in [('working-v3-A3.pdf',9,'A3'),('frozen-v3-A3.pdf',9,'A3'),('frozen-v3-A1.pdf',8,'A1'),('pending-99-A3.pdf',2,'A3'),('original-v2-A3.pdf',13,'A3'),('retried-v3-A3.pdf',9,'A3'),('legacy-v1-v3-A3.pdf',9,'A3'),('restored-v3-A1.pdf',8,'A1'),('built-v3-A1.pdf',8,'A1')]:
    path=out/'downloads'/name
    reader=PdfReader(path);assert len(reader.pages)==pages,(name,len(reader.pages))
    dims={'A3':(420,297),'A1':(841,594)}[size]
    texts=[p.extract_text() for p in reader.pages];alltext=' '.join(' '.join(texts).split())
    for p,t in zip(reader.pages,texts):
        assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1
        assert abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
        assert 'NOT FOR CONSTRUCTION' in t
        if 'original-v2' not in name:assert 'Layout fabrication-v3' in t
    if 'original-v2' in name:
        assert 'Layout fabrication-v3' not in alltext and '1,597' in alltext
    elif 'pending-99' in name:
        assert 'OUTSIDE DETAIL PENDING' in alltext and 'UNSUPPORTED' in alltext
        # The entire note and every separate reference dimension survive, without truncation.
        note=('ตรวจรูปเหล็กและกรอบข้อความ '*30)[:500]
        compact=lambda s:re.sub(r'\s','',s).replace('\u200b','')
        assert compact(note) in compact(alltext),(name,'note truncated')
        for i in range(26):assert f'{chr(65+i)}={(i+1)*100:,}' in alltext,(name,i)
        assert 'M'*32 in alltext and 'G'*40 in alltext
    elif 'legacy-v1' in name:
        assert 'minimum-1.0' in alltext and '1,625 mm' in alltext and alltext.count('OUTSIDE DETAIL PENDING')==3
        assert 'Centerline fallback / BS pending' in alltext
    else:
        assert 'minimum-2.0' in alltext and 'OUTSIDE DETAIL PENDING' not in alltext
        for code,cut in [('00','925'),('11','750'),('12','750'),('21','1,000'),('31','1,600'),('41','1,850'),('44','1,850')]:
            detail=next(t for t in texts if f'Outside bar detail / code {code}' in t)
            assert f'Cut used by BOQ: {cut} mm' in detail,(name,code)
            assert ('18 total' if name.startswith('working') else '6 total') in detail
            assert 'A = ' in detail
            if code=='00':assert 'Straight / no bend radius' in detail and 'inner r' not in detail
            if code=='12':assert 'r = 55 (inside)' in detail and 'inner r = 55' in detail and '(B) = 510' in detail and 'formula R = inside 55 mm' in detail
            if code=='31':assert '(D) = 310' in detail and '1,597 mm' in detail
            if code in ('41','44'):assert '(E) = 210' in detail and '1,832 mm' in detail
        # Every summary reference resolves to a real detail sheet in the same member package.
        summary=2 if size=='A3' else 1
        for i in range(7):assert f'F{summary+i+1:02}' in alltext
    with pdfplumber.open(path) as pdf:
        for i,p in enumerate(pdf.pages):
            assert p.chars
            assert all(-2<c['x0']<p.width+2 and -2<c['x1']<p.width+2 and -2<c['top']<p.height+2 and -2<c['bottom']<p.height+2 for c in p.chars),(name,i,'text outside page')
            if 'original-v2' not in name and 'Outside bar detail / code' in texts[i]:
                green=[line for line in p.lines if isinstance(line.get('stroking_color'),(tuple,list)) and len(line['stroking_color'])==3 and all(abs(a-b)<.015 for a,b in zip(line['stroking_color'],[31/255,117/255,88/255]))]
                vertical=[c for c in p.chars if not c['upright']]
                if vertical:
                    assert green,(name,i,'no bar surfaces')
                    left=min(l['x0'] for l in green);right=max(l['x1'] for l in green)
                    assert all(c['x1']<left or c['x0']>right for c in vertical),(name,i,'vertical dimension text overlaps bar envelope')
    folder=out/'renders'/path.stem;folder.mkdir(parents=True,exist_ok=True)
    for old in folder.glob('drawing-*.png'):
        assert old.resolve().is_relative_to(folder.resolve());old.unlink()
    subprocess.run([str(poppler),'-png','-r','75',str(path),str(folder/'drawing')],check=True,stdout=subprocess.DEVNULL)
    pngs=sorted(folder.glob('drawing-*.png'));assert len(pngs)==pages
    thumbs=[]
    for i,png in enumerate(pngs,1):
        with Image.open(png) as im:thumb=ImageOps.contain(im.convert('RGB'),(450,330))
        canvas=Image.new('RGB',(470,365),'#edf2ef');canvas.paste(thumb,((470-thumb.width)//2,10));ImageDraw.Draw(canvas).text((12,348),str(i),fill='#203940');thumbs.append(canvas)
    contact=Image.new('RGB',(470*3,365*((len(thumbs)+2)//3)),'white')
    for i,thumb in enumerate(thumbs):contact.paste(thumb,((i%3)*470,(i//3)*365))
    contact.save(out/(path.stem+'-contact.png'))
    results.append({'file':name,'status':'PASS','pages':pages,'size':size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'renderedAllPages':True,'textWithinPage':True})
assert (out/'downloads/frozen-v3-A1.pdf').read_bytes()==(out/'downloads/restored-v3-A1.pdf').read_bytes()
source=root/'Referrence/BS 8666.pdf';assert hashlib.sha256(source.read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'sourceUnchanged':True,'renderer':'Poppler pdftoppm','visualReview':'Pending agent visual inspection'},indent=2),encoding='utf-8')
primary=root/'output/pdf/BS8666-2000-outside-dimensions-draft.pdf';primary.parent.mkdir(exist_ok=True)
shutil.copy2(out/'downloads/frozen-v3-A3.pdf',primary)
print(f'PASS {len(results)} actual PDFs / {sum(r["pages"] for r in results)} leaves rendered; source unchanged; restored bytes exact')
