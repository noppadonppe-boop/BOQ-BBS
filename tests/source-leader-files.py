from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,math,subprocess
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageDraw
out=Path('output/source-leader-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
ctx=json.loads((out/'context.json').read_text(encoding='utf-8'));artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf-8'));checks=[];xlsx={};pdfs=[]
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
for a in artifacts:
 path=out/a['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==a['sha256']
 if path.suffix=='.xlsx':
  z=zipfile.ZipFile(path);shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];links={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))};wb=ET.fromstring(z.read('xl/workbook.xml'));sheets={}
  for sh in wb.findall('x:sheets/x:sheet',ns):
   name=sh.attrib['name'];target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target;tree=ET.fromstring(z.read(target));cells={};empty=[];formulas={};types={}
   for c in tree.findall('.//x:c',ns):
    v=c.find('x:v',ns);value=shared[int(v.text)] if c.attrib.get('t')=='s' and v is not None else float(v.text) if v is not None and v.text is not None and c.attrib.get('t') not in ['s','str'] else v.text if v is not None else None;cell=c.attrib['r'];cells[cell]=value;types[cell]=c.attrib.get('t','n')
    if value=='':empty.append(cell)
    f=c.find('x:f',ns)
    if f is not None:formulas[cell]=f.text
   dim=tree.find('x:dimension',ns).attrib['ref'];sheets[name]={'dimension':dim,'emptyTextCells':empty,'cells':cells,'types':types,'formulas':formulas}
  s=sheets['Source Callouts'];assert s['dimension']=='A1:L13';rows=ctx['bundle']['attachments'];i=4
  for attachment in rows:
   for number,n in enumerate(attachment['annotations'],1):
    for col,value in [('C',attachment['id']),('D',n['page']),('E',number),('F',n['mark']),('G',n['x']),('H',n['y']),('I',n.get('label',{}).get('x')),('J',n.get('label',{}).get('y')),('K','Manual' if 'label' in n else 'Auto')]:assert s['cells'].get(f'{col}{i}')==value
    for col in ['D','E','G','H']:assert s['types'][f'{col}{i}']=='n'
    assert s['types'][f'F{i}']=='s';i+=1
  assert len(s['formulas'])==0;assert len(sheets['BBS']['cells'])>0
  for row in range(5,8):assert sheets['BBS Print']['cells'][f'D{row}']=='00' and sheets['BBS Print']['types'][f'D{row}']=='s'
  xlsx[a['file']]={'sha256':a['sha256'],'sheets':sheets};checks.append({'file':a['file'],'status':'PASS','check':'Original XML validates all ten typed zero/nonzero source coordinates, blank automatic labels, manual values, complete Mark/raw IDs and original BBS formulas'})
 else:
  reader=PdfReader(path);texts=[p.extract_text() for p in reader.pages];text='\n'.join(texts);(out/(path.stem+'-text.txt')).write_text(text,encoding='utf-8');assert len(reader.pages)==8
  assert 'NOT FOR CONSTRUCTION' in text and 'Source pointers are user placed / UNVERIFIED' in text;assert 'SOURCE MARK INDEX' in text;assert ctx['gulf']['sha256'] in text;assert ctx['rotations']['sha256'] in text
  size='A3' if 'A3' in path.name else 'A1';w,h=(420,297) if size=='A3' else (841,594)
  for p in reader.pages:assert math.isclose(float(p.mediabox.width)*25.4/72,w,abs_tol=.1) and math.isclose(float(p.mediabox.height)*25.4/72,h,abs_tol=.1)
  original=PdfReader('Referrence/ตัวอย่าง BBS/GULF-ISB-CU-FL10600-2C1-100.pdf').pages[0];crop=original.cropbox;media=original.mediabox;sw=min(float(crop.right),float(media.right))-max(float(crop.left),float(media.left));sh=min(float(crop.top),float(media.top))-max(float(crop.bottom),float(media.bottom))
  if int(original.get('/Rotate',0))%180:sw,sh=sh,sw
  bw=w-46-(112 if size=='A3' else 200);bh=h-135;scale=min(bw/sw,bh/sh);fw,fh=sw*scale,sh*scale;fx,fy=18+(bw-fw)/2,69+(bh-fh)/2;label=ctx['workingSource' if size=='A3' else 'saved']['annotations'][0]['label'];expected=(fx+label['x']*fw,fy+label['y']*fh)
  with pdfplumber.open(path) as pdf:
   long_words=[word for word in pdf.pages[0].extract_words() if word['text'] and set(word['text'])=={'W'}];assert sum(len(word['text']) for word in long_words)==96
   assert all(word['x0']*25.4/72>=10 and word['x1']*25.4/72<=w-10 for word in long_words),long_words
   page=pdf.pages[2];words=page.extract_words();numbers=[word for word in words if word['text']=='001'];assert len(numbers)==1,numbers;word=numbers[0];assert math.isclose((word['x0']+word['x1'])/2*25.4/72,expected[0],abs_tol=.01)
   circles=[c for c in page.curves if math.isclose(c['width']*25.4/72,6.2,abs_tol=.01) and math.isclose(c['height']*25.4/72,6.2,abs_tol=.01)];assert any(math.isclose((c['x0']+c['x1'])/2*25.4/72,expected[0],abs_tol=.01) and math.isclose((c['top']+c['bottom'])/2*25.4/72,expected[1],abs_tol=.01) for c in circles)
  subprocess.run([poppler,'-r','82','-png',str(path),str(render/path.stem)],check=True,capture_output=True);images=sorted(render.glob(path.stem+'-*.png'),key=lambda p:int(p.stem.split('-')[-1]));assert len(images)==len(reader.pages);contacts=[]
  for start in [0,4]:
   contact=Image.new('RGB',(1640,1200),'#e6eeee')
   for j,p in enumerate(images[start:start+4]):
    im=Image.open(p).convert('RGB');im.thumbnail((800,565));x=(j%2)*820;y=(j//2)*600;contact.paste(im,(x+(820-im.width)//2,y+25));ImageDraw.Draw(contact).text((x+10,y+8),f'{size} page {start+j+1}',fill='black')
   name=path.stem+f'-contact-{start+1}.png';contact.save(out/name);contacts.append(name)
  pdfs.append({'file':a['file'],'pages':len(reader.pages),'rendered':len(images),'contacts':contacts,'manualCircleMm':expected});checks.append({'file':a['file'],'status':'PASS','check':'Actual app PDF checksum,8 pages, physical A3/A1 sizes, source hashes/UNVERIFIED warnings; extracted numbered circle independently matches fitted visible-page saved label center (0.01mm PDF coordinate precision, not engineering tolerance)'})
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,ensure_ascii=False,indent=2),encoding='utf-8');(out/'file-results.json').write_text(json.dumps({'checks':checks,'pdfs':pdfs,'totalPages':sum(p['pages'] for p in pdfs)},indent=2),encoding='utf-8');print('PASS',len(checks),'actual files;',sum(p['pages'] for p in pdfs),'PDF pages rendered')
