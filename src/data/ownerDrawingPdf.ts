import {quantityBasisState} from '../domain/quantityBasis';
import {publicationLabel} from '../domain/publication';
import {drawingLabels} from '../domain/drawingStandard';
import type {jsPDF as Pdf} from 'jspdf';
import type {Member,SnapshotBundle} from '../domain/model';
import {font} from './exports';
export type OwnerSheet={page:number;memberId?:string;title:string;frameTop:number};
const recorded=new WeakMap<Pdf,Map<number,OwnerSheet>>(),blobs=new WeakMap<Blob,OwnerSheet[]>();
export function ownerFrame(doc:Pdf,b:SnapshotBundle,m:Member|undefined,title:string,frameTop:number){if(!b.project.drawingProfile)return false;let pages=recorded.get(doc);if(!pages){pages=new Map();recorded.set(doc,pages);}const page=doc.getCurrentPageInfo().pageNumber;pages.set(page,{page,memberId:m?.id,title,frameTop});return true;}
export function ownerSheets(blob:Blob){return blobs.get(blob)||[];}
export function withOwnerSheets(blob:Blob,sheets:OwnerSheet[]){if(sheets.length)blobs.set(blob,sheets);return blob;}
export function ownerOutput(doc:Pdf){return withOwnerSheets(doc.output('blob'),[...(recorded.get(doc)?.values()||[])]);}
function fit(doc:Pdf,text:string,x:number,y:number,width:number,height:number){for(let size=8.5;size>=7;size-=.25){doc.setFontSize(size);const lines=doc.splitTextToSize(text,width);if(lines.length*size*25.4/72*1.12<=height){doc.text(lines,x,y,{lineHeightFactor:1.12});return;}}throw Error('ข้อความยาวเกินกรอบชื่อแบบ: ย่อข้อความแสดงบนกรอบในตั้งค่าโครงการ / ข้อมูลเต็มยังอยู่ในโครงการ');}
function frame(doc:Pdf,b:SnapshotBundle,s:OwnerSheet,index:number,total:number,size:'A3'|'A1'){
 const p=b.project.drawingProfile!,m=b.members.find(m=>m.id===s.memberId),w=size==='A3'?420:841,h=size==='A3'?297:594,top=s.frameTop,height=h-10-top,width=w-20,columns=[.34,.26,.25,.15],x=[10,10+width*.34,10+width*.60,10+width*.85];
 const labels=drawingLabels(p.language);
 const setup=m?.drawingSetup,number=setup?.number||p.indexNumber,revision=setup?.revision||p.indexRevision,title=setup?.title||s.title;
 const texts=[`${p.company||'—'}\n${p.projectName}\n${labels.owner}: ${p.owner||'—'}\n${labels.site}: ${p.location||'—'}`,`${labels.title}: ${title}\n${labels.contract}: ${p.contract||'—'}\n${labels.discipline}: ${p.discipline||'—'}`,`${labels.number}: ${number}\n${labels.rev}: ${revision}\n${labels.by}: ${p.preparedBy||'—'}\n${labels.check}: ${p.checkedBy||'—'}`,`${labels.sheet}: ${index}/${total} · ${size}\nNTS / mm\n${m?`${labels.qty}: ${quantityBasisState(m)==='Provisional'?'PENDING / preview ':''}${m.occurrences.reduce((n,o)=>n+o.quantity,0)}`:s.title}\n${b.revisionNumber||'D'+b.version}\n${(b.status==='Issued'||b.status==='Superseded'?publicationLabel(b):'DRAFT / NOT FOR CONSTRUCTION').replace(" / "," /\n")}`];
 doc.setFont('Sarabun','normal');doc.setDrawColor(34,59,66);doc.setTextColor(34,59,66);doc.setLineWidth(.25);doc.rect(10,top,width,height);for(let i=1;i<4;i++)doc.line(x[i],top,x[i],h-10);
 texts.forEach((text,i)=>fit(doc,text,x[i]+3,top+4,width*columns[i]-6,height-7));
}
export async function stampOwnerDrawing(blob:Blob,b:SnapshotBundle,size:'A3'|'A1'){
 if(!b.project.drawingProfile)return blob;const sheets=ownerSheets(blob),[{PDFDocument,rgb},{jsPDF}]=await Promise.all([import('pdf-lib'),import('jspdf')]),pdf=await PDFDocument.load(await blob.arrayBuffer());
 if(sheets.length!==pdf.getPageCount()||new Set(sheets.map(s=>s.page)).size!==sheets.length)throw Error('ทะเบียนแผ่นแบบไม่ครบ ก่อนจัดกรอบมาตรฐาน');
 const counts=new Map<string,number>(),current=new Map<string,number>();for(const s of sheets)counts.set(s.memberId||'',(counts.get(s.memberId||'')||0)+1);
 for(const s of sheets){const key=s.memberId||'',index=(current.get(key)||0)+1;current.set(key,index);const overlay=new jsPDF({orientation:'landscape',unit:'mm',format:size.toLowerCase()});await font(overlay);frame(overlay,b,s,index,counts.get(key)!,size);const layer=await PDFDocument.load(overlay.output('arraybuffer')),embedded=await pdf.embedPage(layer.getPage(0)),page=pdf.getPage(s.page-1),w=page.getWidth(),pt=72/25.4;page.drawRectangle({x:10*pt,y:10*pt,width:w-20*pt,height:(page.getHeight()/pt-10-s.frameTop)*pt,color:rgb(1,1,1)});page.drawPage(embedded);}
 const bytes=await pdf.save();return withOwnerSheets(new Blob([bytes.slice().buffer],{type:'application/pdf'}),sheets);
}
