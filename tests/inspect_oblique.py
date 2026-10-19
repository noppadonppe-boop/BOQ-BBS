from pathlib import Path
import json,hashlib,subprocess,re,sys
import pdfplumber
from pypdf import PdfReader
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[1]
out=root/'output/oblique-shape-verification'
latest=json.loads((out/'final-results.json').read_text(encoding='utf-8'))
poppler=Path(r'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
results=[]
for record in latest['exports']:
    size=record['size'];name=f'oblique-final-{size}.pdf';p=out/'downloads'/name
    sha=hashlib.sha256(p.read_bytes()).hexdigest();assert sha==record['sha256']
    reader=PdfReader(p);expected={'A3':8,'A1':7,'A4':7}[size]
    assert len(reader.pages)==expected,(size,len(reader.pages))
    target={'A3':(420,297),'A1':(841,594),'A4':(210,297)}[size]
    texts=[' '.join((page.extract_text() or '').split()) for page in reader.pages]
    for i,(page,text) in enumerate(zip(reader.pages,texts),1):
        assert all(abs(float(d)*25.4/72-e)<.1 for d,e in zip([page.mediabox.width,page.mediabox.height],target))
        assert 'NOT FOR CONSTRUCTION' in text and 'R002' in text
        if size!='A4':assert f'Sheet {i}/{expected} / {size}' in text
    for mark,code,cut in [('O15','15','1,025'),('O25','25','1,225'),('O26','26','1,400'),('O46','46','2,200'),('E15','15','1,000'),('E26','26','1,400')]:
        key=f'/ {mark} / Outside bar detail' if size!='A4' else f'{mark} / UNSET'
        detail=next(t for t in texts if key in t)
        assert 'Note 1' in detail and '6 total' in detail if size!='A4' else 'Note 1' in detail and '2 bars per member x 3 members = 6 bars' in detail
        assert 'OUTSIDE DETAIL PENDING' not in detail and 'UNSUPPORTED' not in detail
        if size!='A4':
            assert f'Cut used by BOQ: {cut} mm' in detail
            assert ('over 45 deg: exact selected' if mark.startswith('E') else '45 deg or less: approximate selected') in detail
            assert 'r = 32 (inside)' in detail
        else:assert ('over45: exact' if mark.startswith('E') else 'up to45: approximate') in detail
    if size!='A4':
        d=next(t for t in texts if '/ O46 / Outside' in t)
        assert d.count('B = 400')>=3 and '(E) = 600' in d
        d=next(t for t in texts if '/ O25 / Outside' in t)
        assert 'If E is critical, use Code 99' in d
    outside=[]
    with pdfplumber.open(p) as doc:
        for i,page in enumerate(doc.pages,1):
            for w in page.extract_words():
                if w['x0']<0 or w['top']<0 or w['x1']>page.width+.5 or w['bottom']>page.height+.5:outside.append((i,w['text']))
    assert not outside,(size,outside)
    subprocess.run([str(poppler),'-scale-to','1800','-png',str(p),str(out/'pdf-render'/f'final-{size}')],check=True)
    (out/'pdf-render'/f'final-{size}-text.txt').write_text('\n\n'.join(texts),encoding='utf-8')
    results.append({'file':str(p),'size':size,'pages':expected,'sha256':sha,'status':'PASS','allTextWithinPage':True,'rendered':True})
    print('PASS',size,expected,'pages',sha)
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'totalFinalLeaves':22,'scope':'Actual built app exports; text/paper/pages/hash checked and all final pages rendered. Visual inspection is recorded separately. Synthetic QA, not engineering or owner conformity.'},indent=2),encoding='utf-8')
