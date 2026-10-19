import {sourceRowPage,sourcePagesLabel} from '../domain/sourceSchedule';
import {sourceComparisonQuantity} from '../domain/sourceQuantityBasis';
import type {SnapshotBundle} from '../domain/model';
import {compareSourceSchedule,sourceWeightComparisonText} from '../domain/sourceSchedule';
import {sourceRegionPlans,referenceText} from '../domain/sourceRegions';
import {frozenTakeoff,font,ordered,label} from './exports';
import {ownerFrame,ownerOutput,ownerSheets,withOwnerSheets} from './ownerDrawingPdf';
const fmt=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('en-US',{maximumFractionDigits:6});

// Supplemental evidence sheets: numerical policy and original schedule rows are
// unchanged. Register every added A3/A1 page before stamping the owner frames.
export async function appendSourceSchedulePdf(original:Blob,bundle:SnapshotBundle,size:'A4'|'A3'|'A1'){
 const members=ordered(bundle).filter(m=>m.sourceSchedule);if(!members.length)return original;
 const regions=sourceRegionPlans(bundle);
 const [{jsPDF},{default:autoTable},{PDFDocument}]=await Promise.all([import('jspdf'),import('jspdf-autotable'),import('pdf-lib')]);
 const doc=new jsPDF({orientation:size==='A4'?'portrait':'landscape',unit:'mm',format:size.toLowerCase(),compress:true});await font(doc);
 const w=size==='A4'?210:size==='A3'?420:841,h=size==='A4'?297:size==='A3'?297:594,bottom=size==='A4'?35:bundle.project.drawingProfile?90:70,per=size==='A4'?4:size==='A3'?6:15;let first=true;
 for(const m of members){const result=compareSourceSchedule(m,frozenTakeoff(m,bundle).rows,bundle.attachments,sourceComparisonQuantity(m,bundle))!;
  const next=(title:string)=>{if(!first)doc.addPage();first=false;doc.setDrawColor(35,60,66);doc.rect(10,10,w-20,h-20);doc.setFontSize(12);doc.setTextColor(32,57,64);doc.text('Source BBS comparison / DRAFT',15,21);doc.setFontSize(8);doc.text(`${bundle.project.code} / ${m.code} / ${title}`,15,29);const a=result.attachment;doc.text(doc.splitTextToSize(`${a?.name||'MISSING SOURCE'} / Rev ${a?.revision||'?'} / pages ${sourcePagesLabel(result.source)}`,w-30),15,36);doc.setFontSize(6.5);doc.text(doc.splitTextToSize('SHA256 '+result.source.sha256,w-30),15,49);doc.setFontSize(8);doc.text(`${result.source.basis==='perElement'?'Per 1 element':'All source-member occurrences'} / source member qty ${result.quantity} / selected ${result.selectedQuantity}`,15,61);
   if(size!=='A4')ownerFrame(doc,bundle,m,'Source BBS comparison',h-65);
   doc.setFontSize(7);doc.text('REFERENCE ONLY / NOT FOR CONSTRUCTION. No BOQ, cut, shape or approval adjustment.',15,h-bottom+(bundle.project.drawingProfile&&size!=='A4'?15:7));doc.text(label(bundle),15,h-bottom+(bundle.project.drawingProfile&&size!=='A4'?20:13));
  };
  next('Source / scope / review notes');
  autoTable(doc,{startY:70,margin:{left:15,right:15,bottom},head:[['Reference','Declared value / NOT approval']],body:[['Transcription / scope',result.source.note],['Source state',result.sourceProblems.join('\n')||'File identity/page consistent; source engineering review remains required'],['BBS coverage',result.extraBars.map(b=>b.mark).join(', ')||'No unmapped extra BBS rows'],['Comparison',result.coreMatched?'Mark / dia / grade / count / cut fields match. Shape, placement and engineering approval not verified.':'Unmapped/missing/different rows require review before Checked.'],['Printed source total kg',result.source.version===3?'Multiple page totals: see page register; no single printed overall total':fmt(result.source.statedTotalWeight)+' / transcribed row sum '+(result.sourceWeightComplete?fmt(result.sourceWeight):'MISSING ROW WEIGHTS')],['Weight basis','Weight differences are displayed without an invented tolerance. Missing source weights remain missing.'],['Units','mm / kg. Source table is user-entered reference, never an additional BOQ quantity.']],styles:{font:'Sarabun',fontStyle:'normal',fontSize:8,cellPadding:2},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},columnStyles:{0:{cellWidth:size==='A4'?40:80}},pageBreak:'avoid'});
  if(result.source.version===3){next('Source page table register');autoTable(doc,{startY:70,margin:{left:15,right:15,bottom},head:[['Page','Rows','Printed page Total kg','Transcribed row sum kg','Row sum - printed kg','Page reference']],body:result.pageWeights.map(t=>[t.page,t.rows,fmt(t.statedTotalWeight),t.weightComplete?fmt(t.rowWeight):'PENDING',fmt(t.difference),t.note]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:8,cellPadding:2},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},pageBreak:'avoid'});}
  for(let i=0;i<result.rows.length;i+=per){next(`Rows ${i+1}-${Math.min(i+per,result.rows.length)} / ${result.rows.length}`);const selected=result.rows.slice(i,i+per);
   autoTable(doc,{startY:70,margin:{left:15,right:15,bottom},head:[['Source → BBS Mark','Dia / grade\nsource → BBS','Count\nsource / BBS','Cut mm\nsource / BBS','Captured result / weight delta kg']],body:selected.map(r=>['p'+sourceRowPage(result.source,r.source)+' / '+r.source.mark+' → '+(r.bar?.mark||'UNMAPPED'),`${r.source.diameter} / ${r.source.grade}\n→ ${r.bar?`${r.bar.diameter} / ${r.bar.grade}`:'—'}`,`${r.source.count} / ${fmt(r.actualCount)}`,`${fmt(r.source.cutLength)} / ${fmt(r.bar?.cutLength)}`,r.status+(r.differences.length?' / '+r.differences.join(', '):'')+(r.weightDifference!==undefined?'\nBBS - source kg: '+fmt(r.weightDifference):'\n'+sourceWeightComparisonText(r,'en'))]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:size==='A4'?7:8,cellPadding:2,minCellHeight:13},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},columnStyles:size==='A4'?{0:{cellWidth:35},1:{cellWidth:38},2:{cellWidth:25},3:{cellWidth:28},4:{cellWidth:54}}:{},pageBreak:'avoid'});
  }
  const notes=result.rows.filter(r=>r.source.note);for(let i=0;i<notes.length;i+=3){next(`Row notes ${i+1}-${Math.min(i+3,notes.length)}`);autoTable(doc,{startY:70,margin:{left:15,right:15,bottom},head:[['Source Mark','Transcribed row note']],body:notes.slice(i,i+3).map(r=>[r.source.mark,r.source.note]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:8,cellPadding:2},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},columnStyles:{0:{cellWidth:size==='A4'?35:65}},pageBreak:'avoid'});}
  if(result.rows.some(r=>r.source.unitWeight!==undefined))for(let i=0;i<result.rows.length;i+=per){next(`Per-piece weight rows ${i+1}-${Math.min(i+per,result.rows.length)}`);autoTable(doc,{startY:70,margin:{left:15,right:15,bottom},head:[['Source / BBS Mark','kg/p source / BBS','BBS - source kg/p','Source count','Source kg/p x count','Source row kg / row - product kg']],body:result.rows.slice(i,i+per).map(r=>['p'+sourceRowPage(result.source,r.source)+' / '+r.source.mark+' / '+(r.bar?.mark||'UNMAPPED'),fmt(r.source.unitWeight)+' / '+fmt(r.actualUnitWeight),fmt(r.unitWeightDifference),r.source.count,fmt(r.sourceProductWeight),fmt(r.source.weight)+' / '+fmt(r.sourceRowProductDifference)]),styles:{font:'Sarabun',fontStyle:'normal',fontSize:size==='A4'?7:8,cellPadding:2,minCellHeight:13},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},columnStyles:size==='A4'?{0:{cellWidth:30},1:{cellWidth:32},2:{cellWidth:28},3:{cellWidth:20},4:{cellWidth:30},5:{cellWidth:40}}:{},pageBreak:'avoid'});doc.setFontSize(7);doc.text('Printed kg/p may be rounded. Differences are review data, not an accepted tolerance or BOQ input.',15,(doc as any).lastAutoTable.finalY+9,{maxWidth:w-30});}
 }
 if(regions.length){const {visitSourceRegions}=await import('./sourceRegionImages');
  await visitSourceRegions(regions,(p,image)=>{
   const m=p.member,b=m.bars.find(b=>b.id===p.row.barId),result=compareSourceSchedule(m,frozenTakeoff(m,bundle).rows,bundle.attachments,sourceComparisonQuantity(m,bundle))!;
   doc.addPage();doc.setDrawColor(35,60,66);doc.rect(10,10,w-20,h-20);doc.setTextColor(32,57,64);doc.setFontSize(12);doc.text('Original bending shape / REFERENCE ONLY',15,21);
   doc.setFontSize(8);doc.text(bundle.project.code+' / '+m.code+' / source Mark '+p.row.mark+' → BBS '+(b?.mark||'UNMAPPED'),15,29);
   doc.text(doc.splitTextToSize(p.attachment.name+' / Rev '+p.attachment.revision+' / shape page '+p.reference.page+' / table page '+sourceRowPage(result.source,p.row),w-30),15,36);
   doc.setFontSize(6.5);doc.text(doc.splitTextToSize(referenceText(p.reference),w-30),15,49);
   doc.setFontSize(8);doc.text('Source: dia '+p.row.diameter+' / '+p.row.grade+' / count '+p.row.count+' / cut '+p.row.cutLength+' mm',15,64);
   const box={x:20,y:80,w:w-40,h:h-bottom-140},scale=Math.min(box.w/image.width,box.h/image.height);
   doc.addImage(image.data,'PNG',box.x+(box.w-image.width*scale)/2,box.y+(box.h-image.height*scale)/2,image.width*scale,image.height*scale,undefined,'FAST');
   doc.setFontSize(7);doc.text(doc.splitTextToSize(result.sourceProblems.join(' / ')||'Original-file crop / NTS. Compare with the separately captured app BBS geometry; no shape approval inferred.',w-30),15,h-bottom-43);
   doc.text(b?'Mapped app bar '+b.mark+' / code '+b.shapeCode+'. Matching numeric fields do not confirm bending geometry or installation position.':'No reconstructed app bar. This reference image does not create steel quantities or a fabrication path.',15,h-bottom-27,{maxWidth:w-30});
   if(size!=='A4')ownerFrame(doc,bundle,m,'Original bending shape / '+p.row.mark,h-65);
   doc.text('REFERENCE ONLY / NOT FOR CONSTRUCTION. No BOQ, cut, shape or approval adjustment.',15,h-bottom+(bundle.project.drawingProfile&&size!=='A4'?15:7));doc.text(label(bundle),15,h-bottom+(bundle.project.drawingProfile&&size!=='A4'?20:13));
  });
 }
 const added=ownerOutput(doc),pdf=await PDFDocument.load(await original.arrayBuffer()),extra=await PDFDocument.load(await added.arrayBuffer()),offset=pdf.getPageCount();
 if(offset+extra.getPageCount()>500)throw Error('แบ่งชุดส่งออก: ตารางตรวจเทียบจากแบบรวมเกิน 500 หน้า');
 for(const page of await pdf.copyPages(extra,extra.getPageIndices()))pdf.addPage(page);
 const bytes=await pdf.save(),blob=new Blob([bytes as BlobPart],{type:'application/pdf'});return withOwnerSheets(blob,[...ownerSheets(original),...ownerSheets(added).map(s=>({...s,page:s.page+offset}))]);
}
