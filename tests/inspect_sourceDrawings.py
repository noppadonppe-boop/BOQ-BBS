from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw, ImageChops
import json, hashlib, subprocess, re

root=Path(__file__).resolve().parents[1];out=root/'output/source-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
ctx=json.loads((out/'context.json').read_text(encoding='utf-8'));results=[];alignment=[]
files=[('working-source-A3.pdf',13,'A3'),('frozen-source-A3.pdf',13,'A3'),('frozen-source-A1.pdf',11,'A1'),('retry-source-A3.pdf',13,'A3'),('restored-source-A1.pdf',11,'A1'),('built-source-A1.pdf',11,'A1'),('legacy-BBS-A1.pdf',3,'A1')]
def hashfile(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def kinds(page):
    seen=set();found=[]
    def walk(resources):
        for obj in resources.get('/XObject',{}).values():
            o=obj.get_object();key=id(o)
            if key in seen:continue
            seen.add(key);found.append(str(o.get('/Subtype')))
            if o.get('/Resources'):walk(o['/Resources'])
    walk(page['/Resources']);return found
def fit(size,w,h):
    # Independent aspect fit; intentionally does not import the application helper.
    x,y,bw,bh=(18,69,262,162) if size=='A3' else (18,69,595,459)
    scale=min(bw/w,bh/h);return x+(bw-w*scale)/2,y+(bh-h*scale)/2,w*scale,h*scale
def nearby(image,size,uv,color,source_dims=(440,250),radius=7):
    fx,fy,fw,fh=fit(size,*source_dims);dims=(420,297) if size=='A3' else (841,594)
    x=(fx+uv[0]*fw)*image.width/dims[0];y=(fy+uv[1]*fh)*image.height/dims[1]
    pixels=image.crop((round(x)-radius,round(y)-radius,round(x)+radius+1,round(y)+radius+1)).convert('RGB')
    found=any(max(abs(a-b) for a,b in zip(p,color))<40 for p in pixels.get_flattened_data())
    return found,[round(x,2),round(y,2)]
colors=[((52,262),(13,51,217)),((428,262),(13,166,51)),((52,62),(204,13,51)),((428,62),(179,77,204))]
for name,pages,size in files:
    path=out/'downloads'/name;reader=PdfReader(path);assert len(reader.pages)==pages,(name,len(reader.pages))
    dims={'A3':(420,297),'A1':(841,594)}[size];texts=[p.extract_text() for p in reader.pages];alltext=' '.join(texts)
    for i,(p,t) in enumerate(zip(reader.pages,texts)):
        assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1 and abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
        assert 'NOT FOR CONSTRUCTION' in t,(name,i,'draft label')
    assert len(re.findall(r'6\s+2250',alltext))>=13,(name,'BBS quantity/cuts')
    if name!='legacy-BBS-A1.pdf':
        source_start=4 if size=='A3' else 3;source_texts=texts[source_start:]
        assert len(source_texts)==(9 if size=='A3' else 8)
        assert 'SOURCE MARK INDEX' in alltext and 'Callouts are source references, not extra bar quantities.' in alltext
        for mark in ['B'+str(i).zfill(2) for i in range(1,14)]:assert mark in texts[source_start-1],(name,mark,'index')
        callouts=re.findall(r'#(\d{3})\s+B\d{2}', '\n'.join(source_texts))
        assert len(callouts)==(43 if name.startswith('working') else 42),(name,len(callouts))
        for i,t in enumerate(source_texts):
            assert f'Source sheet {i+1}/{len(source_texts)} / {size}' in t
            assert 'Source pointers are user placed / UNVERIFIED' in t and 'original scale does not apply' in t
            assert re.search(r'Source SHA256: [0-9a-f]{64}',t) and 'Source bytes verified against saved attachment hash.' in t
        controls=source_start+(2 if size=='A3' else 1)
        for p in range(source_start,controls+3):assert '/Form' in kinds(reader.pages[p]) and '/Image' not in kinds(reader.pages[p]),(name,p,'vector source')
        for p in range(controls+3,pages):assert '/Image' in kinds(reader.pages[p]),(name,p,'raster reference')
        assert '200 effective dpi' in source_texts[-4] and 'Raster PDF reference / visible PDF annotations' in source_texts[-4]
        assert 'PDF layers rendered' in source_texts[-3] and 'effective dpi' in source_texts[-3]
    folder=out/'renders'/path.stem;folder.mkdir(parents=True,exist_ok=True)
    cached=list(folder.glob('drawing-*.png'))
    if len(cached)!=pages or any(p.stat().st_mtime<path.stat().st_mtime for p in cached):
        subprocess.run([str(poppler),'-png','-r','75',str(path),str(folder/'drawing')],check=True,stdout=subprocess.DEVNULL)
    pngs=sorted(folder.glob('drawing-*.png'),key=lambda p:int(p.stem.split('-')[-1]));assert len(pngs)==pages
    contact=Image.new('RGB',(1410,365*((pages+2)//3)),'white')
    for i,png in enumerate(pngs):
        with Image.open(png) as im:thumb=ImageOps.contain(im.convert('RGB'),(450,330))
        tile=Image.new('RGB',(470,365),'#edf2ef');tile.paste(thumb,((470-thumb.width)//2,10));ImageDraw.Draw(tile).text((12,348),str(i+1),fill='#203940');contact.paste(tile,((i%3)*470,(i//3)*365))
    contact.save(out/(path.stem+'-contact.png'))
    if name in ['frozen-source-A3.pdf','frozen-source-A1.pdf']:
        controls=[5,7,8,9] if size=='A3' else [4,5,6,7]
        for number,rotation in zip(controls,[0,90,180,270]):
            with Image.open(pngs[number-1]) as im:
                for (x,y),color in colors:
                    uv={0:((x-30)/440,(290-y)/250),90:((y-40)/250,(x-30)/440),180:((470-x)/440,(y-40)/250),270:((290-y)/250,(470-x)/440)}[rotation]
                    yes,at=nearby(im,size,uv,color,(250,440) if rotation in [90,270] else (440,250));assert yes,(name,number,rotation,color,at)
            # A3 rotation0 edge callouts are on continuation page6 (#14–17).
            edge_number=6 if size=='A3' and rotation==0 else number
            with Image.open(pngs[edge_number-1]) as edge_image:
                for uv in [(0,0),(1,0),(0,1),(1,1)]:
                    yes,at=nearby(edge_image,size,uv,(181,93,18),(250,440) if rotation in [90,270] else (440,250));assert yes,(name,edge_number,'pointer edge',at)
            alignment.append({'file':name,'page':number,'rotation':rotation,'fourCropColorsAndFourSavedEdgeTargets':'PASS'})
        stamp,jpeg,png=(10,12,13) if size=='A3' else (8,10,11)
        for number,uv,color,wh,label in [(stamp,(195/440,135/250),(255,0,0),(440,250),'visible Stamp appearance'),(jpeg,(1-31/250,31/440),(13,51,217),(250,440),'EXIF6 clockwise'),(png,(31/440,31/250),(13,51,217),(440,250),'PNG original orientation')]:
            with Image.open(pngs[number-1]) as im:yes,at=nearby(im,size,uv,color,wh)
            assert yes,(name,number,label,at);alignment.append({'file':name,'page':number,'reference':label,'status':'PASS'})
    results.append({'file':name,'status':'PASS','pages':pages,'size':size,'sha256':hashfile(path),'renderedAllPages':True})
assert (out/'downloads/frozen-source-A1.pdf').read_bytes()==(out/'downloads/restored-source-A1.pdf').read_bytes()
retry_a=PdfReader(out/'downloads/frozen-source-A3.pdf');retry_b=PdfReader(out/'downloads/retry-source-A3.pdf')
assert all(a.extract_text()==b.extract_text() for a,b in zip(retry_a.pages,retry_b.pages))
for a,b in zip(sorted((out/'renders/frozen-source-A3').glob('*.png')),sorted((out/'renders/retry-source-A3').glob('*.png'))):
    with Image.open(a) as aa, Image.open(b) as bb:assert ImageChops.difference(aa,bb).getbbox() is None
for a,b in zip(sorted((out/'renders/frozen-source-A1').glob('*.png')),sorted((out/'renders/built-source-A1').glob('*.png'))):
    with Image.open(a) as aa, Image.open(b) as bb:assert ImageChops.difference(aa,bb).getbbox() is None
assert hashfile(root/'Referrence/BS 8666.pdf')=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
assert hashfile(root/'Referrence/ตัวอย่าง BBS/GULF-ISB-CU-FL10600-2C1-100.pdf')==ctx['originalSourceHash']
assert hashfile(root/'output/pdf/spatial-reference-projections-draft.pdf')=='bd9c14630863574a66399006c462a0cc474974b0cabc75364f9726388746c288'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'independentPixelAlignment':alignment,'sourcesAndPreviousPrimaryUnchanged':True,'restoredA1ByteExact':True,'retryA3TextAndPixelsExact':True,'builtA1PixelsExact':True,'regeneratedBytesNote':'New exports carry fresh PDF creation times; byte equality is only claimed for download of the stored historical artifact after Restore.','renderer':'Poppler pdftoppm','visualReview':'Pending agent visual inspection','scope':'Synthetic B01–B13 software fixture. The supplied GULF page verifies PDF rendering/source references, not its engineering quantities.'},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS {len(results)} PDFs / {sum(r["pages"] for r in results)} leaves rendered; {len(alignment)} independent orientation checks; hashes unchanged')
