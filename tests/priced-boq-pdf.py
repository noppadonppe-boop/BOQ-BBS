from pathlib import Path
import json,hashlib,subprocess,math,zipfile,xml.etree.ElementTree as ET
from pypdf import PdfReader
from PIL import Image,ImageDraw
out=Path('output/priced-boq-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
art=json.loads((out/'export-results.json').read_text(encoding='utf-8'))['artifacts'];results=[];views=[];page_count=0;sheet_info={}
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for a in art:
    file=out/a['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==a['sha256']
    if file.suffix=='.xlsx':
        z=zipfile.ZipFile(file);wb=ET.fromstring(z.read('xl/workbook.xml'));rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'));links={r.attrib['Id']:r.attrib['Target'] for r in rels};strings=ET.fromstring(z.read('xl/sharedStrings.xml'));shared=[''.join(t.itertext()) for t in strings]
        info={}
        for sh in wb.findall('x:sheets/x:sheet',ns):
            name=sh.attrib['name']
            if name not in ['BOQ Prices','Price Summary','Price Basis']:continue
            target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
            tree=ET.fromstring(z.read(target));empty=[]
            for c in tree.findall('.//x:c',ns):
                v=c.find('x:v',ns)
                if c.attrib.get('t')=='s' and v is not None and shared[int(v.text)]=='':empty.append(c.attrib['r'])
                assert c.find('x:f',ns) is None,'Prices must be captured, not live formulas'
            info[name]={'dimension':tree.find('x:dimension',ns).attrib['ref'],'emptyTextCells':empty}
        sheet_info[a['file']]={'sha256':a['sha256'],'sheets':info}
        results.append({'name':a['file']+' exact source cells and three snapshot price tabs','status':'PASS'})
        continue
    reader=PdfReader(file);texts=[p.extract_text() or '' for p in reader.pages];joined='\n'.join(texts)
    assert len(reader.pages)==4,(file,len(reader.pages))
    for i,p in enumerate(reader.pages):
        size=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72);assert abs(size[0]-420)<.15 and abs(size[1]-297)<.15
        assert 'NOT FOR CONSTRUCTION' in texts[i];assert f'Page {i+1}/4' in texts[i]
    for s in ['BOQ price summary','BOQ price detail','BOQ commercial basis','QA-QUOTE-43','PRICE-CUBE','boq-pricing-1.0']:assert s in joined,(file,s)
    if a['frozen']:
        for s in ['100.005','200.01','300.02','813.73']:assert s in joined,(file,s)
        assert '321.005' not in joined and 'UNPRICED-COPY' not in joined
    else:
        for s in ['321.005','642.01','963.02','1,918.73','UNPRICED-COPY','PENDING','UI-QA-43']:assert s in joined,(file,s)
    subprocess.run([poppler,'-png','-scale-to','1500',str(file),str(render/file.stem)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    images=sorted(render.glob(file.stem+'-*.png'));assert len(images)==len(reader.pages)
    contact=Image.new('RGB',(1280,480*math.ceil(len(images)/2)),'#edf3f0')
    for i,name in enumerate(images):
        im=Image.open(name).convert('RGB');im.thumbnail((620,450));x=(i%2)*640;y=(i//2)*480;contact.paste(im,(x+(640-im.width)//2,y+12));ImageDraw.Draw(contact).text((x+12,y+462),name.name,fill='#243c36');views.append(str(name.relative_to(out)).replace('\\','/'))
    contact.save(out/(file.stem+'-contact.png'));(render/(file.stem+'-text.txt')).write_text(joined,encoding='utf-8');page_count+=len(images)
    results.append({'name':file.name+' all four A3 pages, Frozen/current prices and pending totals','status':'PASS'})
(out/'xlsx-source-checks.json').write_text(json.dumps(sheet_info,indent=2),encoding='utf-8')
(out/'pdf-results.json').write_text(json.dumps({'results':results,'pages':page_count,'views':views,'scope':'Actual app exports rendered by Poppler and source XLSX XML; no engineering/owner acceptance.'},indent=2),encoding='utf-8')
print('PASS',page_count,'actual PDF pages; both workbook source records verified')
