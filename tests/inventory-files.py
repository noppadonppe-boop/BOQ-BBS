from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,math,subprocess
from pypdf import PdfReader
from PIL import Image,ImageDraw
out=Path('output/inventory-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf-8'));checks=[];xlsx={};pdfs=[]
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
for a in artifacts:
 path=out/a['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==a['sha256']
 if path.suffix=='.xlsx':
  z=zipfile.ZipFile(path);shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];links={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))};wb=ET.fromstring(z.read('xl/workbook.xml'));sheets={};styleTree=ET.fromstring(z.read('xl/styles.xml'));styles=styleTree.find('x:cellXfs',ns);fmts={int(x.attrib['numFmtId']):x.attrib['formatCode'] for x in styleTree.findall('x:numFmts/x:numFmt',ns)}
  for sh in wb.findall('x:sheets/x:sheet',ns):
   name=sh.attrib['name'];target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target;tree=ET.fromstring(z.read(target));cells={};empty=[];formulas={};types={};alignments={};formats={}
   for c in tree.findall('.//x:c',ns):
    v=c.find('x:v',ns);value=shared[int(v.text)] if c.attrib.get('t')=='s' and v is not None else float(v.text) if v is not None and v.text is not None and c.attrib.get('t') not in ['s','str'] else v.text if v is not None else None;cell=c.attrib['r'];cells[cell]=value;types[cell]=c.attrib.get('t','n');style=styles[int(c.attrib.get('s','0'))];alignment=style.find('x:alignment',ns);alignments[cell]=dict(alignment.attrib) if alignment is not None else {};formats[cell]=fmts.get(int(style.attrib['numFmtId']),style.attrib['numFmtId'])
    if value=='':empty.append(cell)
    f=c.find('x:f',ns)
    if f is not None:formulas[cell]=f.text;assert 'IFERROR' not in f.text
   dim=tree.find('x:dimension',ns).attrib['ref'];sheets[name]={'dimension':dim,'emptyTextCells':empty,'cells':cells,'types':types,'formulas':formulas,'alignments':alignments,'formats':formats}
  assert list(sheets)==['Stock Register','Inventory Audit','Stock History'];s=sheets['Stock Register'];c=s['cells'];f=s['formulas'];assert c['E3']==7850 and c['B3']>45000 and s['types']['B3']=='n' and s['formats']['B3']=='yyyy-mm-dd hh:mm'
  total=6+a['rows'];assert s['dimension']==f'A1:K{total}'
  expected=(55,1,54,95) if a['rows']==52 else (3,1,2,10)
  for i,col in enumerate(['F','G','H','I']):assert math.isclose(c[f'{col}{total}'],expected[i],abs_tol=1e-8)
  mass=0
  for row in range(6,total):
   assert f[f'H{row}']==f'F{row}-G{row}' and f[f'I{row}']==f'E{row}*H{row}/1000' and f[f'J{row}']==f'I{row}*PI()/4*(C{row}/1000)^2*$E$3'
   quantity=c[f'F{row}'];reserved=c[f'G{row}'];available=quantity-reserved;length=c[f'E{row}']*available/1000;weight=length*math.pi/4*(c[f'C{row}']/1000)**2*7850
   assert c[f'H{row}']==available and math.isclose(c[f'I{row}'],length,abs_tol=1e-8) and math.isclose(c[f'J{row}'],weight,abs_tol=1e-8);mass+=weight
   for col in ['F','G','H','I','J']:assert s['types'][f'{col}{row}']=='n' and s['alignments'][f'{col}{row}']['horizontal']=='right'
  assert math.isclose(c[f'J{total}'],mass,abs_tol=1e-8);audit=sheets['Inventory Audit'];assert audit['dimension']=='A1:I56';assert sum(audit['cells'][f'D{row}'] for row in range(5,57))==55;assert all(audit['cells'][f'H{row}']=='ยอดตรงตามประวัติ' for row in range(5,57));assert all(audit['cells'][f'D{row}']==audit['cells'][f'E{row}'] for row in range(5,57));h=sheets['Stock History'];last=int(h['dimension'].split(':')[-1][1:]);assert last==(58 if a['rows']==52 else 8);assert all(h['types'][f'B{row}']=='n' and h['formats'][f'B{row}']=='yyyy-mm-dd hh:mm' for row in range(4,last+1));assert all(h['cells'][f'K{row}']==2 for row in range(4,last+1));assert any(h['cells'][f'G{row}']==0 for row in range(4,last+1));assert all(c for c in audit['cells']['A2'].split() if c)
  xlsx[a['file']]={'sha256':a['sha256'],'rows':a['rows'],'summary':a['summary'],'sheets':sheets};checks.append({'file':a['file'],'status':'PASS','check':'Original XML row counts, numeric quantities/formulas/caches/zero alignment, typed dates, full project audit and captured v2 history'})
 else:
  reader=PdfReader(path);texts=[p.extract_text() for p in reader.pages];text='\n'.join(texts);(out/(path.stem+'-text.txt')).write_text(text,encoding='utf-8');assert 'NOT A CONSTRUCTION RELEASE' in text and 'Snapshot SHA256 '+a['digest'] in text
  assert 'Stock epoch' in text
  for i,p in enumerate(reader.pages,1):assert math.isclose(float(p.mediabox.width)*25.4/72,420,abs_tol=.1) and math.isclose(float(p.mediabox.height)*25.4/72,297,abs_tol=.1);assert f'A3 / Page {i}/{len(reader.pages)}' in texts[i-1]
  if a['file']=='full-reserved.pdf':assert '55 / จอง 1 / พร้อมใช้ 54' in text and '95.000 m' in text
  if a['file']=='offcuts-cancelled.pdf':assert '3 / จอง 0 / พร้อมใช้ 3' in text and '17.000 m' in text
  if a['file']=='discrepancy-empty.pdf':assert '0 / จอง 0 / พร้อมใช้ 0' in text and 'ยอดจอง 1 แต่แผนจองรวม 0' in text and 'จำนวนหรือรุ่นปัจจุบันไม่ต่อเนื่อง' in text
  subprocess.run([poppler,'-r','85','-png',str(path),str(render/path.stem)],check=True,capture_output=True);images=sorted(render.glob(path.stem+'-*.png'),key=lambda p:int(p.stem.split('-')[-1]));assert len(images)==len(reader.pages);thumbs=[]
  for i,p in enumerate(images,1):
   im=Image.open(p).convert('RGB');im.thumbnail((800,570));canvas=Image.new('RGB',(820,600),'#e6eeee');canvas.paste(im,((820-im.width)//2,25));ImageDraw.Draw(canvas).text((10,8),str(i),fill='black');thumbs.append(canvas)
  contact=Image.new('RGB',(1640,600*math.ceil(len(thumbs)/2)),'white')
  for i,t in enumerate(thumbs):contact.paste(t,((i%2)*820,(i//2)*600))
  contact.save(out/(path.stem+'-contact.png'));pdfs.append({'file':a['file'],'pages':len(reader.pages),'rendered':len(images),'contact':path.stem+'-contact.png'});checks.append({'file':a['file'],'status':'PASS','check':'Actual app PDF source checksum, captured quantities/scope/audit, A3 page dimensions/numbering and all pages rendered'})
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,ensure_ascii=False,indent=2),encoding='utf-8');(out/'file-results.json').write_text(json.dumps({'checks':checks,'pdfs':pdfs,'totalPages':sum(p['pages'] for p in pdfs)},indent=2),encoding='utf-8');print('PASS',len(checks),'actual files;',sum(p['pages'] for p in pdfs),'PDF pages rendered')
