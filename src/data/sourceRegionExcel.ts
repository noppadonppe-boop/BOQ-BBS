import type ExcelJS from 'exceljs';
import type {SnapshotBundle} from '../domain/model';
import {sourceRegionPlans,referenceText} from '../domain/sourceRegions';

export async function appendSourceRegionSheet(wb:ExcelJS.Workbook,bundle:SnapshotBundle){
 const plans=sourceRegionPlans(bundle);if(!plans.length)return;
 const sheet=wb.addWorksheet('Source Shape References');
 sheet.addRows([[bundle.project.code+' · Source bending shape references'],['REFERENCE / NOT FOR CONSTRUCTION. Original-file crops use the visible rotated page. Images do not create bar paths, verify shape/placement or change BOQ/cut lengths. App BBS remains separately captured.'],['Member','Source Mark → BBS','Source file / revision','Source page / region / SHA256','Source row dia / grade / count / cut mm','App BBS identity / reference only','Original source bending shape']]);
 const {visitSourceRegions}=await import('./sourceRegionImages');
 await visitSourceRegions(plans,(p,image)=>{
  const b=p.member.bars.find(b=>b.id===p.row.barId),n=sheet.rowCount+1;
  sheet.addRow([p.member.code,p.row.mark+' → '+(b?.mark||'UNMAPPED'),p.attachment.name+' / Rev '+p.attachment.revision,referenceText(p.reference),p.row.diameter+' / '+p.row.grade+' / '+p.row.count+' / '+p.row.cutLength,b?b.mark+' / '+b.shapeCode+' / '+b.diameter+' / '+b.grade:'No reconstructed BBS geometry; source image is reference only',null]);
  const id=wb.addImage({base64:image.data,extension:'png'}),boxW=400,boxH=120,scale=Math.min(boxW/image.width,boxH/image.height);
  sheet.addImage(id,{tl:{col:6.08,row:n-1+.08},ext:{width:image.width*scale,height:image.height*scale},editAs:'oneCell'});
  sheet.getRow(n).height=130;
 });
 sheet.columns=[20,26,50,80,38,50,75].map(width=>({width}));
 sheet.mergeCells('A1:G1');sheet.mergeCells('A2:G2');sheet.getRow(1).height=30;sheet.getRow(2).height=60;sheet.getRow(3).height=45;
 sheet.views=[{state:'frozen',ySplit:3,showGridLines:false}];sheet.autoFilter='A3:G'+sheet.rowCount;
 sheet.eachRow((r,i)=>r.eachCell({includeEmpty:true},c=>{c.font={name:'Sarabun',size:i===1?15:11,bold:i===1||i===3,color:{argb:i===3?'FFFFFFFF':'FF203940'}};c.alignment={vertical:'middle',wrapText:true};if(i===3)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245E4D'}};else if(i>3&&i%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F6F3'}};}));
 sheet.pageSetup={paperSize:8 as ExcelJS.PaperSize,orientation:'landscape',fitToPage:true,fitToWidth:2,fitToHeight:0,printTitlesRow:'1:3',printArea:'A1:G'+sheet.rowCount};
}
