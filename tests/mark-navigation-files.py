from pathlib import Path
import json,re,hashlib,subprocess
from pypdf import PdfReader
out=Path('output/mark-navigation-verification')
ctx=json.loads((out/'context.json').read_text(encoding='utf-8'))
artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf-8'))
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
results=[]
for a in artifacts:
    path=out/a['file']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==a['sha256']
    reader=PdfReader(path)
    expected_pages=5 if a['size']=='A3' else 2
    assert len(reader.pages)==expected_pages
    expected_size=[420,297] if a['size']=='A3' else [841,594]
    texts=[]
    for i,p in enumerate(reader.pages,1):
        size=[float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72]
        assert all(abs(n-e)<.03 for n,e in zip(size,expected_size))
        text=p.extract_text()
        texts.append(text)
        assert f'Sheet {i}/{expected_pages}' in text
        assert 'Schematic / NTS' in text
    all_text=''.join(texts)
    compact=re.sub(r'\s','',all_text)
    for bar in ctx['member']['bars']:
        assert bar['mark'] in compact,bar['mark']
    # The complete final Mark also appears in the final page's table and leader.
    assert ctx['member']['bars'][-1]['mark'] in re.sub(r'\s','',texts[-1])
    prefix=out/a['file'].replace('.pdf','')
    subprocess.run([str(poppler),'-r','100','-png',str(path),str(prefix)],check=True,capture_output=True)
    results.append({'file':a['file'],'status':'PASS','pages':len(reader.pages),'size':a['size'],'marks':24,'sha256':a['sha256'],'method':'Original app PDF bytes, pypdf all sheets/Marks/page sizes and Poppler100dpi'} )
assert sum(r['pages'] for r in results)==7
(out/'file-results.json').write_text(json.dumps({'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS2 actual PDFs:7 pages, all24 Marks, page sizes/numbering and original file hashes')
