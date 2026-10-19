from pathlib import Path
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw,ImageChops
import hashlib,json,subprocess,re,pdfplumber

root=Path(__file__).resolve().parents[1];out=root/'output/source-revision-verification'
poppler=Path(r'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
files=[('working-source-B-A3.pdf','B','A3'),('frozen-source-B-A3.pdf','B','A3'),('frozen-source-B-after-C-A3.pdf','B','A3'),('frozen-source-B-A1.pdf','B','A1'),('working-source-C-A3.pdf','C','A3'),('restored-frozen-source-B-A3.pdf','B','A3'),('built-current-source-C-A3.pdf','C','A3'),('built-frozen-source-B-A1.pdf','B','A1')]
results=[];texts={}
for name,revision,size in files:
 path=out/'downloads'/name;reader=PdfReader(path);assert len(reader.pages)==3,(name,len(reader.pages))
 text=[' '.join(p.extract_text().split()) for p in reader.pages];texts[path.stem]=text
 assert 'SOURCE MARK INDEX' in text[1];assert 'SOURCE PLAN & DETAIL' in text[2]
 assert f'source-rev-{revision}.' in text[2] and f'Source rev {revision}' in text[2]
 assert f'Replaces source rev {"A" if revision=="B" else "B"}' in text[2]
 assert 'Mark reconciliation: reviewed Draft references' in text[2] and 'UNVERIFIED installation' in text[2]
 assert 'source-rev-A.png' not in ' '.join(text);assert len(re.findall(r'#\d{3}\s+B(?:09|02|04)',text[2]))==3
 assert len(re.findall(r'6 pcs / cut 2500 mm',text[2]))==3
 for mark in ['B09','B02','B04']:assert mark in text[0] and mark in text[1] and mark in text[2]
 assert not re.search(r'\bB03\b',' '.join(text))
 dims={'A3':(420,297),'A1':(841,594)}[size]
 for p,t in zip(reader.pages,text):
  assert abs(float(p.mediabox.width)*25.4/72-dims[0])<.1 and abs(float(p.mediabox.height)*25.4/72-dims[1])<.1
  assert 'NOT FOR CONSTRUCTION' in t
 with pdfplumber.open(path) as document:
  for i,p in enumerate(document.pages):assert p.chars and all(-1<c['x0']<p.width+1 and -1<c['x1']<p.width+1 and -1<c['top']<p.height+1 and -1<c['bottom']<p.height+1 for c in p.chars),(name,i,'text outside paper')
 folder=out/'renders'/path.stem;folder.mkdir(parents=True,exist_ok=True)
 subprocess.run([str(poppler),'-png','-r','75',str(path),str(folder/'drawing')],check=True,stdout=subprocess.DEVNULL)
 pngs=sorted(folder.glob('drawing-*.png'),key=lambda p:int(p.stem.split('-')[-1]));assert len(pngs)==3
 sheet=Image.new('RGB',(1410,365),'#eef3ef')
 for i,png in enumerate(pngs):
  with Image.open(png) as im:thumb=ImageOps.contain(im.convert('RGB'),(450,330))
  sheet.paste(thumb,(i*470+(470-thumb.width)//2,10));ImageDraw.Draw(sheet).text((i*470+12,348),str(i+1),fill='#203b40')
 sheet.save(out/(path.stem+'-contact.png'))
 results.append({'file':name,'sourceRevision':revision,'pages':3,'size':size,'status':'PASS','renderedAllPages':True,'allTextWithinPaper':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
assert (out/'downloads/frozen-source-B-A3.pdf').read_bytes()==(out/'downloads/restored-frozen-source-B-A3.pdf').read_bytes()
for a,b in [('frozen-source-B-A3','frozen-source-B-after-C-A3'),('frozen-source-B-A1','built-frozen-source-B-A1'),('working-source-C-A3','built-current-source-C-A3')]:
 assert texts[a]==texts[b],(a,b,'text mismatch')
 for x,y in zip(sorted((out/'renders'/a).glob('*.png')),sorted((out/'renders'/b).glob('*.png'))):
  with Image.open(x) as xx,Image.open(y) as yy:assert ImageChops.difference(xx,yy).getbbox() is None,(a,b,x.name)
assert hashlib.sha256((root/'output/pdf/selected-zone-floor-BBS-source-draft.pdf').read_bytes()).hexdigest()=='2e566ee09e85eaea5534fdc60cfda73db93e7b0029dd191bccbf452402261d28'
assert hashlib.sha256((root/'Referrence/BS 8666.pdf').read_bytes()).hexdigest()=='9c6fa5d0bafd0a8761f14d1611c582d5db7d89710eaaf0910b5dc7c493e0cb43'
(out/'pdf-verification.json').write_text(json.dumps({'results':results,'restoredFrozenBByteExact':True,'afterReplacementAndBuiltTextPixelsExact':True,'previousPrimaryAndBSUnchanged':True,'visualReview':'Pending agent visual inspection','scope':'Eight actual selected main/built source revision files, synthetic manual-cut fixture; regression PDFs not included in these24leaves.'},indent=2),encoding='utf-8')
print('PASS8 actual PDFs /24leaves rendered; source revision, current-only references, 6pieces/2500mm per Mark, restored bytes and built parity checked')
