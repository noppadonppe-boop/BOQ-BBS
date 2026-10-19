from pathlib import Path
from pypdf import PdfReader
from PIL import Image,ImageDraw
import hashlib,json,subprocess
out=Path('F:/Project Code/BOQ_BBS/output/reported-quantity-verification');file=out/'Source-C1-BOQ-Pending-A3.pdf';before=hashlib.sha256(file.read_bytes()).hexdigest();pdf=PdfReader(file)
assert len(pdf.pages)==3
for page in pdf.pages:
 assert abs(float(page.mediabox.width)*25.4/72-420)<.1
 assert abs(float(page.mediabox.height)*25.4/72-297)<.1
text=pdf.pages[0].extract_text() or ''
assert text.count('PENDING')>=35
assert all('2C1-'+str(i) in text for i in [100,101,102,103])
assert 'NOT FOR CONSTRUCTION' in text
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
r=subprocess.run([poppler,'-r','85','-png',str(file),str(out/'source-boq')],capture_output=True,text=True);assert r.returncode==0
(out/'pdf-render.log').write_text(r.stderr,encoding='utf-8')
images=sorted(out.glob('source-boq-*.png'));assert len(images)==3
contact=Image.new('RGB',(1500,380),'#edf2f3');draw=ImageDraw.Draw(contact)
for i,p in enumerate(images):
 im=Image.open(p).convert('RGB');im.thumbnail((480,340));contact.paste(im,(i*500+10,30));draw.text((i*500+10,8),f'Actual source BOQ A3 / Page {i+1}',fill='#18333b')
contact.save(out/'source-boq-contact.png');assert hashlib.sha256(file.read_bytes()).hexdigest()==before
(out/'pdf-results.json').write_text(json.dumps({'status':'PASS','actualRegisteredPdf':True,'a3Pages3':True,'pendingMainQuantities':True,'notForConstruction':True,'allPagesRendered':True,'originalBytesUnchanged':True,'sha256':before,'engineeringApproval':False},indent=2),encoding='utf-8')
print('PASS actual pending source BOQ A3:3pages rendered, paper/codes/PENDING/NOTFORCONSTRUCTION correct')
