from pathlib import Path
import json,hashlib,subprocess,math,zipfile,xml.etree.ElementTree as ET
from pypdf import PdfReader
from PIL import Image,ImageDraw
out=Path('output/component-pricing-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
art=json.loads((out/'export-results.json').read_text(encoding='utf-8'))['artifacts'];results=[];views=[];pages=0;sheet_info={};ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for a in art:
    file=out/a['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==a['sha256']
    if file.suffix=='.xlsx':
        z=zipfile.ZipFile(file);wb=ET.fromstring(z.read('xl/workbook.xml'));rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'));links={r.attrib['Id']:r.attrib['Target'] for r in rels};shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];info={}
        for sh in wb.findall('x:sheets/x:sheet',ns):
            name=sh.attrib['name']
            if name not in ['BOQ Prices','Price Summary','Price Basis','Cost Components']:continue
            target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target;tree=ET.fromstring(z.read(target));empty=[]
            for c in tree.findall('.//x:c',ns):
                v=c.find('x:v',ns)
                if c.attrib.get('t')=='s' and v is not None and shared[int(v.text)]=='':empty.append(c.attrib['r'])
                assert c.find('x:f',ns) is None,'Commercial values must be captured, not mutable live formulas'
            info[name]={'dimension':tree.find('x:dimension',ns).attrib['ref'],'emptyTextCells':empty}
        assert len(info)==4;sheet_info[a['file']]={'sha256':a['sha256'],'sheets':info};results.append({'name':file.name+' four commercial tabs, original typed decimal text/captured values','status':'PASS'});continue
    reader=PdfReader(file);texts=[p.extract_text() or '' for p in reader.pages];joined='\n'.join(texts)
    assert len(reader.pages)==5,(file,len(reader.pages))
    for i,p in enumerate(reader.pages):
        size=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72);assert abs(size[0]-420)<.15 and abs(size[1]-297)<.15
        assert 'NOT FOR CONSTRUCTION' in texts[i];assert f'Page {i+1}/5' in texts[i]
    for s in ['BOQ cost components','BOQ price summary','BOQ price detail','BOQ commercial basis','boq-pricing-1.0','boq-pricing-2.0','COMBINED-CUBE','SPLIT-CUBE','281.40','120.31']:assert s in joined,(file,s)
    if a['frozen']:
        for s in ['100.005','200.01','300.02','813.73','1,215.44']:assert s in joined,(file,s)
        assert '200.005' not in joined and 'UI-QA45' not in joined
    else:
        for s in ['200.005','400.01','600.02','1,313.73','1,715.44','UI-QA45']:assert s in joined,(file,s)
    subprocess.run([poppler,'-png','-scale-to','1500',str(file),str(render/file.stem)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    images=sorted(render.glob(file.stem+'-*.png'));assert len(images)==len(reader.pages);contact=Image.new('RGB',(1280,480*math.ceil(len(images)/2)),'#edf3f0')
    for i,name in enumerate(images):
        im=Image.open(name).convert('RGB');im.thumbnail((620,450));x=(i%2)*640;y=(i//2)*480;contact.paste(im,(x+(640-im.width)//2,y+12));ImageDraw.Draw(contact).text((x+12,y+462),name.name,fill='#243c36');views.append(str(name.relative_to(out)).replace('\\','/'))
    contact.save(out/(file.stem+'-contact.png'));(render/(file.stem+'-text.txt')).write_text(joined,encoding='utf-8');pages+=len(images);results.append({'name':file.name+' all5 A3 pages/captured component totals/conditions','status':'PASS'})
(out/'xlsx-source-checks.json').write_text(json.dumps(sheet_info,indent=2),encoding='utf-8');(out/'file-results.json').write_text(json.dumps({'results':results,'pages':pages,'views':views,'scope':'Actual app files, source XML and all PDF pages rendered; not native Excel printing/owner acceptance.'},indent=2),encoding='utf-8');print('PASS',pages,'actual PDF pages; both original workbook XML files checked')
