import type ExcelJS from 'exceljs';
import type {Member,SnapshotBundle} from '../domain/model';
import {takeoff} from '../domain/engine';
import {signedArea} from '../domain/prismSchema';
import {prismAnchor,prismSideArea,prismQuantities} from '../domain/prismGeometry';
// These diagnostics are independent editable references. The captured BOQ/BBS
// always retain the exported revision values, even after recalculation.
export function appendTaperedPrismSheets(wb:ExcelJS.Workbook,b:SnapshotBundle,members:Member[]){
 if(!members.some(m=>m.prismGeometry?.version===3))return;
 const input=wb.addWorksheet('Taper Inputs'),edges=wb.addWorksheet('Taper Edges'),check=wb.addWorksheet('Taper Check'),f=(formula:string,result:number)=>({formula,result});
 input.addRows([[`${b.project.code} · Changing-section inputs`],['DRAFT / NOT FOR CONSTRUCTION · End = start coordinate × scale + offset + datum anchor. Positive linear scales; one planar-sided run. Every hole uses the same scales. Editing diagnostics does not update captured BOQ/BBS or validate side planarity.'],['Member','Axis','Start mm','Axis advance mm','End scale U','End scale V','End offset U mm','End offset V mm','Start formed 1/0','End formed 1/0','Anchor U mm','Anchor V mm','Source / datum / version']]);
 edges.addRows([[`${b.project.code} · Changing-section edges`],['DRAFT / NOT FOR CONSTRUCTION · Each loop is captured in start-profile mm. Lateral faces must be planar. Side area = average parallel edge lengths × perpendicular separation. All surfaces remain available for cover regardless of formwork selection.'],['Member','Loop kind','Loop / reference','Point','U mm','V mm','Next U mm','Next V mm','Formed 1/0','Start edge mm','Area contribution mm²','Formed side area mm²']]);
 check.addRows([[`${b.project.code} · Prismoidal quantity check`],['DRAFT / NOT FOR CONSTRUCTION · Volume = axis advance / 6 × (Astart + 4Amid + Aend). Formwork uses selected planar side areas and actual end areas. Diagnostics do not change captured quantities. Policy: '+b.project.spec.concreteGeometryPolicy],['Member','Axis / profile axes','Start mm','Axis advance mm','Outer start mm²','Hole start mm²','Net start mm²','Net mid mm²','Net end mm²','Gross each m³','Gross form each m²','Member qty','Captured net each m³','Captured net form each m²','Captured total m³','Captured total form m²','Source / limitations']]);
 members.forEach((m,mi)=>{
  const p=m.prismGeometry;if(p?.version!==3)return;
  const q=b.calculations?.[m.id]||takeoff(m,b.project.spec),geo=prismQuantities(p),ir=input.rowCount+1,r=check.rowCount+1,from=edges.rowCount+1,ref=(col:string)=>`'Taper Inputs'!${col}${ir}`,anchor=prismAnchor(p);
  input.addRow([m.code,p.axis,p.start,p.depth,...p.endScale,...p.endOffset,...p.endFaces.map(Number),...anchor,`v3 · ${p.basis}`]);
  let hole=0;
  [p.profile,...p.holes].forEach((loop,k)=>{const sign=signedArea(loop.vertices)>0?1:-1;if(k)hole+=Math.abs(signedArea(loop.vertices));loop.vertices.forEach((a,i)=>{
   const c=loop.vertices[(i+1)%loop.vertices.length],er=edges.rowCount+1,length=Math.hypot(c[0]-a[0],c[1]-a[1]),du=`(G${er}-E${er})`,dv=`(H${er}-F${er})`,su=ref('E'),sv=ref('F'),u=`(E${er}*(${su}-1)+${ref('G')})`,v=`(F${er}*(${sv}-1)+${ref('H')})`,height=ref('D');
   const side=`I${er}*(J${er}+SQRT((${du}*${su})^2+(${dv}*${sv})^2))/2*SQRT(MAX(0,${u}^2+${v}^2+${height}^2-(${du}*${u}+${dv}*${v})^2/J${er}^2))`;
   edges.addRow([m.code,k?'Hole':'Outer',k?p.holes[k-1].label:'Outer profile',i+1,...a,...c,Number(loop.formed[i]),f(`SQRT(${du}^2+${dv}^2)`,length),f(`(E${er}*H${er}-F${er}*G${er})/2*${sign}`,(a[0]*c[1]-a[1]*c[0])/2*sign),f(side,prismSideArea(p,a,c)*Number(loop.formed[i]))]);
  });});
  const to=edges.rowCount,outer=Math.abs(signedArea(p.profile.vertices)),net=outer-hole,mid=net*(1+p.endScale[0])/2*(1+p.endScale[1])/2,end=net*p.endScale[0]*p.endScale[1],br=mi+4,sum=(kind:string)=>`SUMIFS('Taper Edges'!K${from}:K${to},'Taper Edges'!B${from}:B${to},"${kind}")`;
  check.addRow([m.code,p.axis+' / '+['X','Y','Z'].filter(a=>a!==p.axis).join('/'),f(ref('C'),p.start),f(ref('D'),p.depth),f(sum('Outer'),outer),f(sum('Hole'),hole),f(`E${r}-F${r}`,net),f(`G${r}*(1+${ref('E')})/2*(1+${ref('F')})/2`,mid),f(`G${r}*${ref('E')}*${ref('F')}`,end),f(`D${r}/6*(G${r}+4*H${r}+I${r})/1000000000`,geo.volume),f(`(SUM('Taper Edges'!L${from}:L${to})+G${r}*${ref('I')}+I${r}*${ref('J')})/1000000`,geo.formwork),f(`'BOQ'!C${br}`,q.quantity),f(`'BOQ'!D${br}`,q.concrete),f(`'BOQ'!E${br}`,q.formwork),f(`L${r}*M${r}`,q.quantity*q.concrete),f(`L${r}*N${r}`,q.quantity*q.formwork),`${p.basis} · One linear planar run. All holes scale with outer profile. No apex, curved run, mixed-context union or independently sized hole. Bar coordinates do not change automatically.`]);
 });
 for(const sheet of [input,edges,check]){
  const widths=sheet===input?[20,8,12,14,12,12,14,14,12,12,14,14,50]:sheet===edges?[20,10,25,8,13,13,13,13,10,15,18,20]:[20,14,11,13,16,16,16,16,16,13,13,9,13,13,13,13,45];
  widths.forEach((width,i)=>sheet.getColumn(i+1).width=width);sheet.views=[{state:'frozen',ySplit:3}];sheet.mergeCells(1,1,1,widths.length);sheet.mergeCells(2,1,2,widths.length);sheet.getRow(1).height=26;sheet.getRow(2).height=48;sheet.getRow(3).height=60;
  sheet.eachRow((row,i)=>{if(i>3)row.height=sheet===check?Math.max(60,14*Math.ceil(String(row.getCell(17).value).length/35)+12):sheet===input?Math.max(40,14*Math.ceil(String(row.getCell(13).value).length/40)+12):Math.max(23,13*Math.max(Math.ceil(String(row.getCell(3).value).length/20),Math.ceil(String(row.getCell(1).value).length/16))+8);row.eachCell(cell=>{cell.font={name:'Sarabun',size:10,color:{argb:i===3?'FFFFFFFF':'FF253A40'}};cell.alignment={vertical:'middle',wrapText:true};if(i===3)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203940'}};if(i>3&&(typeof cell.value==='number'||cell.value&&typeof cell.value==='object'))cell.numFmt='#,##0.000';});});
  sheet.autoFilter={from:{row:3,column:1},to:{row:sheet.rowCount,column:widths.length}};sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:3',printArea:`A1:${sheet===input?'M':sheet===edges?'L':'Q'}${sheet.rowCount}`};
 }
}
