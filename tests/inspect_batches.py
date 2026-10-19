from pathlib import Path
import json
from pypdf import PdfReader
import pypdfium2 as pdfium
root=Path('output/batch-verification')
path=root/'downloads'/'520-members-boq.pdf'
doc=PdfReader(path)
texts=[]
for i,page in enumerate(doc.pages):
    text=page.extract_text() or ''
    texts.append(text)
    size=(float(page.mediabox.width)*25.4/72,float(page.mediabox.height)*25.4/72)
    assert abs(size[0]-420)<.1 and abs(size[1]-297)<.1
    for term in ['NOT FOR CONSTRUCTION','Draft','BATCH-520','BOQ',f'Page {i+1}/{len(doc.pages)}']:
        assert term in text,(i,term)
for i in range(1,521):
    assert f'B-{i:04d}' in '\n'.join(texts)
assert 'TOTAL' in texts[-1] and '3744.600' in texts[-1].replace(',','')
render=pdfium.PdfDocument(path)
for i in {0,len(doc.pages)//2,len(doc.pages)-1}:
    render[i].render(scale=1.1).to_pil().save(root/f'boq-page-{i+1}.png')
result={'file':'520-members-boq.pdf','pages':len(doc.pages),'members':520,'size_mm':[420,297],'header_footer_each_page':True,'totalConcrete':3744.6,'status':'PASS'}
(root/'pdf-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
