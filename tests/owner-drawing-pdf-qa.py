from pathlib import Path
import json,re,subprocess,hashlib
import pdfplumber
from PIL import Image,ImageOps,ImageDraw
root=Path.cwd();out=root/'output/owner-drawing-verification';dest=out/'pdf-render';dest.mkdir(parents=True,exist_ok=True)
read=lambda name:json.loads((out/name).read_text(encoding='utf-8'))
ui=read('ui-results.json');manifest=read('final-package-manifest.json');profile=manifest['project']['drawingProfile']
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
files=[('primary-A3',root/'output/pdf/owner-bbs-source-A3-draft.pdf','A3',True),('primary-A1',root/'output/pdf/owner-bbs-source-A1-draft.pdf','A1',True)]+[(j['layout'],root/j['path'],'A3',False) for j in ui['familyJobs'] if j['layout']!='source-v9']
results=[];norm=lambda s:''.join(s.split());pt=72/25.4
for label,path,size,primary in files:
 with pdfplumber.open(path) as pdf:
  identities=[];texts=[]
  for i,p in enumerate(pdf.pages):
   expected={'A3':(420,297),'A1':(841,594)}[size];assert abs(p.width/pt-expected[0])<.02 and abs(p.height/pt-expected[1])<.02
   full=p.extract_text() or '';texts.append(full);assert 'WORKING-CONTRACT-B' not in full and 'OWNER-BBS-F-NEW' not in full
   frame=p.crop((10*pt,p.height-51*pt,p.width-10*pt,p.height-9*pt));text=frame.extract_text() or ''
   number=re.findall(r'Drawing No\.: ([^\n]+?)(?: Sheet:|\n|$)',text);sheet=re.search(r'Sheet: (\d+)/(\d+) · '+size,text)
   assert len(number)==1 and sheet,(label,i,text)
   assert 'Drawing Rev.: 0A' in text and 'QA-UI-CONTRACT-A' in text and 'R003' in text and 'DRAFT / NOT FOR' in text and 'CONSTRUCTION' in text
   # Check full display texts in independent cells, avoiding interleaved wrapped rows.
   width=p.width-20*pt;edges=[10*pt,10*pt+width*.34,10*pt+width*.60,10*pt+width*.85,p.width-10*pt]
   cells=[norm(p.crop((edges[k]+1,p.height-51*pt,edges[k+1]-1,p.height-9*pt)).extract_text() or '') for k in range(4)]
   for field in ['company','projectName','owner','location']:assert norm(profile[field]) in cells[0],(label,i,field)
   for field in ['contract','discipline']:assert norm(profile[field]) in cells[1],(label,i,field)
   for field in ['preparedBy','checkedBy']:assert norm(profile[field]) in cells[2],(label,i,field)
   identities.append({'page':i+1,'number':number[0].strip(),'sheet':int(sheet[1]),'total':int(sheet[2])})
   outside=[c for c in p.chars if c['x0']<-.1 or c['x1']>p.width+.1 or c['top']<-.1 or c['bottom']>p.height+.1];assert not outside,(label,i,outside[:1])
  for number in set(r['number'] for r in identities):
   pages=[r for r in identities if r['number']==number];assert [r['sheet'] for r in pages]==list(range(1,len(pages)+1)) and all(r['total']==len(pages) for r in pages),(label,number,pages)
  if primary:subprocess.run([poppler,'-scale-to','1800','-png',str(path),str(dest/label)],check=True,capture_output=True)
  else:subprocess.run([poppler,'-f','1','-l','1','-scale-to','1600','-png',str(path),str(dest/label)],check=True,capture_output=True)
  (dest/(label+'-text.txt')).write_text('\n'.join(texts),encoding='utf-8')
  results.append({'file':str(path.relative_to(root)),'pages':len(pdf.pages),'paper':size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'identities':identities,'allOwnerFieldsComplete':True,'noWorkingMetadataLeak':True,'physicalSheetNumbersCorrect':True,'outOfPageCharacters':0,'renderedPages':'all' if primary else 'first','visualInspection':'pending'})
