from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,subprocess
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageDraw
out=Path('output/earthwork-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf-8'));checks=[];xlsx={};pdfs=[]
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
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
   sheets[name]={'dimension':tree.find('x:dimension',ns).attrib['ref'],'emptyTextCells':empty,'cells':cells,'formulas':formulas,'types':types}
  s=sheets['Foundation Earthwork'];assert s['cells']['F4']==0 and s['types']['F4']=='n';assert s['cells']['B4']==2 and s['cells']['H4']==16 and s['cells']['H5']==16;assert s['cells']['C4']=='Manual';assert 'QA-EW-01' in s['cells']['I4'];assert sheets['BOQ']['cells']['M4']==16;assert sheets['BOQ']['formulas']['M4']=='C4*G4';assert sheets['BOQ Summary']['cells']['G5']==16
  xlsx[a['file']]={'sha256':a['sha256'],'sheets':sheets};checks.append({'file':a['file'],'status':'PASS','check':'Original OOXML numeric zero/2 foundations/16 m3 per selected scope, source and cached BOQ formulas reconcile independently.'})
 else:
  reader=PdfReader(path);assert len(reader.pages)==3
  with pdfplumber.open(path) as pdf:
   text='\n'.join(p.extract_text() or '' for p in pdf.pages);assert 'Foundation earthwork basis' in text;assert f"{a['backfillTotal']:.3f}" in text;assert f"{a['backfillEach']:.3f}" in text
   if a['status']=='Frozen':assert 'Legacy zero: use net concrete automatically' in text;assert 'earthwork-1.0' not in text
   else:assert 'QA-EW-02' in text and 'earthwork-1.0' in text and '0.250' in text
   for p in pdf.pages:
    assert abs(p.width-1190.55)<1 and abs(p.height-841.89)<1
    for c in p.chars:assert c['x0']>=-.5 and c['x1']<=p.width+.5 and c['top']>=-.5 and c['bottom']<=p.height+.5,(path.name,c)
  prefix=render/path.stem;subprocess.run([poppler,'-r','90','-png',str(path),str(prefix)],check=True)
  pages=sorted(render.glob(path.stem+'-*.png'));assert len(pages)==3
  contact=Image.new('RGB',(3*700,530),'#edf2ef');draw=ImageDraw.Draw(contact)
  for i,f in enumerate(pages):
   im=Image.open(f);im.thumbnail((680,490));contact.paste(im,(i*700+10,28));draw.text((i*700+10,8),f'{path.name} / {i+1}',fill='#203940')
  contact_path=render/(path.stem+'-contact.png');contact.save(contact_path)
  pdfs.append({'file':a['file'],'pages':3,'images':[str(p.relative_to(out)).replace('\\','/') for p in pages],'contact':str(contact_path.relative_to(out)).replace('\\','/')});checks.append({'file':a['file'],'status':'PASS','check':'Actual app PDF A3 x3 pages; quantities, basis/engine and page bounds verified; every page rendered for visual review.'})
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,indent=2,ensure_ascii=False),encoding='utf-8');(out/'file-results.json').write_text(json.dumps({'checks':checks,'pdfs':pdfs},indent=2,ensure_ascii=False),encoding='utf-8')
print('PASS: numeric original XLSX, two actual app PDFs, all6 pages rendered')
