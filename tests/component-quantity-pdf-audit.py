from pathlib import Path
from pypdf import PdfReader
from PIL import Image,ImageDraw
import hashlib,json,subprocess
out=Path('F:/Project Code/BOQ_BBS/output/component-quantity-verification');file=out/'C1-Partial-Input-BOQ-A3.pdf';before=hashlib.sha256(file.read_bytes()).hexdigest();pdf=PdfReader(file);assert len(pdf.pages)==3
for page in pdf.pages:
 assert abs(float(page.mediabox.width)*25.4/72-420)<.1
 assert abs(float(page.mediabox.height)*25.4/72-297)<.1
text=pdf.pages[0].extract_text() or '';assert 'TOTAL 78 252.252 PENDING' in text;assert 'NOT FOR CONSTRUCTION' in text
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe';r=subprocess.run([poppler,'-r','90','-png',str(file),str(out/'partial-boq')],capture_output=True,text=True);assert r.returncode==0
(out/'pdf-render.log').write_text(r.stderr,encoding='utf-8');images=sorted(out.glob('partial-boq-*.png'));assert len(images)==3;contact=Image.new('RGB',(1500,380),'#edf2f3');draw=ImageDraw.Draw(contact)
for i,p in enumerate(images):
 im=Image.open(p).convert('RGB');im.thumbnail((480,340));contact.paste(im,(i*500+10,30));draw.text((i*500+10,8),f'Partial input BOQ A3 / Page {i+1}',fill='#18333b')
contact.save(out/'partial-boq-contact.png');assert hashlib.sha256(file.read_bytes()).hexdigest()==before
(out/'pdf-results.json').write_text(json.dumps({'status':'PASS','actualRegisteredPdf':True,'a3Pages3':True,'count78Concrete252_252':True,'otherQuantitiesPending':True,'notForConstruction':True,'allPagesRendered':True,'originalBytesUnchanged':True,'sha256':before,'engineeringApproval':False},indent=2),encoding='utf-8');print('PASS actual partial BOQ PDF:3A3pages/count78/concrete252.252/otherPENDING, original bytes unchanged')
