from pathlib import Path
import json,hashlib
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
out=Path('output/circular-prism-verification')
audits=[]
for size,expected in [('A3',(1190.55,841.89)),('A1',(2383.94,1683.78))]:
    file=out/f'Circular-BBS-{size}.pdf';pdf=PdfReader(file);assert len(pdf.pages)==9
    for p in pdf.pages:
        assert abs(float(p.mediabox.width)-expected[0])<.1
        assert abs(float(p.mediabox.height)-expected[1])<.1
    text='\n'.join(p.extract_text() or '' for p in pdf.pages)
    assert text.count('Circular v4:')>=6
    assert 'outer D 600' in text and 'hole D 200' in text
    assert 'NOT FOR CONSTRUCTION' in text
    audits.append({'file':file.name,'pages':9,'size':size,'circleDatumPresent':True,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'width':expected[0],'height':expected[1]})
    canvas=Image.new('RGB',(3*420,3*316),'#edf1f0');draw=ImageDraw.Draw(canvas)
    for i in range(9):
        img=Image.open(out/f'{size}-page-{i+1}.png').convert('RGB');img.thumbnail((400,285));x=i%3*420+10;y=i//3*316+22;canvas.paste(img,(x,y));draw.text((x,y-17),f'{size} {i+1}/9',fill='black')
    canvas.save(out/f'{size}-page-contact.png')
(out/'pdf-audit.json').write_text(json.dumps(audits,indent=2),encoding='utf8')
print('PASS18pages: exact paper sizes, circular datum, reference-only status and regenerated contacts')
