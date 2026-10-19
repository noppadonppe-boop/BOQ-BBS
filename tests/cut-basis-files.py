from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,subprocess,math,sys
from pypdf import PdfReader
from PIL import Image,ImageDraw
out=Path('output/cut-basis-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf-8'));checks=[];xlsx={};pdfs=[]
only_cuts='--cuts-only' in sys.argv
only_xlsx='--xlsx-only' in sys.argv
if only_cuts:
 previous=json.loads((out/'file-results.json').read_text(encoding='utf-8'));checks=[c for c in previous['checks'] if not c['file'].startswith('cut-')];pdfs=previous['pdfs'];xlsx={f:m for f,m in json.loads((out/'xlsx-checks.json').read_text(encoding='utf-8')).items() if not f.startswith('cut-')}
if only_xlsx:
 previous=json.loads((out/'file-results.json').read_text(encoding='utf-8'));checks=[c for c in previous['checks'] if c['file'].endswith('.pdf')];pdfs=previous['pdfs']
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for a in artifacts:
 path=out/a['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==a['sha256']
 if only_xlsx and path.suffix=='.pdf':continue
 if only_cuts and not a['type'].startswith('cut-'):continue
 if path.suffix=='.xlsx':
  z=zipfile.ZipFile(path);shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];links={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))};wb=ET.fromstring(z.read('xl/workbook.xml'));sheets={};styles=ET.fromstring(z.read('xl/styles.xml')).find('x:cellXfs',ns)
  wanted=['Cutting Plan','Patterns','Cuts']+(['Cut Basis','Captured Demand','Input Stock','Source References'] if a['type']!='cut-legacy' else []) if a['type'].startswith('cut-') else ['Source BBS Check','Source BBS Notes','BOQ Coverage','BOQ','BBS']
  for name in wanted:
   sh=next(sh for sh in wb.findall('x:sheets/x:sheet',ns) if sh.attrib['name']==name);target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target;tree=ET.fromstring(z.read(target));cells={};empty=[];formulas={};types={};alignments={}
   for c in tree.findall('.//x:c',ns):
    v=c.find('x:v',ns);value=shared[int(v.text)] if c.attrib.get('t')=='s' and v is not None else float(v.text) if v is not None and c.attrib.get('t') not in ['s','str'] else v.text if v is not None else None;cells[c.attrib['r']]=value;types[c.attrib['r']]=c.attrib.get('t','n')
    alignment=styles[int(c.attrib.get('s','0'))].find('x:alignment',ns);alignments[c.attrib['r']]=dict(alignment.attrib) if alignment is not None else {}
    if value=='':empty.append(c.attrib['r'])
    f=c.find('x:f',ns)
    if f is not None:formulas[c.attrib['r']]=f.text;assert 'IFERROR' not in f.text
   if name=='Cutting Plan':assert cells['C8']==3 and cells['C9']==400
   if name=='Patterns':assert "'Cutting Plan'!C8" in formulas['H5'];assert "'Cutting Plan'!C9" in formulas['I5'];assert cells['J5']==0 and alignments['J5']['horizontal']=='right'
   if name=='Cut Basis' and a['type']=='cut-complete':assert cells['C5']==2 and cells['D5']==5 and cells['F19']==0 and types['F19']=='b'
   if name=='Captured Demand':assert cells['F5']==(15 if a['type']=='cut-partial' else 6)
   if name=='Source BBS Check':assert cells['I4']==cells['J4']==15 and cells['P4']=='Matched';assert "'Source BBS Notes'!H4" in formulas['J4'] and "'Source BBS Notes'!H4" in formulas['N4'];assert cells['O4']==0 and alignments['O4']['horizontal']=='right'
   if name=='Source BBS Notes':assert cells['H4']==5 and cells['I4']==2
   if name=='BOQ Coverage':assert cells['B4']=='ENTERED BBS' and cells['D4']>0
   if name=='BBS':assert cells['F4']=='00' and types['F4']=='s' and cells['G4']==3 and cells['H4']==2 and cells['K4']==6
   sheets[name]={'dimension':tree.find('x:dimension',ns).attrib['ref'],'emptyTextCells':empty,'cells':cells,'types':types,'formulas':formulas,'alignments':alignments}
  xlsx[a['file']]={'sha256':a['sha256'],'type':a['type'],'sheets':sheets};checks.append({'file':a['file'],'status':'PASS','check':'Actual XML numerical/quantity/state/formula checks; preserved C8/C9 and separate selected/source quantities'})
 else:
  reader=PdfReader(path);texts=[p.extract_text() for p in reader.pages];text='\n'.join(texts);(out/(path.stem+'-text.txt')).write_text(text,encoding='utf-8');assert 'NOT FOR CONSTRUCTION' in text
  if a['type']=='schedule-v1':
   for word in ['source member qty 5 / selected 2','15 / 15','Matched','Shape, placement and engineering approval not verified']:assert word in text,(a['file'],word)
  else:assert 'ENTERED BBS' in text and 'SOURCE COMPARISON PENDING' not in text
  w,h=(841,594) if a['paper']=='A1' else (420,297)
  for p in reader.pages:assert math.isclose(float(p.mediabox.width)*25.4/72,w,abs_tol=.1) and math.isclose(float(p.mediabox.height)*25.4/72,h,abs_tol=.1)
  subprocess.run([poppler,'-r','80','-png',str(path),str(render/path.stem)],check=True,capture_output=True)
  images=sorted(render.glob(path.stem+'-*.png'),key=lambda p:int(p.stem.split('-')[-1]));assert len(images)==len(reader.pages);thumbs=[]
  for i,p in enumerate(images,1):
   im=Image.open(p).convert('RGB');im.thumbnail((780,555));canvas=Image.new('RGB',(800,590),'#e6eeee');canvas.paste(im,((800-im.width)//2,25));ImageDraw.Draw(canvas).text((10,8),str(i),fill='black');thumbs.append(canvas)
  contact=Image.new('RGB',(1600,590*math.ceil(len(thumbs)/2)),'white')
  for i,t in enumerate(thumbs):contact.paste(t,((i%2)*800,(i//2)*590))
  contact.save(out/(path.stem+'-contact.png'));pdfs.append({'file':a['file'],'pages':len(reader.pages),'rendered':len(images),'contact':path.stem+'-contact.png'});checks.append({'file':a['file'],'status':'PASS','check':'All actual A3/A1 pages rendered, separate source5/selected2 reference numbers and Draft status checked'})
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,ensure_ascii=False,indent=2),encoding='utf-8');(out/'file-results.json').write_text(json.dumps({'checks':checks,'pdfs':pdfs,'totalPages':sum(p['pages'] for p in pdfs)},indent=2),encoding='utf-8');print('PASS',len(checks),'actual files;',sum(p['pages'] for p in pdfs),'PDF pages rendered')
