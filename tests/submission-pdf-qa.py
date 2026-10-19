from pathlib import Path
import json, hashlib, subprocess
import pdfplumber
from pypdf import PdfReader

root=Path.cwd()
dest=root/'output/submission-verification/pdf-render'
dest.mkdir(parents=True,exist_ok=True)
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
files=[('normal',root/'output/pdf/submission-transmittal-draft.pdf','ui'),('stress',root/'output/pdf/submission-transmittal-30-documents-draft.pdf','stress')]
results=[]
for label,path,manifest_name in files:
    m=json.loads((root/f'output/submission-verification/{manifest_name}-manifest.json').read_text(encoding='utf-8'))
    reader=PdfReader(path)
    with pdfplumber.open(path) as pdf:
        text='\n'.join(p.extract_text() or '' for p in pdf.pages)
        normalized=''.join(text.split())
        # Read the title column independently; reading whole rows interleaves
        # other cells between wrapped title lines.
        title_text='\n'.join(p.crop((47*72/25.4,45*72/25.4,95*72/25.4,274*72/25.4)).extract_text() or '' for p in pdf.pages).replace('ชื่อเอกสาร','')
        title_normalized=''.join(title_text.split())
        for d in m['documents']:
            assert ''.join(d['reference'].split()) in normalized,d['reference']
            assert ''.join(d['title'].split()) in title_normalized,d['title']
        assert ''.join(m['recipient'].split()) in normalized
        assert ''.join(m['note'].split()) in normalized
        out_of_page=[{'page':i+1,'text':c.get('text'),'box':[c['x0'],c['top'],c['x1'],c['bottom']]} for i,p in enumerate(pdf.pages) for c in p.chars if c['x0']<0 or c['x1']>p.width+.1 or c['top']<0 or c['bottom']>p.height+.1]
        assert not out_of_page,out_of_page[:5]
        assert all(abs(p.width-210*72/25.4)<1 and abs(p.height-297*72/25.4)<1 for p in pdf.pages)
        assert all('DRAFT / NOT FOR CONSTRUCTION' in (p.extract_text() or '') for p in pdf.pages)
    subprocess.run([str(poppler),'-scale-to','1400','-png',str(path),str(dest/label)],check=True,capture_output=True)
    (dest/f'{label}-text.txt').write_text(text,encoding='utf-8')
    results.append({'file':str(path.relative_to(root)),'pages':len(reader.pages),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'allReferencesAndFullTitlesPresent':True,'recipientAndNoteComplete':True,'paperA4EveryPage':True,'outOfPageCharacters':0,'rendered':True,'visualInspection':'pending'})
# Actual application drawing sheets, distinct from synthetic stress sources.
for tag,pattern in [('bbs','ui-*-drawing-details-R003-A1.pdf'),('boq','ui-*-boq-R003-A3.pdf'),('schedule','ui-*-schedule-R003-A4.pdf')]:
    path=next((root/'output/submission-verification/downloads').glob(pattern))
    reader=PdfReader(path)
    subprocess.run([str(poppler),'-f','1','-l','1','-scale-to','1600','-png',str(path),str(dest/tag)],check=True,capture_output=True)
    results.append({'file':str(path.relative_to(root)),'pages':len(reader.pages),'renderedRepresentativePage':1,'visualInspection':'pending','scope':'Draft software fixture, manual2500mm; no engineering certification'})
(root/'output/submission-verification/pdf-results.json').write_text(json.dumps({'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':'structural/text checks passed; visual inspection pending','pages':[r['pages'] for r in results]}))
