from pathlib import Path
import json,subprocess,hashlib,math,zipfile,xml.etree.ElementTree as ET
from pypdf import PdfReader
from PIL import Image,ImageDraw
out=Path('output/member-copy-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
art=json.loads((out/'export-results.json').read_text(encoding='utf-8'))['artifacts'];results=[];pages=0
for a in art:
    f=out/a['local'];assert hashlib.sha256(f.read_bytes()).hexdigest()==a['sha256']
    if f.suffix!='.pdf':continue
    r=PdfReader(f);texts=[p.extract_text() or '' for p in r.pages];expected={'A3':(420,297),'A1':(841,594)}[a['paper']]
    for i,p in enumerate(r.pages):
        size=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72)
        assert max(abs(x-y) for x,y in zip(size,expected))<.15,(f.name,i,size)
        assert 'NOT FOR CONSTRUCTION' in texts[i]
    joined='\n'.join(texts)
    for text in [a['memberCode'],'COPY-BBS-842','COPY QA OWNER FRAME','R01','R02']:assert text in joined,(f.name,text)
    assert 'COMPLEX-COPY' not in joined and 'CUBE-SOURCE' not in joined
    subprocess.run([poppler,'-png','-scale-to','1500',str(f),str(render/f.stem)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    images=sorted(render.glob(f.stem+'-*.png'));assert len(images)==len(r.pages)
    contact=Image.new('RGB',(1280,480*math.ceil(len(images)/2)),'#edf3f0')
    for i,name in enumerate(images):
        im=Image.open(name).convert('RGB');im.thumbnail((620,450));x=(i%2)*640;y=(i//2)*480;contact.paste(im,(x+(640-im.width)//2,y+12));ImageDraw.Draw(contact).text((x+12,y+462),name.name,fill='#243c36')
    contact.save(out/(f.stem+'-contact.png'));(render/(f.stem+'-text.txt')).write_text(joined,encoding='utf-8')
    pages+=len(r.pages);results.append({'file':f.name,'pages':len(r.pages),'size_mm':expected,'allPagesRendered':True,'ownerReferenceVerified':True,'warningsEachPage':True,'status':'PASS'})
(out/'pdf-results.json').write_text(json.dumps({'results':results,'renderedPages':pages,'actualAppExports':True,'engineeringAcceptance':False},indent=2),encoding='utf-8')
# Inspect source workbook XML; no workbook is saved or rewritten during QA.
f=out/'copied-member-BOQ-BBS.xlsx';ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(f) as z:
    workbook=ET.fromstring(z.read('xl/workbook.xml'));sheets=[s.attrib['name'] for s in workbook.find('s:sheets',ns)]
    ss=ET.fromstring(z.read('xl/sharedStrings.xml'));strings=[''.join(t.text or '' for t in s.iter('{'+ns['s']+'}t')) for s in ss]
    index=sheets.index('BOQ Summary')+1;tree=ET.fromstring(z.read(f'xl/worksheets/sheet{index}.xml'));b5=tree.find(".//s:c[@r='B5']",ns)
    blank=b5 is None or b5.find('s:v',ns) is None or b5.attrib.get('t')=='s' and strings[int(b5.find('s:v',ns).text)]==''
    assert blank
    sheet_info={}
    for i,name in enumerate(sheets):
        t=ET.fromstring(z.read(f'xl/worksheets/sheet{i+1}.xml'))
        blanks=[];leading=[]
        for cell in t.findall('.//s:sheetData/s:row/s:c',ns):
            v=cell.find('s:v',ns)
            text=strings[int(v.text)] if cell.attrib.get('t')=='s' and v is not None else v.text if cell.attrib.get('t')=='str' and v is not None else None
            if text=='':blanks.append(cell.attrib['r'])
            if text and len(text)>1 and text.startswith('0') and text.isdecimal():leading.append({'cell':cell.attrib['r'],'text':text})
        sheet_info[name]={'dimension':t.find('s:dimension',ns).attrib['ref'],'merges':[c.attrib['ref'] for c in t.findall('s:mergeCells/s:mergeCell',ns)],'emptyTextCells':blanks,'leadingZeroTextCells':leading}
    bbs_xml=ET.fromstring(z.read(f"xl/worksheets/sheet{sheets.index('BBS')+1}.xml"))
    code=bbs_xml.find(".//s:c[@r='F4']",ns);assert code.attrib.get('t')=='s';value=strings[int(code.find('s:v',ns).text)];assert value=='00'
(out/'xlsx-source-checks.json').write_text(json.dumps({'sheets':sheets,'sheetInfo':sheet_info,'summaryB5ActuallyBlank':blank,'shapeCode00TypedAsText':value,'fileSha256':hashlib.sha256(f.read_bytes()).hexdigest(),'unchangedOriginal':True},indent=2),encoding='utf-8')
print('PASS',len(results),'actual PDFs /',pages,'rendered pages; original XLSX blank and tabs checked')
