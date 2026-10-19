import type {SnapshotBundle,ExportSize} from '../domain/model';
import {fabricationInputReview} from '../domain/fabricationInputReview';
import {font,label} from './exports';
import {ownerFrame,ownerOutput,stampOwnerDrawing} from './ownerDrawingPdf';

/** Official drawing/cutting artifacts retain raw values for review and visibly
 * identify a package whose quantity inputs have not been confirmed. */
export async function fabricationInputReviewPdf(blob:Blob,b:SnapshotBundle,size:ExportSize){
 const review=fabricationInputReview(b);if(review.complete)return blob;
 const [{PDFDocument,StandardFonts,rgb,degrees},{jsPDF},{default:autoTable}]=await Promise.all([import('pdf-lib'),import('jspdf'),import('jspdf-autotable')]);
 const source=await PDFDocument.load(await blob.arrayBuffer()),doc=new jsPDF({orientation:size==='A4'?'portrait':'landscape',unit:'mm',format:size.toLowerCase()});await font(doc);
 const w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight(),bottom=size==='A4'?30:80;
 autoTable(doc,{startY:68,margin:{left:15,right:15,top:68,bottom},head:[['Member','Input state','Preview member qty','Reference / required review']],body:review.rows.map(r=>[r.member.code,r.label,r.quantity,r.member.quantityBasis?.reference||'Legacy basis not recorded']),styles:{font:'Sarabun',fontStyle:'normal',fontSize:size==='A4'?8:9,cellPadding:3},headStyles:{fillColor:[32,57,64]},didDrawPage:()=>{doc.setFont('Sarabun','normal');doc.setTextColor(32,57,64);doc.setDrawColor(62,86,91);doc.rect(10,10,w-20,h-20);doc.setFontSize(12);doc.text('QUANTITY INPUT REVIEW / NOT FOR FABRICATION',15,21);doc.setFontSize(8);doc.text(doc.splitTextToSize(b.project.code+' / '+label(b),w-30),15,32);doc.text(doc.splitTextToSize('Package contains provisional dimension/member-count inputs. BBS and cutting figures are raw previews. Confirm current member inputs, bending geometry and engineering release before fabrication.',w-30),15,45);doc.text('Policy: '+review.policy,15,h-bottom+12);if(size!=='A4')ownerFrame(doc,b,undefined,'Quantity input review',h-65);if(doc.getNumberOfPages()+source.getPageCount()>500)throw Error('แบ่งชุด: หน้าตรวจปริมาณและแบบรวมเกิน500หน้า');}});
 let coverBlob=ownerOutput(doc);if(size!=='A4')coverBlob=await stampOwnerDrawing(coverBlob,b,size);const cover=await PDFDocument.load(await coverBlob.arrayBuffer()),output=await PDFDocument.create();
 for(const p of await output.copyPages(cover,cover.getPageIndices()))output.addPage(p);for(const p of await output.copyPages(source,source.getPageIndices()))output.addPage(p);
 const f=await output.embedFont(StandardFonts.HelveticaBold),message='PACKAGE HAS PROVISIONAL INPUTS';
 for(const page of output.getPages()){const {width,height}=page.getSize(),size=Math.min(42,width/21);page.drawText(message,{x:width*.10,y:height*.20,size,font:f,color:rgb(.6,.25,.08),opacity:.13,rotate:degrees(25),maxWidth:width*.9});page.drawText('RAW QUANTITY PREVIEW / NOT FOR FABRICATION',{x:15*72/25.4,y:6*72/25.4,size:7,font:f,color:rgb(.45,.22,.10)});}
 output.setTitle(b.project.code+' / Quantity input review / '+(b.revisionNumber||'Draft'));output.setCreator('FORM');const bytes=await output.save();if(bytes.byteLength>=50*1024*1024)throw Error('แบ่งชุด: PDF ตรวจปริมาณรวมเกิน50MiB');return new Blob([bytes.slice().buffer],{type:'application/pdf'});
}
