from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,subprocess,math,sys
from pypdf import PdfReader
from PIL import Image,ImageDraw
out=Path('output/reinforcement-coverage-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf-8'));checks=[];xlsx={};pdfs=[]
only_xlsx='--xlsx-only' in sys.argv
if only_xlsx:
 previous=json.loads((out/'file-results.json').read_text(encoding='utf-8'));pdfs=previous['pdfs'];checks=[c for c in previous['checks'] if c['file'].endswith('.pdf')]
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for a in artifacts:
 path=out/a['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==a['sha256']
 if only_xlsx and path.suffix=='.pdf':continue
 if path.suffix=='.xlsx':
  z=zipfile.ZipFile(path);shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];links={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))};wb=ET.fromstring(z.read('xl/workbook.xml'));sheets={}
  for name in ['BOQ','BOQ Summary','BOQ Coverage','Price Summary']:
   sh=next(sh for sh in wb.findall('x:sheets/x:sheet',ns) if sh.attrib['name']==name);target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target;tree=ET.fromstring(z.read(target));cells={};empty=[];formulas={}
   for c in tree.findall('.//x:c',ns):
    v=c.find('x:v',ns);value=shared[int(v.text)] if c.attrib.get('t')=='s' and v is not None else float(v.text) if v is not None and c.attrib.get('t')!='s' else None
    cells[c.attrib['r']]=value
    if value=='':empty.append(c.attrib['r'])
    f=c.find('x:f',ns)
    if f is not None:formulas[c.attrib['r']]=f.text;assert 'IFERROR' not in f.text
   def row(code):return next(i for i in range(4,20) if cells.get('A'+str(i))==code)
   if name=='BOQ':
    for code in ['UNKNOWN','SOURCE-PENDING','GULF-2C1-100']:assert cells.get('Q'+str(row(code))) is None
    assert cells['Q'+str(row('NO-REBAR'))]==0
    assert cells['I'+str(row('UNKNOWN'))]==0 and cells['O'+str(row('UNKNOWN'))]==0
    assert formulas['J'+str(row('UNKNOWN'))]=='C9*D9';assert cells['O3']=='Entered rebar total kg';assert cells['Q3']=='Complete rebar total kg'
   if name=='BOQ Coverage':
    assert cells['B'+str(row('UNKNOWN'))]=='BBS NOT ENTERED';assert cells.get('D'+str(row('UNKNOWN'))) is None
    assert cells['B'+str(row('SOURCE-PENDING'))]=='SOURCE COMPARISON PENDING';assert cells['C'+str(row('SOURCE-PENDING'))]>0 and cells.get('D'+str(row('SOURCE-PENDING'))) is None
    assert cells['D'+str(row('NO-REBAR'))]==0;assert cells['E'+str(row('NO-REBAR'))];assert cells.get('D10') is None;assert not formulas
   if name=='Price Summary':
    assert cells.get('F'+str(row('UNKNOWN'))) is None and cells['I'+str(row('UNKNOWN'))]==350
    assert cells['F'+str(row('NO-REBAR'))]==(70 if a['frozen'] else 76.1)
    assert cells.get('F'+str(row('ALL SELECTED'))) is None and cells['G'+str(row('ALL SELECTED'))]=='QUANTITIES PENDING'
   sheets[name]={'dimension':tree.find('x:dimension',ns).attrib['ref'],'emptyTextCells':empty,'cells':cells,'formulas':formulas}
  xlsx[a['file']]={'sha256':a['sha256'],'sheets':sheets};checks.append({'file':a['file'],'status':'PASS','check':'Original XML distinguishes blank completion from explicit numeric0, keeps entered price350 and old quantity formulas'})
 else:
  reader=PdfReader(path);texts=[p.extract_text() for p in reader.pages];text='\n'.join(texts);(out/(path.stem+'-text.txt')).write_text(text,encoding='utf-8')
  for word in ['BOQ reinforcement coverage','BBS NOT ENTERED','SOURCE COMPARISON PENDING','DECLARED NO REBAR','PENDING QUANTITIES','350.00','NOT FOR CONSTRUCTION']:
   assert word in text,(path,word)
  assert ('70.00' if a['frozen'] else '76.10') in text
  for i,p in enumerate(reader.pages,1):assert math.isclose(float(p.mediabox.width)*25.4/72,420,abs_tol=.1) and math.isclose(float(p.mediabox.height)*25.4/72,297,abs_tol=.1)
  subprocess.run([poppler,'-r','90','-png',str(path),str(render/path.stem)],check=True,capture_output=True)
  images=sorted(render.glob(path.stem+'-*.png'),key=lambda p:int(p.stem.split('-')[-1]));assert len(images)==len(reader.pages);thumbs=[]
  for i,p in enumerate(images,1):
   im=Image.open(p).convert('RGB');im.thumbnail((710,505));canvas=Image.new('RGB',(730,540),'#e6eeee');canvas.paste(im,((730-im.width)//2,25));ImageDraw.Draw(canvas).text((10,8),str(i),fill='black');thumbs.append(canvas)
  contact=Image.new('RGB',(1460,540*math.ceil(len(thumbs)/2)),'white')
  for i,t in enumerate(thumbs):contact.paste(t,((i%2)*730,(i//2)*540))
  contact.save(out/(path.stem+'-contact.png'));pdfs.append({'file':a['file'],'pages':len(reader.pages),'rendered':len(images),'contact':path.stem+'-contact.png'})
  checks.append({'file':a['file'],'status':'PASS','check':'All actual A3 pages rendered; quantity/commercial pending states and preserved entered350 text checked'})
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,ensure_ascii=False,indent=2),encoding='utf-8');(out/'file-results.json').write_text(json.dumps({'checks':checks,'pdfs':pdfs,'totalPages':sum(p['pages'] for p in pdfs)},indent=2),encoding='utf-8');print('PASS',len(checks),'actual files;',sum(p['pages'] for p in pdfs),'PDF pages rendered')
