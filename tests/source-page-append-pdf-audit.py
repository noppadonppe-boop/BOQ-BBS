from pathlib import Path
import json,hashlib,re,math
from pypdf import PdfReader
from pypdf.generic import ContentStream
from PIL import Image,ImageDraw
out=Path('output/source-page-append-verification');fixture=json.loads(Path('tests/fixtures/b104-native-panels.json').read_text(encoding='utf8'));extra=json.loads(Path('tests/fixtures/b104-page19-native.json').read_text(encoding='utf8'));expected={r['mark']:r for r in fixture['expected']+extra['expected']};results=[]
for size in ['A3','A1']:
    file=out/f'B104-Source-Pages-{size}.pdf';pdf=PdfReader(file);width,height=(1190.55,841.89) if size=='A3' else (2383.94,1683.78);crops=[];texts=[]
    for i,p in enumerate(pdf.pages):
        assert abs(float(p.mediabox.width)-width)<.1 and abs(float(p.mediabox.height)-height)<.1
        text=p.extract_text() or '';texts.append(text);assert 'NOT FOR CONSTRUCTION' in text
        assert f'Sheet: {i+1}/{len(pdf.pages)}' in text
        if 'Original bending shape / REFERENCE ONLY' not in text:continue
        match=re.search(r'source Mark (\d+)\s*→',text);assert match,(file.name,i+1);mark=match.group(1);assert mark in expected;keys=[str(args[0]) for args,op in ContentStream(p['/Contents'],p.pdf).operations if op==b'Do' and str(args[0]).startswith('/I')];assert len(keys)==1;images=[p.images[keys[0]]]
        source=Image.open(out/f'source-crops/mark-{mark}.png').convert('RGBA');embedded=images[0].image.convert('RGBA');assert source.size==embedded.size
        assert hashlib.sha256(source.tobytes()).digest()==hashlib.sha256(embedded.tobytes()).digest(),(size,mark)
        assert ('table page '+('2' if mark in {r['mark'] for r in fixture['expected']} else '19')) in text;assert 'No reconstructed app bar' in text;crops.append({'mark':mark,'page':i+1,'decodedPixelsMatch':True,'pixels':source.size})
    assert sorted(c['mark'] for c in crops)==sorted(expected)
    assert '2,908.61' in '\n'.join(texts);assert '891.57' in '\n'.join(texts);assert 'Source page table register' in '\n'.join(texts);assert 'no single printed overall total' in '\n'.join(texts)
    assert all(r['grade']=='SD40' for r in expected.values())
    results.append({'file':file.name,'size':size,'pages':len(pdf.pages),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'all55SourceShapes':crops,'sourceTotalRetained':2908.61,'notForConstruction':True,'allOwnerSheetNumbers':True})
(out/'pdf-audit.json').write_text(json.dumps(results,indent=2),encoding='utf8')
print(f'PASS{sum(r["pages"] for r in results)}PDF pages and110decoded crop images match original source pixels after lossless compression')
