import type ExcelJS from 'exceljs';
import type {SnapshotBundle,Vec3} from '../domain/model';
import type {PrintBar} from './excelPrint';
import {arcGeometry,arcNormal} from '../domain/arcGeometry';
import {calculationEngine} from '../domain/version';

// Preserve existing BBS cells. Analytic input is separate from render samples;
// changing this reference worksheet never recalculates the Frozen BBS cut.
export function appendArcSheet(wb:ExcelJS.Workbook,bundle:SnapshotBundle,items:PrintBar[]){
 const rows=items.filter(i=>i.bar.shape==='arc'&&i.bar.curve);
 if(!rows.length)return;
 const sheet=wb.addWorksheet('Curve Geometry');
 sheet.addRows([[`${bundle.project.code} · Analytic arc parameters`],['DRAFT / NOT FOR CONSTRUCTION. A is centreline arc length, R is inside. Formula cells check geometry only; BBS retains the captured cut/quantity. Coordinates: target-local centre of first bar; add target origin for member coordinates.'],['Member','Mark','Shape','Inside R mm','Centreline R mm','Sweep deg','Analytic A mm','Cut used mm','Each','Total pcs','Local centre XYZ mm','Member centre XYZ mm','Unit U','Unit V','Repeat direction','Distribution from mm','Distribution to mm','Sagitta bound mm','Table5 limit mm','Supply instruction','Engine policy']]);
 rows.forEach(({bar:b,member:m,sourceRow},i)=>{
  const r=i+4,a=b.curve!,g=arcGeometry(b),first=b.paths[0]?.[0],placed=first?first.map((n,k)=>n-b.radius*a.u[k]) as Vec3:a.center;
  sheet.addRow([m.code,b.mark,b.shapeCode,b.radius-b.standard.outsideDiameter/2,b.radius,a.sweepDegrees,{formula:`E${r}*F${r}*PI()/180`,result:g.length},{formula:`'BBS'!I${sourceRow}`,result:b.cutLength},{formula:`'BBS'!G${sourceRow}`,result:b.count},{formula:`'BBS'!K${sourceRow}`,result:b.count*m.occurrences.reduce((n,o)=>n+o.quantity,0)},JSON.stringify(a.center),JSON.stringify(placed),JSON.stringify(a.u),JSON.stringify(a.v),JSON.stringify(arcNormal(a)),b.distributionStart,b.distributionEnd,g.sagitta,b.standard.arc?.supply.limit??'',b.standard.arc?.supply.method??'Pending',calculationEngine(bundle.project.spec)]);
 });
 sheet.columns=[20,16,10,18,20,20,21,18,12,14,32,32,26,26,26,22,22,24,24,44,44].map(width=>({width}));
 sheet.mergeCells('A1:U1');sheet.mergeCells('A2:U2');sheet.getRow(1).height=30;sheet.getRow(2).height=62;sheet.getRow(3).height=44;
 sheet.views=[{state:'frozen',ySplit:3,showGridLines:false}];
 sheet.eachRow((row,i)=>{if(i>3)row.height=44;row.eachCell(c=>{c.font={name:'Sarabun',size:i===1?15:11,bold:i===1||i===3,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={vertical:'middle',wrapText:true};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245E4D'}};});});
 for(const c of [4,5,6,7,8,16,17,18,19])sheet.getColumn(c).numFmt='0.000000';
 sheet.autoFilter='A3:U'+sheet.rowCount;
 sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:2,fitToHeight:0,printTitlesRow:'1:3',printArea:`A1:U${sheet.rowCount}`};
}
