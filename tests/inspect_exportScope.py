from pathlib import Path
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw,ImageChops
import json,subprocess,hashlib,re,pdfplumber
root=Path(__file__).resolve().parents[1];out=root/'output/scope-verification';ctx=json.loads((out/'context.json').read_text(encoding='utf-8'));results=[]
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
files=[('working-category-A3.pdf',1,'A3'),('frozen-category-A3.pdf',1,'A3'),('frozen-zone-A3.pdf',1,'A3'),('literal-null-floor0-A3.pdf',1,'A3'),('retry-frozen-category-A3.pdf',1,'A3'),('restored-frozen-zone-A3.pdf',1,'A3'),('scoped-source-A3.pdf',8,'A3'),('scoped-source-A1.pdf',8,'A1'),('scoped-schedule-A4.pdf',4,'A4'),('built-category-A3.pdf',1,'A3'),('built-scoped-source-A1.pdf',8,'A1')]
compact=lambda s:' '.join(s.split())
for name,n,size in files:
    path=out/'downloads'/name;pdf=PdfReader(path);assert len(pdf.pages)==n,(name,len(pdf.pages));texts=[p.extract_text() for p in pdf.pages];text=compact(' '.join(texts));dims={'A3':(420,297),'A1':(841,594),'A4':(210,297)}[size]
    for i,p in enumerate(pdf.pages):
        assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1 and abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
        assert 'NOT FOR CONSTRUCTION' in texts[i],(name,i,'draft label')
    if 'category' in name:
        assert 'BOQ / Category' in text and 'Scope: Zone: "A" / Floor: "L1"' in text
        assert 'TOTAL 25 62.880' in text if name.startswith('working') else 'TOTAL 7 7.680' in text
        if not name.startswith('working'):assert f'{ctx["expected"]["F"]*2+ctx["expected"]["B"]*4+ctx["expected"]["C"]:.3f}' in text
    if 'zone-A3' in name:assert 'BOQ / Zone' in text and 'TOTAL 12 16.080' in text
    if 'literal-null' in name:assert 'Scope: Zone: "null" / Floor: "0"' in text and 'TOTAL 1 2.400' in text
    if 'source' in name:
        cover=compact(texts[0]);assert 'SELECTED DRAWING PACKAGE' in cover and 'Scope: Zone: "A" / Floor: "L1"' in cover
        for member,qty in [('F-SCOPE',2),('B-SCOPE',4),('C-SCOPE',1)]:assert re.search(member+r'\s+\w+\s+A\s+L1\s+GRID-A-L1\s+'+str(qty),cover),(name,member,'cover quantity')
        assert 'SOURCE MARK INDEX' in texts[4]
        source=' '.join(texts[5:]);assert len(re.findall(r'#\d{3}\s+B0[12]',source))==4
        assert '4 pcs / cut 3000 mm' in source and '6 pcs / cut 4000 mm' in source and '4 pcs / cut 4500 mm' in source
        for p,t in enumerate(texts[5:]):assert 'UNVERIFIED' in t and 'original scale does not apply' in t and 'Source bytes verified against saved attachment hash.' in t
    if size=='A4':
        assert 'Scope: Member: F-SCOPE / Zone: "A" / Floor: "L1"' in text and '10001A' in text and '3000' in text and '4000' in text
        assert 'B-SCOPE' not in text and 'C-SCOPE' not in text
    with pdfplumber.open(path) as document:
        for i,p in enumerate(document.pages):
            assert p.chars and all(-1<c['x0']<p.width+1 and -1<c['x1']<p.width+1 and -1<c['top']<p.height+1 and -1<c['bottom']<p.height+1 for c in p.chars),(name,i,'text outside paper')
    folder=out/'renders'/path.stem;folder.mkdir(parents=True,exist_ok=True)
    subprocess.run([str(poppler),'-png','-r','75',str(path),str(folder/'drawing')],check=True,stdout=subprocess.DEVNULL)
    pngs=sorted(folder.glob('drawing-*.png'),key=lambda p:int(p.stem.split('-')[-1]));assert len(pngs)==n
    sheet=Image.new('RGB',(1410,365*((n+2)//3)),'white')
    for i,png in enumerate(pngs):
        with Image.open(png) as im:thumb=ImageOps.contain(im.convert('RGB'),(450,330))
        tile=Image.new('RGB',(470,365),'#eef3ef');tile.paste(thumb,((470-thumb.width)//2,10));ImageDraw.Draw(tile).text((12,348),str(i+1),fill='#203b40');sheet.paste(tile,((i%3)*470,(i//3)*365))
    sheet.save(out/(path.stem+'-contact.png'))
    results.append({'file':name,'pages':n,'size':size,'status':'PASS','renderedAllPages':True,'allTextWithinPaper':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
assert (out/'downloads/restored-frozen-zone-A3.pdf').read_bytes()==(out/'downloads/frozen-zone-A3.pdf').read_bytes()
for a,b in [('frozen-category-A3','retry-frozen-category-A3'),('frozen-category-A3','built-category-A3'),('scoped-source-A1','built-scoped-source-A1')]:
    assert [p.extract_text() for p in PdfReader(out/'downloads'/(a+'.pdf')).pages]==[p.extract_text() for p in PdfReader(out/'downloads'/(b+'.pdf')).pages]
    for x,y in zip(sorted((out/'renders'/a).glob('*.png')),sorted((out/'renders'/b).glob('*.png'))):
        with Image.open(x) as xx,Image.open(y) as yy:assert ImageChops.difference(xx,yy).getbbox() is None,(a,b,x.name)
assert hashlib.sha256((root/'output/pdf/BBS-source-mark-references-draft.pdf').read_bytes()).hexdigest()=='62c5dd983c83119143204bdd3aaccb0dc11dec40373accafc4e4068d5c7720cb'
assert hashlib.sha256((root/'Referrence/BS 8666.pdf').read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'scopedHistoryRestoredByteExact':True,'retryAndBuiltTextAndPixelsExact':True,'previousPrimaryAndBSUnchanged':True,'visualReview':'Pending agent visual inspection','scope':'Selected v0.16 outputs, synthetic independent box/manual-cut fixture. Previous source regression downloads are not all included in this PDF layout inspection.'},indent=2),encoding='utf-8')
print('PASS11 selected actual PDFs /35leaves rendered; quantities, source ownership, scope labels, text bounds, restored bytes and build/Retry parity checked')
