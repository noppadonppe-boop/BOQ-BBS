from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as ET,subprocess,math,posixpath
from pypdf import PdfReader
from PIL import Image,ImageDraw

out=Path('output/source-region-verification');render=out/'pdf-render';render.mkdir(exist_ok=True)
poppler='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
read=lambda name:json.loads((out/name).read_text(encoding='utf-8'))
artifacts=read('export-results.json')['artifacts'];ctx=read('context.json');results=[];views=[];infos={};pdfs=[]
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for a in artifacts:
    file=out/a['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==a['sha256']
    assert file.stat().st_size==a['bytes'];assert len(a['references'])==9
    if a['frozen']:
        for ref in a['references']:
            original=next(r for r in ctx['imageEvidence'] if r['member']==ref['member'] and r['mark']==ref['mark'])
            assert ref['imageHash']==original['sha256'] and (ref['width'],ref['height'])==(original['width'],original['height'])
    if file.suffix=='.xlsx':
        z=zipfile.ZipFile(file);wb=ET.fromstring(z.read('xl/workbook.xml'));rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'));links={r.attrib['Id']:r.attrib['Target'] for r in rels};shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        names=[sh.attrib['name'] for sh in wb.findall('x:sheets/x:sheet',ns)];assert 'Source Shape References' in names
        sh=next(sh for sh in wb.findall('x:sheets/x:sheet',ns) if sh.attrib['name']=='Source Shape References');target=links[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target;tree=ET.fromstring(z.read(target));empty=[];cells={}
        for c in tree.findall('.//x:c',ns):
            v=c.find('x:v',ns)
            value=shared[int(v.text)] if c.attrib.get('t')=='s' and v is not None else v.text if v is not None else None
            cells[c.attrib['r']]=value
            if value=='':empty.append(c.attrib['r'])
            assert c.find('x:f',ns) is None,'Reference identity is captured,not a mutable formula'
        assert tree.find('x:dimension',ns).attrib['ref']=='A1:G12'
        assert tree.find('x:pageSetup',ns).attrib['paperSize']=='8'
        for ref in a['references']:
            row=next(i for i in range(4,13) if cells.get('A'+str(i))==ref['member'] and cells.get('B'+str(i))==ref['mark']+' → '+ref['bar'])
            assert cells['D'+str(row)]==ref['text']
        assert 'NOT FOR CONSTRUCTION' in cells['A2']
        # Only images bound to this sheet. The existing workbook can also
        # contain app BBS/fabrication graphics, which are not source crops.
        def relationships(base):
            path=posixpath.join(posixpath.dirname(base),'_rels',posixpath.basename(base)+'.rels')
            return {r.attrib['Id']:r.attrib['Target'].lstrip('/') if r.attrib['Target'].startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(base),r.attrib['Target'])) for r in ET.fromstring(z.read(path))}
        drawing_path=relationships(target)[tree.find('x:drawing',ns).attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        drawing=ET.fromstring(z.read(drawing_path));media=relationships(drawing_path)
        bindings=drawing.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip')
        assert len(bindings)==9
        hashes=sorted(hashlib.sha256(z.read(media[b.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed']])).hexdigest() for b in bindings)
        assert sorted(r['imageHash'] for r in a['references'])==hashes
        infos[file.name]={'sha256':a['sha256'],'sheets':{'Source Shape References':{'dimension':'A1:G12','emptyTextCells':empty,'rows':a['references']}}}
        results.append({'name':file.name+' original reference XML/nineembeddedPNGs/fullSHA/rotatedcoordinates','status':'PASS'});continue
    reader=PdfReader(file);texts=[p.extract_text() or '' for p in reader.pages];source_pages=[i for i,t in enumerate(texts) if 'Original bending shape / REFERENCE ONLY' in t];assert len(source_pages)==9
    reference_matches=[]
    for i,p in enumerate(reader.pages):
        expected=(210,297) if a['size']=='A4' else (420,297) if a['size']=='A3' else (841,594)
        actual=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72)
        assert all(abs(actual[j]-expected[j])<.15 for j in range(2)),(file,i,actual)
        assert 'NOT FOR CONSTRUCTION' in texts[i]
        if i not in source_pages:continue
        compact=' '.join(texts[i].split());ref=next(r for r in a['references'] if r['member']+' / source Mark '+r['mark']+' → BBS '+r['bar'] in compact)
        assert ref['reference']['sha256'] in compact
        assert 'source page '+str(ref['reference']['page']) in compact
        if a['size']!='A4':assert 'QA-SRC46-' in texts[i]
        for name in ['left','top','width','height']:
            key={'left':'x','top':'y'}.get(name,name);value=ref['reference']['rect'][key]*100
            assert name+' '+f'{value:.4f}' in compact,(file,i,name,compact)
        assert len(p.images)>=1,(file,i,'sourceimage missing')
        # Frozen images are decoded independently from the exported PDF XObject.
        if a['frozen']:
            original=next(r for r in ctx['imageEvidence'] if r['member']==ref['member'] and r['mark']==ref['mark'])
            source=Image.open(out/original['local']).convert('RGB');matching=[]
            for image in p.images:
                candidate=image.image.convert('RGB')
                if candidate.size==source.size:matching.append(candidate.tobytes()==source.tobytes())
            assert any(matching),(file,i,'PDF crop pixels differ from actual source crop')
        reference_matches.append({'page':i+1,'member':ref['member'],'mark':ref['mark'],'sourcePage':ref['reference']['page']})
    assert len(reference_matches)==9
    subprocess.run([poppler,'-png','-scale-to','1800',str(file),str(render/file.stem)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    images=sorted(render.glob(file.stem+'-*.png'));assert len(images)==len(reader.pages)
    contacts=[]
    for start in range(0,len(images),12):
        selected=images[start:start+12];contact=Image.new('RGB',(1500,380*math.ceil(len(selected)/3)),'#edf3f0')
        for i,name in enumerate(selected):
            im=Image.open(name).convert('RGB');im.thumbnail((482,342));x=(i%3)*500;y=(i//3)*380;contact.paste(im,(x+(500-im.width)//2,y+10));ImageDraw.Draw(contact).text((x+12,y+356),name.name,fill='#243c36')
        local=file.stem+'-contact-'+str(start//12+1)+'.png';contact.save(out/local);contacts.append(local)
    (render/(file.stem+'-text.txt')).write_text('\n'.join(texts),encoding='utf-8')
    page_views=[str(name.relative_to(out)).replace('\\','/') for name in images];views.extend(page_views)
    pdfs.append({'file':file.name,'pages':len(images),'contacts':contacts,'sourcePages':reference_matches})
    results.append({'name':file.name+' all'+str(len(images))+' actual'+a['size']+' pages/ninesourceimages/coordinates/frames','status':'PASS'})
(out/'xlsx-source-checks.json').write_text(json.dumps(infos,indent=2),encoding='utf-8')
(out/'file-results.json').write_text(json.dumps({'results':results,'pages':len(views),'views':views,'pdfs':pdfs,'scope':'Actual app outputs: original XML/images,PDF text/imagepixels and every rendered page. No construction or nativeExcelprint acceptance.'},indent=2),encoding='utf-8')
print('PASS',len(views),'actualPDFpages; bothoriginalworkbookXML/ninePNGimages verified')