cover=out/'downloads/owner-final-transmittal.pdf'
with pdfplumber.open(cover) as pdf:
 text='\n'.join(p.extract_text() or '' for p in pdf.pages);numbers='\n'.join(p.crop((42*pt,45*pt,85*pt,274*pt)).extract_text() or '' for p in pdf.pages);titles='\n'.join(p.crop((130*pt,45*pt,195*pt,274*pt)).extract_text() or '' for p in pdf.pages)
 for d in manifest['documents']:
  for r in d.get('drawingReferences',[]):assert norm(r['number']) in norm(numbers) and norm(r['title']) in norm(titles),(r,numbers,titles)
 assert all(abs(p.width/pt-210)<.02 and abs(p.height/pt-297)<.02 for p in pdf.pages)
 assert all(not[c for c in p.chars if c['x0']<-.1 or c['x1']>p.width+.1 or c['top']<-.1 or c['bottom']>p.height+.1] for p in pdf.pages)
 subprocess.run([poppler,'-scale-to','1600','-png',str(cover),str(dest/'transmittal')],check=True,capture_output=True)
 results.append({'file':str(cover.relative_to(root)),'pages':len(pdf.pages),'paper':'A4','sha256':hashlib.sha256(cover.read_bytes()).hexdigest(),'allSevenOwnerNumbersAndTitlesPresent':True,'outOfPageCharacters':0,'renderedPages':'all','visualInspection':'pending'})
thai=out/'downloads/owner-thai-A3.pdf'
with pdfplumber.open(thai) as pdf:
 text='\n'.join(p.extract_text() or '' for p in pdf.pages)
 for value in ['เลขแบบ: QA-BBS-001','Revision แบบ: 0A','เจ้าของ:','เขียนแบบ:','QA-CONTRACT-001']:assert value in text,value
 subprocess.run([poppler,'-scale-to','1800','-png',str(thai),str(dest/'thai')],check=True,capture_output=True)
 results.append({'file':str(thai.relative_to(root)),'pages':len(pdf.pages),'paper':'A3','sha256':hashlib.sha256(thai.read_bytes()).hexdigest(),'ThaiDefaultLabelsPresent':True,'renderedPages':'all','visualInspection':'pending'})
stress=out/'downloads/owner-cover-120-diagnostic.pdf';sm=read('cover-stress-manifest.json')
with pdfplumber.open(stress) as pdf:
 assert len(pdf.pages)<=20
 numbers='\n'.join(p.crop((42*pt,45*pt,85*pt,274*pt)).extract_text() or '' for p in pdf.pages)
 titles='\n'.join(p.crop((130*pt,45*pt,195*pt,274*pt)).extract_text() or '' for p in pdf.pages)
 for d in sm['documents']:
  for r in d['drawingReferences']:assert norm(r['number']) in norm(numbers) and norm(r['title']) in norm(titles),r
 assert all(not[c for c in p.chars if c['x0']<-.1 or c['x1']>p.width+.1 or c['top']<-.1 or c['bottom']>p.height+.1] for p in pdf.pages)
 subprocess.run([poppler,'-scale-to','1400','-png',str(stress),str(dest/'cover-diagnostic')],check=True,capture_output=True)
 results.append({'file':str(stress.relative_to(root)),'pages':len(pdf.pages),'paper':'A4','sha256':hashlib.sha256(stress.read_bytes()).hexdigest(),'all120OwnerNumbersAndTitlesPresent':True,'outOfPageCharacters':0,'renderedPages':'all','visualInspection':'pending','scope':'Diagnostic only, not an actual completed submission or engineering evidence'})
for label in ['primary-A3','primary-A1']:
 images=sorted(dest.glob(label+'-*.png'));canvas=Image.new('RGB',(1100,420*len(images)), '#e2e8ea');draw=ImageDraw.Draw(canvas)
 for i,path in enumerate(images):
  im=Image.open(path);im.thumbnail((1080,390));canvas.paste(im,((1100-im.width)//2,420*i+25));draw.text((10,420*i+5),path.name,fill='black')
 canvas.save(dest/(label+'-contact.jpg'))
(out/'pdf-results.json').write_text(json.dumps({'results':results,'visualInspection':'pending'},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS owner PDF fields/paper/numbering:',len(results),'files; visual inspection pending')
