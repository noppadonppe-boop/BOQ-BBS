from pathlib import Path
import math,json,hashlib
from collections import Counter
import pdfplumber
from PIL import Image,ImageDraw
out=Path('output/full-mark-drawing-verification');pt=72/25.4
def color(curve,RGB):
    k=curve.get('stroking_color')
    return isinstance(k,(tuple,list)) and len(k)==3 and all(abs(a-b)<.015 for a,b in zip(k,[n/255 for n in RGB]))
def audit(file,size,details=False):
    result={'file':file.name,'size':size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'viewPages':[]}
    w,h=(420,297) if size=='A3' else (841,594)
    with pdfplumber.open(file) as pdf:
        result['pages']=len(pdf.pages)
        tableRows=[]
        for i,page in enumerate(pdf.pages):
            assert abs(page.width-w*pt)<.1 and abs(page.height-h*pt)<.1
            text=page.extract_text() or '';assert 'NOT FOR CONSTRUCTION' in text
            assert f'Sheet: {i+1}/{len(pdf.pages)}' in text
            if 'All 13 Marks' not in text:continue
            for table in page.extract_tables():
                if table and table[0] and table[0][0]=='Mark':
                    tableRows.extend(row for row in table[1:] if row[0])
            assert text.count('All 13 Marks')==2
            cross='SECTION A-A' in text
            modelH=h*.35;boxH=modelH if details else modelH-13;y=43 if details else 48
            expected=[(100+n%5*180,100+math.floor(n/5)*300) for n in range(13)]
            dots=[c for c in page.curves if color(c,[24,121,104]) or color(c,[155,174,170])]
            # Each actual PDF vector circle must occupy the independently
            # calculated projection coordinate, beyond mere text/row coverage.
            for x in [22,w/2+8] if cross else [22]:
                boxW=(w-44)/2;usableW=boxW*.71;usableH=boxH*.82;s=min(usableW/1000,usableH/1000);ox=x+boxW*.073+(usableW-1000*s)/2;oy=y+boxH*.07+(usableH-1000*s)/2
                for u,v in expected:
                    px=(ox+u*s)*pt;py=(oy+(1000-v)*s)*pt
                    assert any(math.hypot((c['x0']+c['x1'])/2-px,(c['top']+c['bottom'])/2-py)<.05 for c in dots),(file.name,i+1,u,v)
            words=page.extract_words();tableHeads=[t['top'] for t in words if t['text']=='Mark' and t['top']>h*.35*pt]
            assert tableHeads
            legends=[t['bottom'] for t in words if t['text']=='All']
            assert max(legends)<min(tableHeads)
            if not cross:
                assert '(no intersection)' in text and 'labels have no leader' in text
            result['viewPages'].append({'page':i+1,'planPositions':13,'crossPositions':13 if cross else 0,'noFalseSectionLeaders':not cross,'legendAboveTable':True})
        expectedMarks=['MARK-'+str(n+1).zfill(2)+('-LONG-NAME-REFERENCE' if n==12 else '') for n in range(13)]
        assert Counter(row[0].replace('\n','') for row in tableRows)==Counter({m:2 for m in expectedMarks})
        for row in tableRows:
            assert row[4:6]==['1','3']
            assert float(row[6].replace(',',''))==1800 and float(row[7])==4.794
        result['tableRows']=26;result['eachMarkRepeatedForTwoSectionsOnly']=True;result['countsCutsWeightsUnchanged']=True
    assert result['viewPages'];return result
results=[]
for size in ['A3','A1']:
    for details in [False,True]:
        name=f'Full-Marks-{"Details-" if details else ""}{size}.pdf';results.append(audit(out/name,size,details))
        prefix=f'{"Details-" if details else ""}{size}';paths=sorted(p for p in out.glob(prefix+'-*.png') if p.stem[len(prefix)+1:].isdigit());n=len(paths);assert n==results[-1]['pages'];cols=3;rows=math.ceil(n/cols);canvas=Image.new('RGB',(1260,rows*316),'#edf1f0');draw=ImageDraw.Draw(canvas)
        for i,p in enumerate(paths):
            img=Image.open(p).convert('RGB');img.thumbnail((400,285));x=i%3*420+10;y=i//3*316+22;canvas.paste(img,(x,y));draw.text((x,y-17),f'{prefix} {i+1}/{n}',fill='black')
        canvas.save(out/(prefix+'-contact.png'))
(out/'pdf-audit.json').write_text(json.dumps(results,indent=2),encoding='utf8')
compiled=Path('tmp/full-mark-compiled-A3.pdf')
if compiled.exists():
    result=audit(compiled,'A3');result['file']='compiled UI download (private temporary file)';(out/'compiled-pdf-audit.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(f'PASS {sum(r["pages"] for r in results)} final PDF pages; every view has all13expected plan vector positions and exact cross sections')
