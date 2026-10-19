from pathlib import Path
import json,subprocess,shutil,re
from pypdf import PdfReader
import pdfplumber

root=Path(__file__).resolve().parents[1];out=root/'output/tolerance-verification'
files={'primary':out/'BS-Table4-A4-draft.pdf','multiple':root/'tmp/pdfs/tolerance/multiple.pdf','precision':root/'tmp/pdfs/tolerance/precision.pdf'}
documents={};rendered=[]
for name,path in files.items():
    reader=PdfReader(path);pages=reader.pages;texts=[' '.join((p.extract_text() or '').split()) for p in pages]
    assert all(abs(float(p.mediabox.width)-595.28)<.2 and abs(float(p.mediabox.height)-841.89)<.2 for p in pages)
    table_pages=[i+1 for i,text in enumerate(texts) if 'BAR TOLERANCE REFERENCE' in text]
    assert table_pages
    with pdfplumber.open(path) as doc:
        for page in doc.pages:
            for char in page.chars:
                assert char['x0']>=-.2 and char['top']>=-.2 and char['x1']<=page.width+.2 and char['bottom']<=page.height+.2,(name,page.page_number,char['text'])
    if name=='primary':
        assert len(pages)==5 and table_pages==[5]
        assert '1975' in texts[0] and '5450' in texts[0]
        assert '995' in texts[-1] and '1,010' in texts[-1] and '1,980' in texts[-1] and '2,010' in texts[-1]
        assert '10101A' in texts[-1] and 'Manual cut / review' in texts[-1]
        selected=list(range(1,len(pages)+1))
    elif name=='multiple':
        assert len(table_pages)>=2
        combined=' '.join(texts[i-1] for i in table_pages)
        for i in range(6):assert combined.count('T4-M-'+str(i))==8
        for i in table_pages:assert 'Nominal' in texts[i-1] and 'Lower' in texts[i-1] and 'bs8666-2000-table4-reference-1.0' in texts[i-1]
        selected=table_pages
    else:
        assert 'Range unavailable / review' in ' '.join(texts)
        selected=list(range(1,len(pages)+1))
    for i in selected:
        prefix=out/('a4-page' if name=='primary' else name+'-page')
        subprocess.run([shutil.which('pdftoppm'),'-f',str(i),'-l',str(i),'-r','120','-png',str(path),str(prefix)],check=True,capture_output=True)
        rendered.append({'document':name,'page':i,'prefix':prefix.name})
    documents[name]={'pages':len(pages),'table4Pages':table_pages,'a4Sizes':True,'allTextInPageBounds':True}
results=[{'name':'Multi-page Table4 keeps all48 ranges,6 schedule identities and repeated headings','status':'PASS'},{'name':'Unrepresentable manual cut in A4 shows no fabricated reference interval','status':'PASS'}]
(out/'pdf-results.json').write_text(json.dumps({'status':'PASS','results':results,'documents':documents,'rendered':rendered,'visualReview':'Recorded separately in report after image inspection'},indent=2),encoding='utf-8')
print(json.dumps({'status':'PASS','documents':documents,'renderedCount':len(rendered)}))
