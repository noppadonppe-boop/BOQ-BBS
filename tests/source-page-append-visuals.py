from pathlib import Path
import json,math
from PIL import Image,ImageDraw
out=Path('output/source-page-append-verification');pdfs=json.loads((out/'pdf-audit.json').read_text())
for r in pdfs:
    size=r['size'];files=sorted(p for p in out.glob(size+'-*.png') if p.stem[len(size)+1:].isdigit());assert len(files)==r['pages']
    chosen=list(dict.fromkeys([0,1]+[c['page']-1 for c in r['all55SourceShapes'][:2]]+[c['page']-1 for c in r['all55SourceShapes'][-2:]]+[len(files)-1]))
    canvas=Image.new('RGB',(1260,math.ceil(len(chosen)/3)*316),'#edf1f0');draw=ImageDraw.Draw(canvas)
    for j,i in enumerate(chosen):
        img=Image.open(files[i]).convert('RGB');img.thumbnail((400,285));x=j%3*420+10;y=j//3*316+22;canvas.paste(img,(x,y));draw.text((x,y-17),f'{size} page{i+1}/{len(files)}',fill='black')
    canvas.save(out/(size+'-selected-contact.png'))
fixture=json.loads(Path('tests/fixtures/b104-native-panels.json').read_text(encoding='utf8'));fixture['expected']+=json.loads(Path('tests/fixtures/b104-page19-native.json').read_text(encoding='utf8'))['expected']
for part in range(3):
    canvas=Image.new('RGB',(1500,800),'white');draw=ImageDraw.Draw(canvas)
    for j,r in enumerate(fixture['expected'][part*20:(part+1)*20]):
        img=Image.open(out/f'source-crops/mark-{r["mark"]}.png').convert('RGB');img.thumbnail((280,170));x=j%5*300+10;y=j//5*200+25;canvas.paste(img,(x,y));draw.text((x,y-17),'Mark'+r['mark'],fill='black')
    canvas.save(out/f'source-panel-{part+1}-crops.png')
print('PASS all currentPDF renders and55source crop contacts')
