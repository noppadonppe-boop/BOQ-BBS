from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,subprocess
from pypdf import PdfReader
root=Path('F:/Project Code/BOQ_BBS');out=root/'output/prism-verification'
def read(name):return json.loads((out/name).read_text(encoding='utf-8-sig'))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
units=read('unit-results.json');assert units['success'] and units['numFailedTests']==0
ui=read('ui-results.json');assert all(r['status']=='PASS' for r in ui['results']) and not ui['errors'] and not ui['cloud']
project=read('project-export-results.json');assert project['status']=='PASS' and not project['cloud']
dimensions=read('dimension-ui-results.json');assert dimensions['status']=='PASS' and dimensions['sectionWidth']==2000 and not dimensions['cloud'] and not dimensions['errors']
native=read('native-results.json');assert native['status']=='PASS'
protected=[]
for old in json.loads((root/'output/engineering-report-verification/protected-config.json').read_text(encoding='utf-8-sig')):
 p=root/old['file'];actual=digest(p);assert actual==old['sha256'],old['file'];protected.append({'file':old['file'],'sha256':actual,'unchanged':True})
(out/'protected-config.json').write_text(json.dumps(protected,indent=2),encoding='utf-8')
files=read('artifacts.json');checks=[];pdfs=[];ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for item in files:
 p=out/item['name'];assert digest(p)==item['sha256'] and p.stat().st_size==item['bytes']
 if p.suffix=='.xlsx':
  with zipfile.ZipFile(p) as z:
   sheets={}
   shared=ET.fromstring(z.read('xl/sharedStrings.xml'));strings=[''.join(n.itertext()) for n in shared]
   wb=ET.fromstring(z.read('xl/workbook.xml'));rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'));mapping={r.attrib['Id']:r.attrib['Target'] for r in rels}
   for sheet in wb.find('s:sheets',ns):
    target=mapping[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];xml=ET.fromstring(z.read('xl/'+target));name=sheet.attrib['name'];cells={}
    for c in xml.findall('.//s:c',ns):
     v=c.find('s:v',ns);f=c.find('s:f',ns);value=v.text if v is not None else None
     if c.attrib.get('t')=='s' and value is not None:value=strings[int(value)]
     assert c.attrib.get('t')!='e',(p.name,name,c.attrib['r'],value)
     cells[c.attrib['r']]={'type':c.attrib.get('t','numeric'),'value':value,'formula':f.text if f is not None else None}
    if name in ['Prism Edges','Prism Check','BOQ','BBS']:
     dimension=xml.find('s:dimension',ns).attrib['ref'];sheets[name]={'dimension':dimension,'cells':cells}
   check=sheets['Prism Check'];row='9' if p.name=='PRISM-draft.xlsx' else '4'
   assert check['cells']['F'+row]['value']=='0'
   assert check['cells']['E'+row]['value']=='6000000' and check['cells']['J'+row]['value']=='3'
   if p.name=='PRISM-draft.xlsx':assert check['cells']['F7']['value']=='1000000' and check['cells']['K7']['value']=='19'
   checks.append({'file':p.name,'sheets':sheets,'status':'PASS','originalCachedZeroConfirmed':True})
 else:pdfs.append(p)
for p in out.glob('*-native.pdf'):pdfs.append(p)
pdfchecks=[]
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
for p in pdfs:
 reader=PdfReader(p);images=[];sizes=[]
 for i,page in enumerate(reader.pages):
  width,height=float(page.mediabox.width),float(page.mediabox.height);sizes.append([width,height])
  if p.name in ['PRISM-A3-draft.pdf','PRISM-A1-draft.pdf']:
   target=(1190.55,841.89) if 'A3' in p.name else (2383.94,1683.78);assert abs(width-target[0])<2 and abs(height-target[1])<2
   text=page.extract_text();assert 'NOT FOR CONSTRUCTION' in text and 'P-Custom' in text
   if i==0:assert '4000 mm' in text and '2000 mm' in text
  prefix=out/(p.stem+f'-page{i+1}')
  subprocess.run([str(poppler),'-f',str(i+1),'-l',str(i+1),'-singlefile','-scale-to','1800','-png',str(p),str(prefix)],check=True,capture_output=True)
  images.append(prefix.name+'.png')
 pdfchecks.append({'file':p.name,'pages':len(reader.pages),'sizes':sizes,'images':images,'status':'PASS'})
(out/'xlsx-checks.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
(out/'pdf-checks.json').write_text(json.dumps(pdfchecks,indent=2),encoding='utf-8')
summary={'status':'PASS','unitCases':units['numPassedTests'],'unitFiles':len(units['testResults']),'actualPaths':len(ui['results'])+2,'actualWorkbooks':2,'actualAppPdfs':2,'appPdfPages':sum(c['pages'] for c in pdfchecks if '-native' not in c['file']),'nativePdfPages':sum(c['pages'] for c in pdfchecks if '-native' in c['file']),'protectedFiles':len(protected),'rulesEdited':False,'rulesDeployed':False,'productionAcceptance':False,'engineeringApproval':False}
(out/'artifact-audit.json').write_text(json.dumps(summary,indent=2),encoding='utf-8');print(json.dumps(summary))
