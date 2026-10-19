import {appendCircularPrismSheet} from './circularPrismExcel';
import type ExcelJS from 'exceljs';
import type {Member,SnapshotBundle} from '../domain/model';
import {takeoff} from '../domain/engine';
import {signedArea} from '../domain/prismSchema';
import {prismOffset,prismAnchor,prismRunLength,prismQuantities} from '../domain/prismGeometry';
import {appendTaperedPrismSheets} from './taperedPrismExcel';
export function appendPrismSheets(wb:ExcelJS.Workbook,b:SnapshotBundle,members:Member[]){
 appendTaperedPrismSheets(wb,b,members);
 appendCircularPrismSheet(wb,b,members);
 if(!members.some(m=>m.prismGeometry&&m.prismGeometry.version!==3&&m.prismGeometry.version!==4))return;
 const inclined=members.some(m=>m.prismGeometry?.version===2);
 const edges=wb.addWorksheet('Prism Edges'),check=wb.addWorksheet('Prism Check'),formula=(f:string,n:number)=>({formula:f,result:n});
 edges.addRows([[`${b.project.code} · Polygon concrete edges`],['DRAFT / NOT FOR CONSTRUCTION · captured coordinates in mm. Formwork selection applies to each complete edge. Hole walls run through the entire extrusion. Editing this reference does not update captured BOQ/BBS.'],['Member','Loop kind','Loop / reference','Point','U mm','V mm','Next U mm','Next V mm','Formed 1/0','Edge mm','Area contribution mm²','Formed edge mm']]);
 check.addRows([[`${b.project.code} · Straight polygon prism check`],['DRAFT / NOT FOR CONSTRUCTION · Area = outer − through holes; gross volume = area × length. Net values link to captured BOQ and include manual deductions. Method: '+(b.project.spec.concreteGeometryPolicy||'')],['Member','Axis / profile axes','Start mm','Length mm','Outer area mm²','Holes area mm²','Net area mm²','Formed perimeter mm','Formed end faces','Gross each m³','Gross form each m²','Member qty','Net each m³','Net form each m²','Net total m³','Net form total m²','Source / datum / selected faces']]);
 if(inclined){edges.getRow(3).values=[...Array.from({length:12},(_,i)=>edges.getCell(3,i+1).value),'End offset U mm','End offset V mm','Axis advance mm','Formed side area mm²'];check.getCell('A1').value=`${b.project.code} · Inclined polygon prism check`;check.getCell('D3').value='Axis advance mm';check.getCell('H3').value='Formed profile perimeter mm (reference only)';check.getCell('A2').value='DRAFT / NOT FOR CONSTRUCTION · Volume = net profile area × axis advance. Inclined length is different; side area = norm(edge × run vector). One vector/advance source per member: first edge M:O; following rows link to it. Editable geometric references do not update captured BOQ/BBS. Method: '+b.project.spec.concreteGeometryPolicy;}
 members.forEach((m,mi)=>{
  const p=m.prismGeometry;if(!p||p.version===3||p.version===4)return;
  const q=b.calculations?.[m.id]||takeoff(m,b.project.spec),from=edges.rowCount+1;
  let perimeter=0,holeArea=0;
  [p.profile,...p.holes].forEach((loop,k)=>{
   const sign=signedArea(loop.vertices)>0?1:-1;
   if(k)holeArea+=Math.abs(signedArea(loop.vertices));
   loop.vertices.forEach((a,i)=>{const c=loop.vertices[(i+1)%loop.vertices.length],r=edges.rowCount+1,length=Math.hypot(c[0]-a[0],c[1]-a[1]),formed=Number(loop.formed[i]);perimeter+=length*formed;
    const offset=prismOffset(p),du=c[0]-a[0],dv=c[1]-a[1],side=p.version===2?Math.hypot(du*p.depth,dv*p.depth,du*offset[1]-dv*offset[0]):length*p.depth;
    edges.addRow([m.code,k?'Hole':'Outer',k?p.holes[k-1].label:'Outer profile',i+1,...a,...c,formed,formula(`SQRT((G${r}-E${r})^2+(H${r}-F${r})^2)`,length),formula(`(E${r}*H${r}-F${r}*G${r})/2*${sign}`,(a[0]*c[1]-a[1]*c[0])/2*sign),formula(`I${r}*J${r}`,length*formed),...(inclined?[r===from?offset[0]:formula(`M${from}`,offset[0]),r===from?offset[1]:formula(`N${from}`,offset[1]),r===from?p.depth:formula(`O${from}`,p.depth),formula(`I${r}*SQRT(((G${r}-E${r})*O${r})^2+((H${r}-F${r})*O${r})^2+((G${r}-E${r})*N${r}-(H${r}-F${r})*M${r})^2)`,side*formed)]:[])]);
   });
  });
  const to=edges.rowCount,r=check.rowCount+1,outer=Math.abs(signedArea(p.profile.vertices)),area=outer-holeArea,cap=Number(p.endFaces[0])+Number(p.endFaces[1]),br=mi+4,
   areaSum=(kind:string)=>`SUMIFS('Prism Edges'!K${from}:K${to},'Prism Edges'!B${from}:B${to},"${kind}")`;
  const geometricForm=inclined?prismQuantities(p).formwork:(perimeter*p.depth+area*cap)/1e6;
  check.addRow([m.code,p.axis+' / '+['X','Y','Z'].filter(a=>a!==p.axis).join('/'),p.start,inclined?formula(`'Prism Edges'!O${from}`,p.depth):p.depth,formula(areaSum('Outer'),outer),formula(areaSum('Hole'),holeArea),formula(`E${r}-F${r}`,area),formula(`SUM('Prism Edges'!L${from}:L${to})`,perimeter),cap,formula(`G${r}*D${r}/1000000000`,area*p.depth/1e9),formula(inclined?`(SUM('Prism Edges'!P${from}:P${to})+G${r}*I${r})/1000000`:`(H${r}*D${r}+G${r}*I${r})/1000000`,geometricForm),formula(`'BOQ'!C${br}`,q.quantity),formula(`'BOQ'!D${br}`,q.concrete),formula(`'BOQ'!E${br}`,q.formwork),formula(`L${r}*M${r}`,q.quantity*q.concrete),formula(`L${r}*N${r}`,q.quantity*q.formwork),`${p.basis} · End formwork ${p.endFaces.map(v=>v?'formed':'unformed').join('/')} · Outer/holes flags are recorded in Prism Edges${p.version===2?` · End offset ${p.endOffset.join('/')}mm; start profile anchor ${prismAnchor(p).join('/')}mm; true run ${prismRunLength(p)}mm`:''}`]);
 });
 for(const sheet of [edges,check]){
  sheet.views=[{state:'frozen',ySplit:3}];sheet.columns.forEach((c,i)=>c.width=i===0?22:sheet===check&&i===16?60:i===2&&sheet===edges?30:18);
  if(inclined){const widths=sheet===edges?[20,10,25,8,12,12,12,12,8,13,16,16,13,13,14,18]:[20,14,11,13,16,16,16,16,9,12,12,9,12,12,12,12,45];widths.forEach((width,i)=>sheet.getColumn(i+1).width=width);}
  sheet.mergeCells(1,1,1,sheet.columnCount);sheet.mergeCells(2,1,2,sheet.columnCount);sheet.getRow(1).height=26;sheet.getRow(2).height=42;sheet.getRow(3).height=inclined?60:42;
  sheet.eachRow((row,i)=>{if(i>3)row.height=sheet===check?Math.max(60,inclined?14*Math.ceil(String(row.getCell(17).value).length/35)+12:60):inclined?Math.max(23,13*Math.max(Math.ceil(String(row.getCell(3).value).length/20),Math.ceil(String(row.getCell(1).value).length/16))+8):28;row.eachCell(cell=>{cell.font={name:'Sarabun',size:10,color:{argb:i===3?'FFFFFFFF':'FF253A40'}};cell.alignment={vertical:'middle',wrapText:true};if(i===3)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};if(i>3&&(typeof cell.value==='number'||cell.value&&typeof cell.value==='object'))cell.numFmt='#,##0.000';});});
  sheet.autoFilter={from:{row:3,column:1},to:{row:sheet.rowCount,column:sheet.columnCount}};
  sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:3',printArea:`A1:${sheet===edges?inclined?'P':'L':'Q'}${sheet.rowCount}`};
 }
 edges.getColumn(4).numFmt='0';edges.getColumn(9).numFmt='0';check.getColumn(9).numFmt='0';check.getColumn(12).numFmt='0';
}
