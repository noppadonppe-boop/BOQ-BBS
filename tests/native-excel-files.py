from pathlib import Path
import json,hashlib,subprocess,re
from pypdf import PdfReader
out=Path('output/native-excel-verification');data=json.loads((out/'native-results.json').read_text(encoding='utf-8-sig'));checks=[]
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
for a in data['artifacts']:
 p=out/a['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256'];r=PdfReader(p);assert len(r.pages)==4,'Expected one page per selected sheet; horizontal/vertical spill';texts=[];fonts=set();images=[]
 for i,page in enumerate(r.pages):
  size=[float(page.mediabox.width)*25.4/72,float(page.mediabox.height)*25.4/72];assert all(abs(n-v)<.15 for n,v in zip(size,[420,297])),size
  text=page.extract_text();texts.append(text)
  for font in page.get('/Resources',{}).get('/Font',{}).values():fonts.add(str(font.get_object().get('/BaseFont','')))
  prefix=out/(p.stem+f'-page-{i+1}');subprocess.run([poppler,'-f',str(i+1),'-l',str(i+1),'-singlefile','-r','120','-png',str(p),str(prefix)],check=True,capture_output=True);images.append(prefix.name+'.png')
 text='\n'.join(texts);assert all(s in text for s in ['SECTION-C1','V1','V2','V3','V4','H1','3.234','18.480','40.563']);assert all(s in text for s in ['A-A','B-B','C-C','1200.000' if not a['frozen'] else '1000.000']);assert 'NOT FOR CONSTRUCTION' in text
 boq_compact=re.sub(r'\s','',texts[1]);assert '3.234' in boq_compact and '40.563' in boq_compact and 'ครบตาม' in boq_compact and 'TOTAL' in boq_compact,'BOQ quantities and steel coverage must share one page'
 for i,t in enumerate(texts):(out/(p.stem+f'-page-{i+1}.txt')).write_text(t,encoding='utf8')
 checks.append({'file':a['file'],'status':'PASS','pages':len(r.pages),'fonts':sorted(fonts),'images':images,'sourceSha256':a['sourceSha256'],'check':'Native Microsoft Excel selected-print output, A3 landscape pages, actual expected values/text and source byte identity; rendered120dpi. Physical printer/other datasets not yet accepted.'})
(out/'file-results.json').write_text(json.dumps({'results':checks},ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps([{'file':r['file'],'pages':r['pages'],'fonts':r['fonts']}for r in checks],ensure_ascii=False,indent=2))
