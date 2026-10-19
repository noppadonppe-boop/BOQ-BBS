from pathlib import Path
import json,hashlib
from pypdf import PdfReader
import pdfplumber
out=Path('output/member-quantity-readiness-verification');file=out/'Member-Quantity-Readiness-A3.pdf';pdf=PdfReader(file)
for i,p in enumerate(pdf.pages):
    assert abs(float(p.mediabox.width)-1190.55)<.1 and abs(float(p.mediabox.height)-841.89)<.1
    assert f'Page {i+1}/{len(pdf.pages)}' in (p.extract_text() or '')
with pdfplumber.open(file) as doc:
    table=next(t for t in doc.pages[0].extract_tables() if t and t[0][0]=='Member');p=next(r for r in table if r[0]=='PENDING-A');t=next(r for r in table if r[0]=='TOTAL');r=next(r for r in table if r[0]=='READY-B');l=next(r for r in table if r[0]=='LEGACY-C')
    assert p[2:8]==['PENDING']*6 and t[2:8]==['PENDING']*6,(p,t)
    assert p[8].startswith('PENDING / preview') and t[8].startswith('PENDING / preview')
    assert r[2]=='3' and r[3]=='3.240';assert l[2]=='4' and l[3]=='4.000'
    coverage=next(page for page in doc.pages if 'BOQ reinforcement coverage' in (page.extract_text() or ''));ct=next(t for t in coverage.extract_tables() if t and t[0][0]=='Member');cp=next(row for row in ct if row[0]=='PENDING-A');assert cp[3]=='PENDING' and 'PROVISIONAL' in cp[1]
    texts='\n'.join(p.extract_text() or '' for p in doc.pages);assert 'PROVISIONAL QUANTITY INPUTS' in texts and 'NOT FOR CONSTRUCTION' in texts
result={'status':'PASS','pages':len(pdf.pages),'size':'A3','bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'pendingQuantityAndSteelTotalsHeld':True,'enteredAndLegacyNumbersRetained':True,'sourceInputNotEngineeringApproval':True};(out/'pdf-audit.json').write_text(json.dumps(result,indent=2),encoding='utf8');print('PASS actualPDF pending count/steel, ready/legacy arithmetic, coverage and page dimensions/numbers')
