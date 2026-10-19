from pathlib import Path
import json
from pypdf import PdfReader
import pypdfium2 as pdfium
root=Path('output/revision-verification')
results=[]
for name,expected,pages in [('revision-A3.pdf',(420,297),2),('revision-A1.pdf',(841,594),1),('download-again-A1.pdf',(841,594),1),('retried-A3.pdf',(420,297),2),('archive-restored-A1.pdf',(841,594),1)]:
    path=root/'downloads'/name
    doc=PdfReader(path)
    assert len(doc.pages)==pages,(name,len(doc.pages))
    texts=[]
    for i,page in enumerate(doc.pages):
        text=page.extract_text() or ''
        texts.append(text)
        size=(float(page.mediabox.width)*25.4/72,float(page.mediabox.height)*25.4/72)
        assert abs(size[0]-expected[0])<.1 and abs(size[1]-expected[1])<.1
        for term in ['NOT FOR CONSTRUCTION','Frozen','R002','Sheet','SECTION A-A','S-OPEN']:
            assert term in text,(name,i,term)
    for mark in ['B01','B02','B03','B04','B05','B06','B07']:
        assert mark in ''.join(texts),(name,mark)
    render=pdfium.PdfDocument(path)
    for i in range(len(doc.pages)):
        render[i].render(scale=1.25 if expected[0]==420 else .7).to_pil().save(root/f'{path.stem}-page-{i+1}.png')
    results.append({'file':name,'pages':pages,'size_mm':expected,'revision':'R002','status':'PASS'})
(root/'pdf-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
