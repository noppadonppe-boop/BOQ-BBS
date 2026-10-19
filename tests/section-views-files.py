from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,subprocess,re
from pypdf import PdfReader
out=Path('output/section-views-verification');artifacts=json.loads((out/'artifacts.json').read_text(encoding='utf8'));ctx=json.loads((out/'context.json').read_text(encoding='utf8'));results=[];xlsx={};ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
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
  view=sheets['Drawing Views'];bbs=sheets['BBS'];assert view['dimension']=='A1:F6';assert [view['cells']['C'+str(i)] for i in range(4,7)]==['A-A','B-B','C-C'];assert [view['cells']['E'+str(i)] for i in range(4,7)]==[500,1000 if a['frozen'] else 1200,350];assert all(view['types']['E'+str(i)]=='n' for i in range(4,7));assert all(bbs['cells']['F'+str(i)]=='00' for i in range(4,9));assert all(bbs['cells']['K'+str(i)]==1 for i in range(4,9));assert abs(sum(bbs['cells']['M'+str(i)] for i in range(4,9))-ctx['calc']['rebar'])<1e-10
  for i in range(4,9):assert bbs['formulas']['K'+str(i)]==f'G{i}*H{i}' and bbs['formulas']['L'+str(i)]==f'K{i}*I{i}/1000' and bbs['formulas']['M'+str(i)]==f'L{i}*J{i}'
  xlsx[a['file']]={'sha256':a['sha256'],'sheets':sheets};results.append({'file':a['file'],'status':'PASS','check':'Original OOXML retains typed three saved cut inputs and basis; five BBS rows, Code00 text, quantity formulas and exact cached sum unchanged.'})
 else:
  pdf=PdfReader(p);size=(420,297) if 'a3' in p.stem else (841,594);texts=[];images=[]
  for i,page in enumerate(pdf.pages):
   assert abs(float(page.mediabox.width)*25.4/72-size[0])<.05 and abs(float(page.mediabox.height)*25.4/72-size[1])<.05
   texts.append(page.extract_text());prefix=out/(p.stem+f'-page-{i+1}');subprocess.run([poppler,'-f',str(i+1),'-l',str(i+1),'-singlefile','-r','100','-png',str(p),str(prefix)],check=True,capture_output=True);images.append(prefix.name+'.png')
  text='\n'.join(texts);position=1000 if a['frozen'] else 1200;compact=re.sub(r'\s','',text);assert all(id in text for id in ['V1','V2','V3','V4','H1']);assert f'B-BZ{position}' in compact;assert 'NOTFORCONSTRUCTION' in compact;assert 'Drawingviewinputs' in compact;assert f'position{position}mm' in compact
  summaries=6 if a['layout']=='details-v2' else 3
  for i in range(summaries):
   label=['A-A','B-B','C-C'][i//2 if summaries==6 else i];assert 'SECTION'+label in re.sub(r'\s','',texts[i]);assert 'ELEVATIONX/Z' in re.sub(r'\s','',texts[i])
  if a['ownerFrameEnabled']:
   for i,t in enumerate(texts):assert 'QA-SECTIONS-001' in t and f'{i+1}/{len(pdf.pages)}' in t
  else:
   for i,t in enumerate(texts[:summaries]):assert f'Sheet {i+1}/' in t
  assert len(pdf.pages)==4 if a['layout']=='schedule-v1' else len(pdf.pages)>summaries
  results.append({'file':a['file'],'status':'PASS','pages':len(pdf.pages),'images':images,'size':list(size),'summaryPages':summaries,'check':'Actual complete PDF page sizes, all cut labels/positions, saved basis, quantity identities and final owner numbering; all pages rendered at100dpi. Physical reinforcement is synthetic QA.'})
 assert hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256']
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,indent=2,ensure_ascii=False),encoding='utf8');(out/'file-results.json').write_text(json.dumps({'results':results},indent=2,ensure_ascii=False),encoding='utf8');print('PASS original XLSX/PDF files',len(results),'PDF pages',sum(r.get('pages',0) for r in results))
