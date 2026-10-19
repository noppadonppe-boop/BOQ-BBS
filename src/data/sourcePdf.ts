import {ownerFrame,ownerOutput,ownerSheets,withOwnerSheets,OwnerSheet} from './ownerDrawingPdf';
import {PDFDocument,PDFName,degrees} from 'pdf-lib';
import type {PDFPage,PDFEmbeddedPage,PDFImage} from 'pdf-lib';
import {getBlob,ref} from 'firebase/storage';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {sourceSheets,sourceFit,sourceCallouts,assertSourceCalloutSpacing,SOURCE_LIMITS} from '../domain/sourceDrawings';
import {sourceReconciliation} from '../domain/sourceRevisions';
import type {SourceSheet} from '../domain/sourceDrawings';
import type {SnapshotBundle} from '../domain/model';
import {storage} from './firebase';
import {sha256} from './snapshots';
import {drawingPdf,font,label,ordered,frozenTakeoff} from './exports';
import {readablePdfInput} from './documentInspection';

const PT=72/25.4;
type Prepared={hash:string;bytes:Uint8Array;pdf?:PDFDocument;rasterReason?:string;image?:PDFImage};
type Embedded={page?:PDFEmbeddedPage;image?:PDFImage;width:number;height:number;rotation:number;mode:string};

