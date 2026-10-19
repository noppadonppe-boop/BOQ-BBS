from pathlib import Path
import json,hashlib,zipfile,re,posixpath,subprocess
from xml.etree import ElementTree as ET
from pypdf import PdfReader
root=Path(__file__).resolve().parents[1];out=root/'output/engineering-report-verification'
node='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
def read(name):return json.loads((out/name).read_text(encoding='utf-8-sig'))
def sha(b):return hashlib.sha256(b).hexdigest()
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def sheets(path):
    result={}
    with zipfile.ZipFile(path) as z:
        strings=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        rels={v.attrib['Id']:v.attrib['Target'] for v in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        book=ET.fromstring(z.read('xl/workbook.xml'))
        for sheet in book.find('s:sheets',ns):
            name=sheet.attrib['name'];target=rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target=target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/'+target)
            t=ET.fromstring(z.read(target));cells={};formulas={};types={};empty_text=[]
            for c in t.findall('.//s:sheetData/s:row/s:c',ns):
                ref=c.attrib['r'];typ=c.attrib.get('t','n');v=c.find('s:v',ns);value=v.text if v is not None else None;f=c.find('s:f',ns)
                if typ=='s':value=strings[int(value)]
                elif typ=='inlineStr':value=''.join(c.find('s:is',ns).itertext())
                elif typ in ['n','']:value=float(value) if value is not None else None
                elif typ=='b':value=value=='1'
                if typ=='str' and value in ['',None]:empty_text.append(ref)
                cells[ref]=value;types[ref]=typ
                if f is not None:formulas[ref]=f.text
            dimension=t.find('s:dimension',ns).attrib['ref'];result[name]={'cells':cells,'types':types,'formulas':formulas,'dimension':dimension,'emptyTextCells':empty_text}
    return result
ui=read('ui-results.json');assert len(ui['results'])==11 and all(r['status']=='PASS' for r in ui['results']);assert not ui['errors'] and not ui['cloud'] and not ui['forbidden']
profiles=['gulf-reference','bbs-qa','partial-qa','negative-qa'];xlsx={};pdfs=[]
for profile in profiles:
    record=read(profile+'.json');raw=(out/(profile+'.json')).read_bytes();meta=sheets(out/(profile+'.xlsx'));assert set(meta)=={'Comparison','Captured Input'}
    cells=meta['Captured Input']['cells'];parts=[]
    for key,value in cells.items():
        if key.startswith('A') and isinstance(value,str) and re.fullmatch(r'JSON \d+/\d+',value):parts.append((int(value.split()[1].split('/')[0]),cells['B'+key[1:]]))
    restored=json.loads(''.join(text for _,text in sorted(parts)));assert restored==record
    assert record['body']['engineeringApproved'] is False and record['body']['sourceBytesIncluded'] is False
    assert record['body']['sourceVerification']['sha256']=='992689f254a1c732e9f8ff37555b4f47225e33cbbce8d25d38a8ccfe9240c7cd'
    xlsx[profile+'.xlsx']={'sha256':sha((out/(profile+'.xlsx')).read_bytes()),'sheets':meta,'recordDigest':record['contentDigest']}
    reader=PdfReader(out/(profile+'.pdf'));attachments=reader.attachments;assert list(attachments)==['engineering-preview.json'];assert attachments['engineering-preview.json'][0]==raw
    for i,page in enumerate(reader.pages):
        assert abs(float(page.mediabox.width)-841.8898)<1 and abs(float(page.mediabox.height)-595.2756)<1
        text=page.extract_text();assert 'NOT FOR CONSTRUCTION' in text and 'No BS/ACI' in text and f'{i+1}/{len(reader.pages)}' in text
    prefix=out/(profile+'-pdf');subprocess.run([poppler,'-r','110','-png',str(out/(profile+'.pdf')),str(prefix)],check=True,capture_output=True)
    images=[profile+'-pdf-'+str(i+1)+'.png' for i in range(len(reader.pages))]
    assert all((out/name).exists() for name in images)
    pdfs.append({'file':profile+'.pdf','pages':len(reader.pages),'sha256':sha((out/(profile+'.pdf')).read_bytes()),'embeddedCaptureExact':True,'images':images})
assert xlsx['gulf-reference.xlsx']['sheets']['Comparison']['cells'].get('D19') is None
assert xlsx['partial-qa.xlsx']['sheets']['Comparison']['cells'].get('C16') is None
assert xlsx['partial-qa.xlsx']['sheets']['Comparison']['cells']['C17']==0
assert xlsx['bbs-qa.xlsx']['sheets']['Comparison']['cells']['D20']==800
assert xlsx['bbs-qa.xlsx']['sheets']['Comparison']['cells']['D21']==15
(out/'xlsx-checks.json').write_text(json.dumps(xlsx,ensure_ascii=False,indent=2),encoding='utf8')
(out/'pdf-checks.json').write_text(json.dumps(pdfs,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'status':'PASS','actualUI':11,'xlsx':4,'pdf':4,'pdfPages':sum(p['pages'] for p in pdfs),'exactEmbeddedCaptures':4,'fullXlsxCaptures':4}))
