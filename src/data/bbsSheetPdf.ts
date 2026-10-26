import type {SnapshotBundle} from '../domain/model';
import {sum} from '../domain/engine';
import {quantityBasisState} from '../domain/quantityBasis';
import {elementInputSchema} from '../domain/elementInput';
import {drawSheet,sheetFormat,sheetPageCount,type SheetData} from '../domain/bbsSheet';
import {drawPrims} from './primsPdf';
import {loadProjectLogo,type LoadedLogo} from './projectLogo';
import {font,frozenTakeoff,label,ordered} from './exports';

/** Sheet data for one member of a snapshot (shared by the PDF and the on-screen preview). */
export function snapshotSheetData(bundle:SnapshotBundle,m:SnapshotBundle['members'][number],logo?:LoadedLogo):SheetData{
 const q=frozenTakeoff(m,bundle),parsed=elementInputSchema.safeParse(m.elementInput);
 return {member:m,rows:q.rows,input:parsed.success?parsed.data:undefined,project:bundle.project,quantity:sum(m.occurrences.map(o=>o.quantity)),takeoff:q,
  status:label(bundle),revision:bundle.revisionNumber||'D'+bundle.version,date:(bundle.createdAt||new Date().toISOString()).slice(0,10),provisional:quantityBasisState(m)==='Provisional',logo};
}

/** BBS sheets (landscape, A3 or A2 per member: member override or project default) with the standard frame:
 * views left; BBS, BOQ and title block right. The export job size stays A3 (layout id sheet-a3-v10). */
export async function bbsSheetPdf(bundle:SnapshotBundle,size:'A3'|'A1'):Promise<Blob>{
 if(size!=='A3')throw Error('แบบ BBS + BOQ ใช้ขนาด A3');
 const {jsPDF}=await import('jspdf');
 const members=ordered(bundle),paper=(m:SnapshotBundle['members'][number])=>sheetFormat({project:bundle.project,member:m}).size.toLowerCase();
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:members.length?paper(members[0]):'a3'});await font(doc);
 if(!members.length){doc.setFontSize(14);doc.text('No members in selected scope',20,30);return doc.output('blob');}
 const logo=await loadProjectLogo(bundle.project).catch(()=>undefined);
 let first=true;
 for(const m of members){
  const data=snapshotSheetData(bundle,m,logo);
  for(let page=0;page<sheetPageCount(data);page++){if(!first)doc.addPage(paper(m),'landscape');first=false;drawPrims(doc,drawSheet(data,page));}
  if(doc.getNumberOfPages()>500)throw Error('แบ่งชุด: แบบ BBS เกิน 500 หน้า');
 }
 return doc.output('blob');
}