// Keep original sources immutable. PDF content is embedded as a Form XObject;
// visible annotations/layers use the same renderer as FilePanel instead of being lost.
export async function sourcePdf(bundle:SnapshotBundle,size:'A3'|'A1',progress:(message:string)=>void=()=>{}):Promise<Blob>{
 const sheets=sourceSheets(bundle,size),output=await PDFDocument.create(),prepared=new Map<string,Prepared>(),embedded=new Map<string,Embedded>();
 const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const w=size==='A3'?420:841,h=size==='A3'?297:594;
 const createOverlay=async()=>{const d=new jsPDF({orientation:'landscape',unit:'mm',format:size.toLowerCase()});await font(d);return d;};
 const ownerRecords:OwnerSheet[]=[];const append=async(bytes:ArrayBuffer,records:OwnerSheet[]=[])=>{const offset=output.getPageCount();ownerRecords.push(...records.map(s=>({...s,page:s.page+offset})));const p=await PDFDocument.load(bytes);for(const page of await output.copyPages(p,p.getPageIndices()))output.addPage(page);};
 progress('BBS base');const base=await drawingPdf(bundle,size,'schedule-v1',false);await append(await base.arrayBuffer(),ownerSheets(base));

 async function prepare(sheet:SourceSheet){
  let p=prepared.get(sheet.attachment.id);if(p)return p;
  progress('Load source '+sheet.attachment.name);
  const a=sheet.attachment,blob=await getBlob(ref(storage,a.path));
  if(blob.size!==a.size)throw Error(`${a.name}: ขนาดไฟล์ต้นทางไม่ตรง snapshot`);
  const buffer=await blob.arrayBuffer(),hash=await sha256(buffer);
  if(a.sha256&&hash!==a.sha256)throw Error(`${a.name}: checksum ของแบบต้นทางไม่ตรง snapshot`);
  p={bytes:new Uint8Array(buffer),hash};
  if(a.contentType==='application/pdf'){
   let input:Awaited<ReturnType<typeof readablePdfInput>>;
   try{input=await readablePdfInput(buffer);}catch(error){throw Error(`${a.name}: ${error instanceof Error?error.message:'เปิดอ่าน PDF ไม่สำเร็จ'}`);}
   if(a.pageCount&&a.pageCount!==input.pageCount)throw Error(`${a.name}: จำนวนหน้าไฟล์ไม่ตรง snapshot`);
   if(sheet.page>input.pageCount)throw Error(`${a.name}: ไม่มีหน้า ${sheet.page}; แก้จุดชี้ก่อนส่งออก`);
   p.pdf=input.pdf;
   if(!p.pdf)p.rasterReason='viewer-readable protected or renderer-only PDF';
   else if(p.pdf.catalog.has(PDFName.of('OCProperties')))p.rasterReason='PDF layers rendered';
  }
  prepared.set(a.id,p);return p;
 }

 async function rasterPdf(sheet:SourceSheet,p:Prepared){
  progress('Raster reference '+sheet.attachment.name+' p'+sheet.page);
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const task=pdfjs.getDocument({data:p.bytes.slice(),password:''});let source:any;
  try{
   source=await task.promise;if(sheet.page>source.numPages)throw Error(`${sheet.attachment.name}: ไม่มีหน้า ${sheet.page}`);
   const page=await source.getPage(sheet.page),v=page.getViewport({scale:1}),panel=size==='A3'?112:200,fit=sourceFit(v.width,v.height,0,{x:18,y:69,w:w-46-panel,h:h-135}),scale=Math.min(fit.scale*200/25.4,Math.sqrt(16e6/(v.width*v.height)));
   const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvas,canvasContext:canvas.getContext('2d')!,viewport}).promise;
   const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('สร้างภาพต้นทางไม่สำเร็จ')),'image/png'));
   canvas.width=canvas.height=1;const image=await output.embedPng(await png.arrayBuffer());await image.embed();
   return {image,width:v.width,height:v.height,rotation:0,mode:`Raster PDF reference / ${p.rasterReason||'visible PDF annotations'}`} satisfies Embedded;
  }finally{await (source?.destroy()||task.destroy());}
 }

 async function embed(sheet:SourceSheet,p:Prepared):Promise<Embedded>{
  const key=sheet.attachment.id+'/'+sheet.page,previous=embedded.get(key);if(previous)return previous;
  progress('Embed source '+sheet.attachment.name+' p'+sheet.page);
  let e:Embedded;
  if(sheet.attachment.contentType==='application/pdf'&&!p.pdf)e=await rasterPdf(sheet,p);
  else if(p.pdf){
   if(sheet.page>p.pdf.getPageCount())throw Error(`${sheet.attachment.name}: ไม่มีหน้า ${sheet.page}; แก้จุดชี้ก่อนส่งออก`);
   const original=p.pdf.getPage(sheet.page-1);
   if(p.rasterReason||(original.node.Annots()?.size()||0)>0)e=await rasterPdf(sheet,p);
   else{
    // PDF.js displays the intersection of MediaBox and CropBox, then /Rotate.
    const crop=original.getCropBox(),media=original.getMediaBox(),left=Math.max(crop.x,media.x),bottom=Math.max(crop.y,media.y),right=Math.min(crop.x+crop.width,media.x+media.width),top=Math.min(crop.y+crop.height,media.y+media.height);
    const width=right-left,height=top-bottom,rotation=original.getRotation().angle;
    sourceFit(width,height,rotation,{x:0,y:0,w:1,h:1});
    const page=original.node.Contents()?await output.embedPage(original,{left,bottom,right,top}):undefined;
    e={page,width,height,rotation,mode:'Vector PDF content / visible CropBox'};
   }
  }else{
   const type=sheet.attachment.contentType,probe=type==='image/png'&&p.bytes.length>=24?{width:new DataView(p.bytes.buffer,p.bytes.byteOffset,p.bytes.byteLength).getUint32(16),height:new DataView(p.bytes.buffer,p.bytes.byteOffset,p.bytes.byteLength).getUint32(20)}:await (await PDFDocument.create()).embedJpg(p.bytes);
   if(probe.width*probe.height>25e6)throw Error(`${sheet.attachment.name}: รูปภาพเกิน 25 ล้านพิกเซล ให้ลดขนาดก่อนส่งออก`);
   // Normalize EXIF orientation with the browser renderer used in FilePanel.
   const url=URL.createObjectURL(new Blob([p.bytes.slice().buffer],{type})),img=new Image();
   try{img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d')!.drawImage(img,0,0);
    const png=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('อ่านภาพต้นทางไม่สำเร็จ')),'image/png'));
    const width=c.width,height=c.height;c.width=c.height=1;const image=await output.embedPng(await png.arrayBuffer());await image.embed();
    e={image,width,height,rotation:0,mode:'Raster image reference / browser orientation'};
   }finally{URL.revokeObjectURL(url);}
  }
  embedded.set(key,e);return e;
 }

 // Check every selected file/page before producing any published artifact.
 for(const sheet of sheets){const p=await prepare(sheet);await embed(sheet,p);}
 progress('Source index');const index=await createOverlay();
 const references=(memberId:string,mark:string)=>sheets.flatMap(s=>s.member.id===memberId?s.anchors.filter(a=>a.mark===mark).map(a=>`${s.reference}/p${s.page}/#${String(a.number).padStart(3,'0')}`):[]);
 autoTable(index,{startY:42,margin:{left:18,right:18,top:42,bottom:bundle.project.drawingProfile?60:25},head:[['Member','Mark / diameter / grade','Total pcs / cut mm','Source callout references']],body:ordered(bundle).flatMap(m=>frozenTakeoff(m,bundle).rows.flatMap(b=>{
  const refs=references(m.id,b.mark);if(!refs.length)return [[m.code,`${b.mark} / ${b.diameter} / ${b.grade}`,`${b.count*frozenTakeoff(m,bundle).quantity} / ${b.cutLength}`,'UNMAPPED / ยังไม่มีจุดชี้บนแบบต้นทาง']];
  return Array.from({length:Math.ceil(refs.length/12)},(_,i)=>[i?'':m.code,i?'continued':`${b.mark} / ${b.diameter} / ${b.grade}`,i?'':`${b.count*frozenTakeoff(m,bundle).quantity} / ${b.cutLength}`,refs.slice(i*12,(i+1)*12).join(' · ')]);
 })),styles:{font:'Sarabun',fontStyle:'normal',fontSize:9,cellPadding:2},headStyles:{fillColor:[32,57,64],fontStyle:'normal'},didDrawPage:()=>{if(bundle.project.drawingProfile){index.setDrawColor(34,59,66);index.setLineWidth(.25);index.rect(10,10,w-20,h-20);}index.setFont('Sarabun','normal');index.setFontSize(14);index.text('SOURCE MARK INDEX / ดัชนีจุดชี้บนแบบต้นทาง',18,22);index.setFontSize(8);index.text(`${bundle.project.code} / ${label(bundle)} / source-v9`,18,32);index.text('Callouts are source references, not extra bar quantities. UNMAPPED marks require source placement review.',18,h-(bundle.project.drawingProfile?48:15));ownerFrame(index,bundle,undefined,'Source Mark index',h-43);}});
 const indexBlob=ownerOutput(index);await append(await indexBlob.arrayBuffer(),ownerSheets(indexBlob));

 for(const [i,sheet] of sheets.entries()){
  progress('Source sheet '+(i+1)+'/'+sheets.length);
  const p=prepared.get(sheet.attachment.id)!,e=embedded.get(sheet.attachment.id+'/'+sheet.page)!,overlay=await createOverlay();
  const panel=size==='A3'?112:200,box={x:18,y:69,w:w-46-panel,h:h-135},fit=sourceFit(e.width,e.height,e.rotation,box);
  const calls=sourceCallouts(sheet.anchors,fit,box),q=frozenTakeoff(sheet.member,bundle),tableX=w-18-panel;
  assertSourceCalloutSpacing(calls);
  overlay.setDrawColor(46,69,74);overlay.setLineWidth(.4);overlay.rect(10,10,w-20,h-20);
  overlay.setTextColor(34,59,66);overlay.setFontSize(15);overlay.text(`${sheet.member.code} / ${sheet.reference} / SOURCE PLAN & DETAIL`,18,23);
  overlay.setFontSize(8);overlay.text(`${label(bundle)} / page ${sheet.page} / part ${sheet.part+1}/${sheet.parts} / NTS`,18,32);
  overlay.text(overlay.splitTextToSize(`${sheet.attachment.name} / Source rev ${sheet.attachment.revision}`,w-36),18,40);
  if(sheet.attachment.sourceAdoption){const a=sheet.attachment.sourceAdoption;overlay.setFontSize(7);overlay.text(`Legacy source adopted / prior rev ${a.previousRevision||'none'} / ${a.previousSha256?'prior hash verified':'hash first recorded at adoption'} / Draft references ${sourceReconciliation(sheet.attachment,sheet.member.bars,bundle.attachments).reviewed?'reviewed':'PENDING'} / UNVERIFIED installation`,18,51);}
  if(sheet.attachment.sourceRevision){overlay.setFontSize(7);overlay.text(`Replaces source rev ${sheet.attachment.sourceRevision.previousRevision} / Mark reconciliation: ${sourceReconciliation(sheet.attachment,sheet.member.bars,bundle.attachments).reviewed?'reviewed Draft references':'PENDING'} / UNVERIFIED installation`,18,51);}
  overlay.setDrawColor(195,204,205);overlay.rect(fit.x,fit.y,fit.w,fit.h);
  overlay.setDrawColor(181,93,18);overlay.setTextColor(137,63,9);overlay.setLineWidth(.3);
  for(const a of calls){
   overlay.circle(a.target.x,a.target.y,.8,'S');overlay.line(a.target.x,a.target.y,a.label.x,a.label.y);
   overlay.setFillColor(255,250,235);overlay.circle(a.label.x,a.label.y,3.1,'FD');overlay.setFontSize(6);overlay.text(a.numberText,a.label.x,a.label.y+.7,{align:'center'});
  }
  overlay.setTextColor(34,59,66);overlay.setFontSize(10);overlay.text('SOURCE CALLOUT / MARK',tableX,65);
  for(const [row,a] of sheet.anchors.entries()){
   const at=73+row*(size==='A3'?11:15),bar=q.rows.find(b=>b.id===a.bar.id)!;
   overlay.setFontSize(8);overlay.text(`#${String(a.number).padStart(3,'0')}  ${a.mark}`,tableX,at);
   overlay.setFontSize(7);overlay.text(overlay.splitTextToSize(`D${bar.diameter} / ${bar.grade} / ${bar.count*q.quantity} pcs / cut ${bar.cutLength} mm`,panel),tableX,at+3.7);
   overlay.setDrawColor(217,224,223);overlay.line(tableX,at+9.4,tableX+panel,at+9.4);
  }
  overlay.setFontSize(7);overlay.setTextColor(124,69,18);
  overlay.text('Source pointers are user placed / UNVERIFIED. Verify plan/section locations before installation.',18,h-61);
  overlay.text(`${e.mode}${e.image?' / '+Math.round(e.image.width/(fit.w/25.4))+' effective dpi':''} / fitted to sheet, original scale does not apply / NOT FOR CONSTRUCTION`,18,h-57);
  overlay.setTextColor(40,59,65);overlay.setFontSize(7);overlay.text(`Source SHA256: ${p.hash}`,18,h-52);
  overlay.text(p.hash===sheet.attachment.sha256?'Source bytes verified against saved attachment hash.':'Legacy source: hash recorded at export; no saved attachment hash.',18,h-48);
  const ty=h-43;if(!ownerFrame(overlay,bundle,sheet.member,'Source plan and details',ty)){overlay.rect(10,ty,w-20,33);overlay.line(w*.47,ty,w*.47,h-10);overlay.line(w*.77,ty,w*.77,h-10);
  overlay.text(overlay.splitTextToSize(`${bundle.project.titleBlock.company||bundle.project.owner}\n${bundle.project.name}\n${bundle.project.location}`,w*.45-20),18,ty+6);
  overlay.text(overlay.splitTextToSize(`Drawing: ${bundle.project.titleBlock.drawingPrefix}-${sheet.member.code}-${sheet.reference}-P${sheet.page}-${sheet.part+1}\nBy: ${bundle.project.titleBlock.drawnBy} / Check: ${bundle.project.titleBlock.checkedBy}\nRev: ${bundle.revisionNumber||'D'+bundle.version}`,w*.28),w*.47+7,ty+6);
  overlay.text(`Source sheet ${i+1}/${sheets.length} / ${size}\nMember qty: ${q.quantity}\nDraft / source positions pending`,w*.77+7,ty+6);}
  const dest=output.addPage([w*PT,h*PT]);if(bundle.project.drawingProfile)ownerRecords.push({page:output.getPageCount(),memberId:sheet.member.id,title:'Source plan and details',frameTop:ty});
  drawSource(dest,e,fit,h);
  const overlayDocument=await PDFDocument.load(overlay.output('arraybuffer')),layer=await output.embedPage(overlayDocument.getPage(0));dest.drawPage(layer);
 }
 if(output.getPageCount()>SOURCE_LIMITS.packagePages)throw Error('แบ่งชุดส่งงาน: BBS และแบบต้นทางรวมเกิน 500 หน้า');
 output.setTitle(`${bundle.project.code} / BBS with source Mark references / ${bundle.revisionNumber||'Draft'}`);output.setCreator('FORM');
 progress('Save PDF');const bytes=await output.save();if(bytes.byteLength>=50*1024*1024)throw Error('แบ่งชุดส่งงาน: PDF รวมเกิน 50 MB');progress('Complete');
 return withOwnerSheets(new Blob([bytes.slice().buffer],{type:'application/pdf'}),ownerRecords);
}

function drawSource(page:PDFPage,e:Embedded,fit:ReturnType<typeof sourceFit>,height:number){
 const x=fit.x*PT,y=(height-fit.y-fit.h)*PT,s=fit.scale*PT;
 if(e.image){page.drawImage(e.image,{x,y,width:fit.w*PT,height:fit.h*PT});return;}
 if(!e.page)return;
 const offsets:{[angle:number]:[number,number]}={0:[0,0],90:[0,e.width*s],180:[e.width*s,e.height*s],270:[e.height*s,0]};
 const [dx,dy]=offsets[fit.angle];page.drawPage(e.page,{x:x+dx,y:y+dy,xScale:s,yScale:s,rotate:degrees(-fit.angle)});
}
