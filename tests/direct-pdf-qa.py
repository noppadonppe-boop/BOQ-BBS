from pathlib import Path
import subprocess,json,sys
from pypdf import PdfReader
sys.stdout.reconfigure(encoding='utf-8')
root=Path.cwd();out=root/'output/direct-sdk-verification';render=out/'pdf-rendered';render.mkdir(exist_ok=True)
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
files=[('direct-bbs-A3.pdf',(420,297)),('direct-bbs-A1.pdf',(841,594)),('direct-cutting-A4.pdf',(210,297)),('direct-boq-A3.pdf',(420,297)),('direct-transmittal.pdf',(210,297))]
results=[]
for name,dims in files:
 p=out/'downloads'/name;r=PdfReader(p)
 for page in r.pages:
  actual=(float(page.mediabox.width)*25.4/72,float(page.mediabox.height)*25.4/72)
  assert all(abs(a-b)<1 for a,b in zip(actual,dims)),(name,actual)
 assert 'NOT FOR CONSTRUCTION' in ''.join(page.extract_text() or '' for page in r.pages)
 subprocess.run([str(poppler),'-r','65','-png',str(p),str(render/p.stem)],check=True,capture_output=True)
 results.append({'name':name,'status':'PASS','pages':len(r.pages),'paperMillimetres':list(dims),'scope':'Actual completed direct-SDK download; rendered for visual review'})
(out/'pdf-results.json').write_text(json.dumps({'results':results},indent=2),encoding='utf-8')
print(json.dumps(results))

