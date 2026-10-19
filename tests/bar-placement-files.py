from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,math,subprocess,os
from pypdf import PdfReader
out=Path(os.environ.get('QA_POSE_OUT','output/bar-placement-verification'));artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf8'));checks=[];xlsx={};ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
for a in artifacts:
 p=out/a['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256']
 if p.suffix=='.xlsx':
  z=zipfile.ZipFile(p);shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];links={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))};wb=ET.fromstring(z.read('xl/workbook.xml'));sheets={}
  for sh in wb.findall('x:sheets/x:sheet',ns):
   name=sh.attrib['name'];target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target;tree=ET.fromstring(z.read(target));cells={};types={};formulas={};empty=[]
   for c in tree.findall('.//x:c',ns):
    v=c.find('x:v',ns);value=shared[int(v.text)] if c.attrib.get('t')=='s' and v is not None else float(v.text) if v is not None and v.text is not None and c.attrib.get('t') not in ['s','str'] else v.text if v is not None else None;cell=c.attrib['r'];cells[cell]=value;types[cell]=c.attrib.get('t','n')
    if value=='':empty.append(cell)
    f=c.find('x:f',ns)
    if f is not None:formulas[cell]=f.text
   sheets[name]={'dimension':tree.find('x:dimension',ns).attrib['ref'],'emptyTextCells':empty,'cells':cells,'types':types,'formulas':formulas}
  poses=sheets['Bar Placements'];basis=sheets['Placement Basis'];assert poses['dimension']=='A1:O9';assert poses['cells']['C4']=='P0001';assert poses['cells']['C9']=='P0006';assert basis['cells']['C4']==6 and basis['cells']['D4']==5
  expected=[[[100,100,100],[800,100,100]],[[100,200,300],[800,200,300]],[[100,600,725],[800,600,725]],[[600,100,600],[600,800,600]],[[300,100,1100],[300,800,1100]],[[100,450,a['lastFirstZ']],[800,450,a['lastFirstZ']]]]
  for i in range(6):
   row=i+4
   for c in 'DEFGHIJKLMNO':assert poses['types'][f'{c}{row}']=='n'
   actual=[poses['cells'][f'{c}{row}'] for c in 'JKLMNO']
   assert all(abs(x-y)<1e-8 for x,y in zip(actual,sum(expected[i],[])))
  assert any(v=='00' for c,v in sheets['BBS']['cells'].items() if c.startswith('F'))
  bbs=sheets['BBS'];assert bbs['cells']['G4']==6 and bbs['cells']['H4']==5 and bbs['cells']['I4']==700 and bbs['cells']['K4']==30 and bbs['cells']['L4']==21;assert abs(bbs['cells']['M4']-a['enteredKg'])<1e-10;assert bbs['formulas']['K4']=='G4*H4' and bbs['formulas']['L4']=='K4*I4/1000' and bbs['formulas']['M4']=='L4*J4'
  xlsx[a['file']]={'sha256':a['sha256'],'sheets':sheets};checks.append({'file':a['file'],'status':'PASS','check':'Original XML retains six physical pose rows, numeric offsets/rotations/endpoints, exact cardinal-axis coordinates,6 bars/element and5 selected elements, Code00 text and source basis.'})
 else:
  pdf=PdfReader(p);size=(420,297) if 'a3' in p.stem else (841,594);texts=[];images=[]
  for i,page in enumerate(pdf.pages):
   assert abs(float(page.mediabox.width)*25.4/72-size[0])<.05 and abs(float(page.mediabox.height)*25.4/72-size[1])<.05
   texts.append(page.extract_text());prefix=out/(p.stem+f'-page-{i+1}');subprocess.run([poppler,'-f',str(i+1),'-l',str(i+1),'-singlefile','-r','100','-png',str(p),str(prefix)],check=True,capture_output=True);images.append(prefix.name+'.png')
  text='\n'.join(texts);assert all(id in text for id in ['P0001','P0002','P0003','P0004','P0005','P0006']);assert 'Synthetic QA POSE-01' in text;assert 'placement basis' in text;assert 'NOT FOR CONSTRUCTION' in text;assert format(a['lastFirstZ'],',') in text or str(a['lastFirstZ']) in text
  if a.get('ownerFrameEnabled'):
   for i,t in enumerate(texts):assert 'QA-POSE-001' in t and f'{i+1}/3' in t
  else:assert 'Placement appendix 1/2' in texts[-2] and 'Placement appendix 2/2' in texts[-1]
  checks.append({'file':a['file'],'status':'PASS','pages':len(pdf.pages),'images':images,'check':'Actual complete PDF page sizes,6 pose IDs,source/basis,draft notice and current/Frozen endpoint; all pages rendered without changing original bytes.'})
 assert hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256']
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,indent=2,ensure_ascii=False),encoding='utf8');(out/'file-results.json').write_text(json.dumps({'checks':checks},indent=2,ensure_ascii=False),encoding='utf8');print('PASS actual original XLSX/PDF files',len(checks))
