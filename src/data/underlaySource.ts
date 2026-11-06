import {getBlob,ref} from 'firebase/storage';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {storage} from './firebase';
import type {Attachment} from '../domain/model';
import {dxfDoc,entSegments,pdfDoc,type CadDoc,type PdfTextItem} from '../domain/cadEntities';

// S4a: slab-floor underlay sources read in the browser — DXF (dxf-parser) and PDF (pdf.js: page image + vector paths from the
// operator list) — as a background image placed in source coordinates plus the vector document for snap / import.
// Images (PNG / JPEG) are pictures only (source units = pixels, no snap). One cache entry per file + page.
export type UnderlaySource={doc?:CadDoc;image?:{href:string;box:[number,number,number,number]};pages:number;scanned:boolean;note?:string};
const RASTER=4096;
const cache=new Map<string,Promise<UnderlaySource>>();
export const underlayFileTypes=['application/pdf','image/vnd.dxf','image/png','image/jpeg'];
export const isUnderlayFile=(a:Attachment)=>underlayFileTypes.includes(a.contentType);
export function loadUnderlay(a:Attachment,page=1):Promise<UnderlaySource>{
 const key=`${a.id}:${a.version||1}:${page}`;let p=cache.get(key);
 if(!p){p=read(a,page);cache.set(key,p);p.catch(()=>cache.delete(key));}
 return p;
}
async function read(a:Attachment,page:number):Promise<UnderlaySource>{
 const blob=await getBlob(ref(storage,a.path));
 if(a.contentType==='image/vnd.dxf'){const {default:DxfParser}=await import('dxf-parser');const dxf=new DxfParser().parseSync(await blob.text());if(!dxf)throw Error('อ่านไฟล์ DXF ไม่ได้');
  const doc=dxfDoc(dxf);if(!doc.ents.length)throw Error('ไฟล์ DXF ไม่มีเส้นใน Model space');return {doc,image:rasterize(doc),pages:1,scanned:false};}
 if(a.contentType==='application/pdf'){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
  try{const n=Math.min(Math.max(1,page),pdf.numPages),p=await pdf.getPage(n),view=p.view as [number,number,number,number];
   const v1=p.getViewport({scale:1,rotation:0}),v=p.getViewport({scale:RASTER/Math.max(v1.width,v1.height),rotation:0}),c=document.createElement('canvas');c.width=Math.round(v.width);c.height=Math.round(v.height);
   const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);// print intent: no requestAnimationFrame, so a page in a background tab still renders (a static background picture)
   await p.render({canvasContext:ctx,canvas:c,viewport:v,intent:'print'}).promise;
   const cfg=await pdf.getOptionalContentConfig().catch(()=>null),texts=(await p.getTextContent()).items.filter((x:any)=>typeof x?.str==='string') as PdfTextItem[];
   const doc=pdfDoc(await p.getOperatorList(),pdfjs.OPS as unknown as Record<string,number>,view,{texts,ocName:(props:any)=>{const id=typeof props==='string'?props:props?.id;return id&&cfg?(cfg.getGroup(id)?.name||undefined):undefined;}}),scanned=doc.segCount<20;
   const href=await toUrl(c);return {doc:scanned?undefined:doc,image:{href,box:view},pages:pdf.numPages,scanned,...(p.rotate?{note:`หน้านี้หมุน ${p.rotate}° ในไฟล์ PDF: ภาพแสดงตามพิกัดหน้ากระดาษ (จัดแนว 2 จุดแก้การหมุน)`}:{})};}
  finally{await pdf.destroy();}
 }
 if(a.contentType==='image/png'||a.contentType==='image/jpeg'){const img=await createImageBitmap(blob),w=img.width,h=img.height;img.close();return {image:{href:URL.createObjectURL(blob),box:[0,0,w,h]},pages:1,scanned:true};}
 throw Error(`${a.name}: ใช้เป็นแบบพื้นหลังได้เฉพาะ PDF / DXF / PNG / JPEG (DWG: Save As DXF)`);
}
/** DXF lines / texts drawn on a canvas covering the drawing bounds (source units, y up). */
function rasterize(d:CadDoc):{href:string;box:[number,number,number,number]}{
 const [x0,y0,x1,y1]=d.bounds,W=Math.max(1e-9,x1-x0),H=Math.max(1e-9,y1-y0),k=RASTER/Math.max(W,H),pad=W*0.01;
 const box:[number,number,number,number]=[x0-pad,y0-pad,x1+pad,y1+pad],c=document.createElement('canvas');c.width=Math.ceil((box[2]-box[0])*k);c.height=Math.ceil((box[3]-box[1])*k);
 const ctx=c.getContext('2d')!,X=(x:number)=>(x-box[0])*k,Y=(y:number)=>(box[3]-y)*k;
 ctx.strokeStyle='#1f2937';ctx.lineWidth=1;ctx.beginPath();
 for(const e of d.ents){if(e.k==='text')continue;for(const s of entSegments(e,[])){ctx.moveTo(X(s[0]),Y(s[1]));ctx.lineTo(X(s[2]),Y(s[3]));}}ctx.stroke();
 ctx.fillStyle='#1f2937';for(const e of d.ents)if(e.k==='text'){const px=e.size*k;if(px<3)continue;ctx.save();ctx.translate(X(e.at[0]),Y(e.at[1]));ctx.rotate(-e.rot);ctx.font=`${px}px sans-serif`;ctx.fillText(e.text,0,0);ctx.restore();}
 return {href:c.toDataURL('image/png'),box};
}
async function toUrl(c:HTMLCanvasElement){const b=await new Promise<Blob|null>(r=>c.toBlob(r,'image/png'));return b?URL.createObjectURL(b):c.toDataURL('image/png');}
