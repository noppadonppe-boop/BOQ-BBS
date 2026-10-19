from pathlib import Path
from hashlib import sha256
import json
from pypdf import PdfReader
out=Path('output/boq-basis-verification'); path=out/'Full-project-BOQ-QA.pdf'; reader=PdfReader(path); pages=[]
for i,p in enumerate(reader.pages,1):
    text=p.extract_text()
    pages.append({'page':i,'widthPt':float(p.mediabox.width),'heightPt':float(p.mediabox.height),'text':text})
alltext='\n'.join(p['text'] for p in pages)
assert 'NOT FOR CONSTRUCTION' in alltext
assert '174.000' in alltext
assert 'L2' in alltext and 'Zone' in alltext
for i in range(1,58): assert f'QA-{i:03}' in alltext, i
assert all('NOT FOR CONSTRUCTION' in p['text'] for p in pages)
results={'status':'PASS','file':path.name,'sha256':sha256(path.read_bytes()).hexdigest(),'pageCount':len(pages),'all57MemberLabels':True,'concreteTotal':174,'draftStatusEveryPage':True,'pages':pages}
(out/'pdf-content-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print('PASS: PDF',len(pages),'pages; 57 member labels, scope, 174.000 and Draft status on every page')
