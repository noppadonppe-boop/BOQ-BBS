from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,subprocess
from pypdf import PdfReader
root=Path('F:/Project Code/BOQ_BBS');out=root/'output/oval-link-verification'
def read(n):return json.loads((out/n).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
u=read('unit-results.json');assert u['success'] and not u['numFailedTests'];ui=read('ui-results.json');assert all(x['status']=='PASS' for x in ui['results']) and not ui['cloud'] and not ui['errors'];native=read('native-results.json');assert native['status']=='PASS';r=read('readable-pdf-results.json');assert r['status']=='PASS'
protected=[]
for old in json.loads((root/'output/tapered-prism-verification/protected-config.json').read_text(encoding='utf-8-sig')):
 assert sha(root/old['file'])==old['sha256'];protected.append({**old,'unchanged':True})
(out/'protected-config.json').write_text(json.dumps(protected,indent=2),encoding='utf-8')
for x in native['checks']:assert sha(out/x['file']).upper()==x['sha256']
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
     cells[c.attrib['r']]={'value':value,'formula':f.text if f is not None else None}
    sheets[sheet.attrib['name']]={'cells':cells}
   b=sheets['BBS']['cells'];assert b['B5']['value']=='O01' and b['B4']['value']=='O02';assert b['I5']['value']==('1800' if 'v7' in p.name else '1825');assert b['K5']['value']=='6' and b['K4']['value']=='1'
   if 'v8' in p.name:
    o=sheets['Oval Link Geometry']['cells'];assert o['K5']['value']=='1804' and o['F4']['value']=='320' and o['M5']['value']=='1825';assert 'F5' in o['L5']['formula'];assert 'ปิดปลาย' in o['R5']['value']
   else:assert 'Oval Link Geometry' not in sheets
   workbooks.append({'file':p.name,'sheets':sheets,'status':'PASS'})
 else:pdfs.append(p)
(out/'xlsx-checks.json').write_text(json.dumps(workbooks,indent=2),encoding='utf-8')
pdfs+=list(out.glob('*-native.pdf'));checks=[];poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
for p in pdfs:
 reader=PdfReader(p);images=[]
 for i,page in enumerate(reader.pages):
  if '-native' not in p.name:
   text=page.extract_text();assert 'NOT FOR CONSTRUCTION' in text and 'O-BASE' in text and 'Code33:' in text
   expected=[1190.55,841.89] if 'A3' in p.name else [2383.94,1683.78];assert abs(float(page.mediabox.width)-expected[0])<2 and abs(float(page.mediabox.height)-expected[1])<2
  prefix=out/(p.stem+f'-page{i+1}');subprocess.run([poppler,'-f',str(i+1),'-l',str(i+1),'-singlefile','-scale-to','1800','-png',str(p),str(prefix)],check=True,capture_output=True);images.append(prefix.name+'.png')
 checks.append({'file':p.name,'pages':len(reader.pages),'images':images,'status':'PASS'})
(out/'pdf-checks.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
s={'status':'PASS','unitCases':u['numPassedTests'],'unitFiles':len(u['testResults']),'actualLocalPaths':len(ui['results'])+len(r['checks'])+1,'appUiSdkPaths':len(ui['results']),'documentCases':len(r['checks'])+1,'xlsxFiles':2,'appPdfs':2,'appPdfPages':sum(x['pages'] for x in checks if '-native' not in x['file']),'nativePrintSheets':3,'nativePdfPages':sum(x['pages'] for x in checks if '-native' in x['file']),'protectedFiles':len(protected),'rulesChanged':False,'rulesDeployed':False,'engineeringApproved':False,'productionAcceptance':False}
assert read('mobile-ui-results.json')['status']=='PASS';s['actualLocalPaths']+=1;s['appUiSdkPaths']+=1
(out/'artifact-audit.json').write_text(json.dumps(s,indent=2),encoding='utf-8');print(json.dumps(s))
