from pathlib import Path
import json
import hashlib
import math
import subprocess
from pypdf import PdfReader

root = Path('Referrence/ตัวอย่าง BBS')
out = Path('output/gulf-reference-inspection')
out.mkdir(parents=True, exist_ok=True)
files = []
for source in sorted(root.glob('*.pdf')):
    doc = PdfReader(source)
    pages = []
    for i, page in enumerate(doc.pages):
        pages.append({'page':i+1,'points':[float(page.mediabox.width),float(page.mediabox.height)],'rotation':page.rotation,'text':page.extract_text()})
    files.append({'file':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'pages':pages})
(out/'source-index.json').write_text(json.dumps(files, ensure_ascii=False, indent=2),encoding='utf-8')
source = root/'GULF-ISB-CU-FL10600-2C1-100.pdf'
doc = PdfReader(source)
page = doc.pages[0]
w,h=float(page.mediabox.width),float(page.mediabox.height)
if page.rotation % 180:
    w,h=h,w
scale=4500/max(w,h)
width,height=math.ceil(w*scale),math.ceil(h*scale)
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
logs=[]
for name, coords in [
    ('original-sheet',(0,0,1,1)),
    ('source-schedule',(.78,.01,.998,.23)),
    ('source-elevation',(.28,.05,.50,.85)),
    ('source-section-AA',(.49,.48,.93,.88)),
    ('source-section-BB',(.57,.19,.89,.46)),
]:
    x,y=int(coords[0]*width),int(coords[1]*height)
    cw,ch=min(width-x,math.ceil((coords[2]-coords[0])*width)),min(height-y,math.ceil((coords[3]-coords[1])*height))
    r=subprocess.run([poppler,'-f','1','-l','1','-singlefile','-png','-scale-to','4500','-x',str(x),'-y',str(y),'-W',str(cw),'-H',str(ch),str(source),str(out/name)],check=True,capture_output=True)
    logs.append({'region':name,'stderr':r.stderr.decode('utf-8',errors='replace')})
(out/'render-log.json').write_text(json.dumps(logs,indent=2),encoding='utf-8')
print('Read',len(files),'actual reference PDFs; rendered original-sheet and4 PDF regions. No input files modified.')
