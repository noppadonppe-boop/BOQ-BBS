from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,subprocess
from pypdf import PdfReader
root=Path('F:/Project Code/BOQ_BBS');out=root/'output/inclined-prism-verification'
def read(name):return json.loads((out/name).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
unit=read('unit-results.json');ui=read('ui-results.json');refs=read('reference-export-results.json');native=read('native-results.json')
final=read('final-ui-results.json');assert final['status']=='PASS' and not final['errors'] and not final['cloud']
copy=read('copy-results.json');assert copy['status']=='PASS' and not copy['cloud']
assert unit['success'] and not unit['numFailedTests'];assert all(r['status']=='PASS' for r in ui['results']) and not ui['errors'] and not ui['cloud'];assert refs['status']=='PASS' and not refs['cloud'];assert native['status']=='PASS'
protected=[]
for old in json.loads((root/'output/prism-verification/protected-config.json').read_text(encoding='utf-8-sig')):
 value=sha(root/old['file']);assert value==old['sha256'],old['file'];protected.append({'file':old['file'],'sha256':value,'unchanged':True})
(out/'protected-config.json').write_text(json.dumps(protected,indent=2),encoding='utf-8')
for item in native['checks']:assert sha(out/item['file']).upper()==item['originalSha256']
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};workbooks=[];pdfs=[]
for item in read('artifacts.json'):
 p=out/item['name'];assert sha(p)==item['sha256'] and p.stat().st_size==item['bytes']
 if p.suffix=='.xlsx':
  with zipfile.ZipFile(p) as z:
   strings=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))];wb=ET.fromstring(z.read('xl/workbook.xml'));rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'));mapping={r.attrib['Id']:r.attrib['Target'] for r in rels};sheets={}
   for sheet in wb.find('s:sheets',ns):
    target=mapping[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];xml=ET.fromstring(z.read('xl/'+target));cells={}
    for c in xml.findall('.//s:c',ns):
     v=c.find('s:v',ns);f=c.find('s:f',ns);value=v.text if v is not None else None
     if c.attrib.get('t')=='s' and value is not None:value=strings[int(value)]
     assert c.attrib.get('t')!='e',(p.name,sheet.attrib['name'],c.attrib['r'],value)
     cells[c.attrib['r']]={'type':c.attrib.get('t','numeric'),'value':value,'formula':f.text if f is not None else None}
    if sheet.attrib['name'] in ['Prism Edges','Prism Check','BOQ','BBS']:sheets[sheet.attrib['name']]={'dimension':xml.find('s:dimension',ns).attrib['ref'],'cells':cells}
   row=9 if p.name=='INCLINED-project.xlsx' else 4;start=28 if row==9 else 4;edges=sheets['Prism Edges']['cells'];check=sheets['Prism Check']['cells']
   assert edges['M'+str(start)]['value']=='750' and edges['N'+str(start)]['value']=='0' and edges['O'+str(start)]['value']=='1000'
   assert edges['O'+str(start+1)]['formula']=='O'+str(start)
   assert check['D'+str(row)]['formula']==f"'Prism Edges'!O{start}" and check['J'+str(row)]['value']=='1' and check['K'+str(row)]['value']=='6.5'
   assert sheets['BBS']['cells']['I4']['value']=='1150'
   if row==9:assert edges['M16']['value']=='-750' and check['J7']['value']=='0.84' and abs(float(check['K7']['value'])-7.98)<1e-9
   workbooks.append({'file':p.name,'sheets':sheets,'status':'PASS'})
 else:pdfs.append(p)
(out/'xlsx-checks.json').write_text(json.dumps(workbooks,indent=2),encoding='utf-8')
pdfs+=list(out.glob('*-native.pdf'));pdfchecks=[];poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
for p in pdfs:
 reader=PdfReader(p);images=[];sizes=[]
 for i,page in enumerate(reader.pages):
  width,height=float(page.mediabox.width),float(page.mediabox.height);sizes.append([width,height])
  if '-native' not in p.name:
   expected=[1190.55,841.89] if 'A3' in p.name else [2383.94,1683.78];assert abs(width-expected[0])<2 and abs(height-expected[1])<2
   text=page.extract_text();assert 'NOT FOR CONSTRUCTION' in text and 'S-Custom' in text
   if i==0:assert 'view span' in text
  prefix=out/(p.stem+f'-page{i+1}');subprocess.run([str(poppler),'-f',str(i+1),'-l',str(i+1),'-singlefile','-scale-to','1800','-png',str(p),str(prefix)],check=True,capture_output=True);images.append(prefix.name+'.png')
 pdfchecks.append({'file':p.name,'pages':len(reader.pages),'sizes':sizes,'images':images,'status':'PASS'})
(out/'pdf-checks.json').write_text(json.dumps(pdfchecks,indent=2),encoding='utf-8')
summary={'status':'PASS','unitCases':unit['numPassedTests'],'unitFiles':len(unit['testResults']),'actualPaths':len(ui['results'])+3,'workbooks':2,'appPdfs':2,'appPdfPages':sum(c['pages'] for c in pdfchecks if '-native' not in c['file']),'nativePdfPages':sum(c['pages'] for c in pdfchecks if '-native' in c['file']),'protectedFiles':len(protected),'rulesChanged':False,'rulesDeployed':False,'productionAcceptance':False,'engineeringApproved':False}
(out/'artifact-audit.json').write_text(json.dumps(summary,indent=2),encoding='utf-8');print(json.dumps(summary))
