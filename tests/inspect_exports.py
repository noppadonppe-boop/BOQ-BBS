from pathlib import Path
import json
from pypdf import PdfReader
import pypdfium2 as pdfium
root=Path('output/dev-verification')
results=[]
for name,expected in [('bbs-A3.pdf',(420,297)),('bbs-A1.pdf',(841,594)),('boq.pdf',(420,297))]:
    p=root/'downloads'/name
    r=PdfReader(p)
    texts=[page.extract_text() or '' for page in r.pages]
    for i,page in enumerate(r.pages):
        size=(float(page.mediabox.width)*25.4/72,float(page.mediabox.height)*25.4/72)
        assert abs(size[0]-expected[0])<.1 and abs(size[1]-expected[1])<.1,(name,i,size)
        if name.startswith('bbs'):
            assert 'NOT FOR CONSTRUCTION' in texts[i],(name,i)
            assert 'Sheet' in texts[i] and 'Draft' in texts[i],(name,i)
    if name.startswith('bbs'):
        assert len(r.pages)==6,(name,len(r.pages))
    doc=pdfium.PdfDocument(p)
    for i in {0,len(r.pages)-1}:
        doc[i].render(scale=1.1 if name.endswith('A3.pdf') else .6).to_pil().save(root/f'{p.stem}-page-{i+1}.png')
    results.append({'file':name,'pages':len(r.pages),'size_mm':expected,'draft_warning_each_sheet':name.startswith('bbs'),'status':'PASS'})
(root/'pdf-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
