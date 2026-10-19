from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,math
out=Path('output/quantity-print-verification');artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf-8'));checks=[];xlsx={};ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for a in artifacts:
 path=out/a['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==a['sha256'];z=zipfile.ZipFile(path);shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];links={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))};wb=ET.fromstring(z.read('xl/workbook.xml'));sheets={}
 for sh in wb.findall('x:sheets/x:sheet',ns):
  name=sh.attrib['name'];target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target;tree=ET.fromstring(z.read(target));cells={};types={};formulas={};empty=[]
  for c in tree.findall('.//x:c',ns):
   v=c.find('x:v',ns);value=shared[int(v.text)] if c.attrib.get('t')=='s' and v is not None else float(v.text) if v is not None and v.text is not None and c.attrib.get('t') not in ['s','str'] else v.text if v is not None else None;cell=c.attrib['r'];cells[cell]=value;types[cell]=c.attrib.get('t','n')
   if value=='':empty.append(cell)
   f=c.find('x:f',ns)
   if f is not None:formulas[cell]=f.text
  sheets[name]={'dimension':tree.find('x:dimension',ns).attrib['ref'],'emptyTextCells':empty,'cells':cells,'types':types,'formulas':formulas,'rows':{int(r.attrib['r']):float(r.attrib.get('ht','0')) for r in tree.findall('x:sheetData/x:row',ns)}}
  if name=='BOQ Print':
   columns=tree.findall('x:cols/x:col',ns);width_pixels=sum((int(c.attrib['max'])-int(c.attrib['min'])+1)*math.floor(float(c.attrib['width'])*7+5) for c in columns);assert width_pixels*.75<1190.55-.8*72
 s=sheets['BOQ Print'];summary=sheets['BOQ Summary'];last=max(s['rows']);complete_rows=0;pending_rows=0;zero_rows=0
 for r in range(5,last):
  source=r-1
  if len(str(s['cells'].get(f'A{r}','')))==80:assert s['rows'][r]>=90
  assert s['formulas'][f'I{r}']==f"'BOQ Summary'!I{source}";assert s['cells'][f'I{r}']==summary['cells'][f'I{source}'];complete=summary['cells'].get(f'K{source}')
  if complete is None:assert s['cells'].get(f'J{r}') is None and f'J{r}' not in s['formulas'];assert 'รอ BBS' in s['cells'][f'K{r}'];pending_rows+=1
  else:assert s['cells'][f'J{r}']==complete and s['types'][f'J{r}']=='n';assert s['formulas'][f'J{r}']==f"'BOQ Summary'!K{source}";complete_rows+=1;zero_rows+=int(complete==0)
 assert s['cells'][f'I{last}']==a['enteredKg'];assert s['cells'].get(f'J{last}')==a['completeKg'];assert zero_rows>=1
 if a['pendingMembers']:assert pending_rows>0 and f'J{last}' not in s['formulas'] and 'ยังไม่ครบ' in s['cells']['A3']
 else:assert pending_rows==0 and s['cells'][f'J{last}']>0
 assert 'ที่กรอก' in s['cells']['I4'];assert 'ที่กรอก' in sheets['Rebar Summary']['cells']['E4'];assert 'ที่กรอก' in sheets['BBS Print']['cells']['K4'];assert any(v=='00' for cell,v in sheets['BBS']['cells'].items() if cell.startswith('F'))
 xlsx[a['file']]={'sha256':a['sha256'],'sheets':sheets,'pendingRows':pending_rows,'completeRows':complete_rows,'zeroRows':zero_rows};checks.append({'file':a['file'],'status':'PASS','check':'Original OOXML: pending complete cells/totals remain blank without formulas; declared zeros remain numeric; source links/caches match original Summary; entered total reconciles; A3 width fits 100% metadata; original Code00 text retained.'})
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,indent=2,ensure_ascii=False),encoding='utf-8');(out/'file-results.json').write_text(json.dumps({'checks':checks},indent=2,ensure_ascii=False),encoding='utf-8');print('PASS: three original XLSX typed zero/blank/formulas and A3 metadata')
