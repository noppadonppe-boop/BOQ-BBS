from pathlib import Path
import json,subprocess,hashlib,math
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
root=Path.cwd();out=root/'output/drawing-composer-verification';render=out/'pdf-render';render.mkdir(exist_ok=True)
poppler=Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe')
records=[]
for evidence in ['ui-results.json','built-results.json']:
    records.extend(json.loads((out/evidence).read_text(encoding='utf-8'))['artifacts'])
results=[];pages=0
for a in records:
    if not a['local'].endswith('.pdf'):continue
    file=out/a['local'];assert hashlib.sha256(file.read_bytes()).hexdigest()==a['sha256'];reader=PdfReader(file);texts=[p.extract_text() or '' for p in reader.pages]
    expected={'A3':(420,297),'A1':(841,594),'A4':(210,297)}[a['paper']]
    for i,p in enumerate(reader.pages):
        actual=(float(p.mediabox.width)*25.4/72,float(p.mediabox.height)*25.4/72)
        assert max(abs(x-y) for x,y in zip(actual,expected))<.15,(a['local'],i,actual)
        assert 'NOT FOR CONSTRUCTION' in texts[i],(a['local'],i,'missing warning')
        assert 'LIVE FRAME CHANGED' not in texts[i]
    joined='\n'.join(texts);assert 'BEAM-B' not in joined
    if a['kind']=='drawing':
        assert 'QA-BBS-101' in joined and 'EXPORT QA FROZEN FRAME' in joined
        assert 'R01' in joined and 'R02' in joined
    if a['kind']=='schedule':assert '10101A' in joined
    prefix=render/file.stem
    subprocess.run([str(poppler),'-png','-scale-to','1500',str(file),str(prefix)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    images=sorted(render.glob(file.stem+'-*.png'));assert len(images)==len(reader.pages)
    cols=2;thumbs=[]
    for image in images:
        im=Image.open(image).convert('RGB');im.thumbnail((620,455));tile=Image.new('RGB',(640,480),'#eef2f0');tile.paste(im,((640-im.width)//2,12));ImageDraw.Draw(tile).text((12,463),image.name,fill='#243c36');thumbs.append(tile)
    contact=Image.new('RGB',(cols*640,math.ceil(len(thumbs)/cols)*480),'#eef2f0')
    for i,tile in enumerate(thumbs):contact.paste(tile,((i%cols)*640,(i//cols)*480))
    contact.save(out/(file.stem+'-contact.png'))
    (render/(file.stem+'-text.txt')).write_text(joined,encoding='utf-8')
    pages+=len(reader.pages);results.append({'file':a['local'],'pages':len(reader.pages),'size_mm':expected,'allPagesRendered':True,'warningsEachPage':True,'sha256':a['sha256'],'status':'PASS'})
(out/'pdf-results.json').write_text(json.dumps({'results':results,'renderedPages':pages,'actualAppExports':True,'engineeringAcceptance':False},indent=2),encoding='utf-8');print('PASS',len(results),'actual PDFs /',pages,'rendered pages')
