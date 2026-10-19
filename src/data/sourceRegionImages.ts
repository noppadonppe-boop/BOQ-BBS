import {getBlob,ref} from 'firebase/storage';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {Attachment} from '../domain/model';
import {regionPixels,sourceShapeReferenceSchema,type SourceShapeReference,type SourceRegionPlan} from '../domain/sourceRegions';
import {storage,auth} from './firebase';
import {sha256} from './snapshots';
import type {NativeSourceTextPage} from '../domain/sourceTableIntake';
import {pdfHorizontalRules} from '../domain/pdfTableRules';

export const REGION_IMAGE_LIMITS={files:50,bytes:90*1024*1024,pixels:4096*4096,pages:300,imageBytes:30*1024*1024};
export type SourcePageImage={canvas:HTMLCanvasElement;pages:number};
// An operation-local reader verifies original bytes and owns its PDF workers.
// Nothing is uploaded, cached across accounts, or written into snapshots.
export class SourceRegionReader{
 private pdf?:PDFDocumentProxy;
 private blob?:Blob;
 private loading?:Promise<void>;
 private stopped=false;
 private uid=auth.currentUser?.uid;
 private cached?:{page:number;image:SourcePageImage};
 constructor(readonly attachment:Attachment){}
 private current(){if(this.stopped||!this.uid||auth.currentUser?.uid!==this.uid)throw Error('บัญชีเปลี่ยนแล้ว โหลดรูปต้นทางใหม่');}
 private async load(){
  this.current();if(this.loading)return this.loading;
  this.loading=(async()=>{
   const a=this.attachment;
   if(!a.sha256||!a.pageCount||!['application/pdf','image/png','image/jpeg'].includes(a.contentType)||a.size>REGION_IMAGE_LIMITS.bytes)throw Error('ไฟล์รูปต้นทางยังไม่มีตัวตน/จำนวนหน้าที่ตรวจแล้ว หรือเกินขนาดที่รองรับ');
   const blob=await getBlob(ref(storage,a.path));this.current();
   if(blob.size!==a.size||await sha256(await blob.arrayBuffer())!==a.sha256)throw Error('ไฟล์รูปต้นทาง checksum หรือขนาดไม่ตรงข้อมูลที่บันทึก');
   this.current();this.blob=blob;
   if(a.contentType==='application/pdf'){
    const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;this.current();
    const doc=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
    if(this.stopped||auth.currentUser?.uid!==this.uid){await doc.destroy();this.current();}
    if(doc.numPages!==a.pageCount){await doc.destroy();throw Error('จำนวนหน้ารูปต้นทางไม่ตรงไฟล์ที่บันทึก');}this.pdf=doc;
   }else if(a.pageCount!==1)throw Error('รูปภาพต้นทางมีหน้า 1 เท่านั้น');
  })();return this.loading;
 }
 async page(page:number):Promise<SourcePageImage>{
  await this.load();this.current();if(!Number.isInteger(page)||page<1||page>this.attachment.pageCount!)throw Error('หน้ารูปต้นทางไม่ถูกต้อง');
  if(this.cached?.page===page)return this.cached.image;
  const canvas=document.createElement('canvas');
  if(this.pdf){const p=await this.pdf.getPage(page),base=p.getViewport({scale:1}),v=p.getViewport({scale:Math.min(3,4096/Math.max(base.width,base.height))});this.current();canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);if(canvas.width*canvas.height>REGION_IMAGE_LIMITS.pixels)throw Error('ขนาดหน้ารูปต้นทางเกินที่รองรับ');await p.render({canvasContext:canvas.getContext('2d')!,canvas,viewport:v}).promise;}
  else{const url=URL.createObjectURL(this.blob!);try{const image=new Image();image.src=url;await image.decode();this.current();const scale=Math.min(1,4096/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.ceil(image.naturalWidth*scale));canvas.height=Math.max(1,Math.ceil(image.naturalHeight*scale));canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);}finally{URL.revokeObjectURL(url);}}
  this.current();const image={canvas,pages:this.attachment.pageCount!};this.cached={page,image};return image;
 }
 async textPage(page:number):Promise<NativeSourceTextPage>{
  await this.load();this.current();if(!this.pdf||!Number.isInteger(page)||page<1||page>this.attachment.pageCount!)throw Error('ใช้หน้าที่มี text layer ใน PDF ที่ตรวจแล้วเท่านั้น');
  const p=await this.pdf.getPage(page),v=p.getViewport({scale:1}),content=await p.getTextContent();this.current();
  let horizontalRules:ReturnType<typeof pdfHorizontalRules>=[];try{const pdfjs=await import('pdfjs-dist'),operators=await p.getOperatorList();this.current();horizontalRules=pdfHorizontalRules(operators,v.transform,pdfjs.OPS,pdfjs.version);}catch{this.current();}
  return {page,width:v.width,height:v.height,rotation:v.rotation,horizontalRules,items:content.items.filter(i=>'str' in i).map(i=>{if(!('str' in i))throw Error('ข้อความไม่ถูกต้อง');const at=v.convertToViewportPoint(i.transform[4],i.transform[5]),vx=v.transform[0]*i.transform[0]+v.transform[2]*i.transform[1],vy=v.transform[1]*i.transform[0]+v.transform[3]*i.transform[1];return {text:i.str,x:at[0],y:at[1],width:i.width,height:i.height,angle:Math.atan2(vy,vx)*180/Math.PI};})};
 }
 async crop(reference:SourceShapeReference){
  const r=sourceShapeReferenceSchema.parse(reference);if(r.sha256!==this.attachment.sha256)throw Error('รูปดัดต้นทางอ้างไฟล์คนละฉบับ');
  await this.load();this.current();
  const canvas=document.createElement('canvas');let box:{x:number;y:number;width:number;height:number};
  if(this.pdf){
   if(r.page>this.pdf.numPages)throw Error('หน้ารูปดัดต้นทางไม่ตรงไฟล์');
   const page=await this.pdf.getPage(r.page),base=page.getViewport({scale:1}),v=page.getViewport({scale:Math.min(10,1600/Math.max(base.width*r.rect.width,base.height*r.rect.height))});
   box=regionPixels(r,Math.ceil(v.width),Math.ceil(v.height));canvas.width=box.width;canvas.height=box.height;
   // Render the PDF region directly, retaining readable vector text without
   // allocating an entire page at the larger detail scale.
   await page.render({canvasContext:canvas.getContext('2d')!,canvas,viewport:v,transform:[1,0,0,1,-box.x,-box.y]}).promise;
  }else{const page=await this.page(r.page);box=regionPixels(r,page.canvas.width,page.canvas.height);canvas.width=box.width;canvas.height=box.height;canvas.getContext('2d')!.drawImage(page.canvas,box.x,box.y,box.width,box.height,0,0,box.width,box.height);}
  this.current();
  return {data:canvas.toDataURL('image/png'),width:box.width,height:box.height};
 }
 async close(){this.stopped=true;this.cached=undefined;this.blob=undefined;await this.pdf?.destroy();this.pdf=undefined;}
}
export async function visitSourceRegions(plans:SourceRegionPlan[],visit:(plan:SourceRegionPlan,image:{data:string;width:number;height:number})=>Promise<void>|void){
 const groups=new Map<string,SourceRegionPlan[]>();let imageBytes=0;
 for(const p of plans)groups.set(p.attachment.id,[...(groups.get(p.attachment.id)||[]),p]);
 for(const group of groups.values()){const reader=new SourceRegionReader(group[0].attachment);
  try{for(const plan of group){const image=await reader.crop(plan.reference);imageBytes+=Math.ceil((image.data.length-image.data.indexOf(',')-1)*3/4);if(imageBytes>REGION_IMAGE_LIMITS.imageBytes)throw Error('แบ่งชุดรูปดัดต้นทาง: ภาพที่ส่งออกเกิน 30 MiB');await visit(plan,image);}}
  finally{await reader.close();}
 }
}
