import {getBlob,ref} from 'firebase/storage';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {storage} from './firebase';
import type {Attachment} from '../domain/model';

// Zoomed views of a drawing sheet for the AI shape reader: one overview plus a 3 × 2 grid of overlapping tiles.
// An A1 sheet sent as one page image is downscaled by the AI providers until dimension text is unreadable.
export type DrawingView={label:string;mimeType:'image/jpeg';data:string};
const MASTER=4800,OVERVIEW=1600,COLS=3,ROWS=2,OVERLAP=.08,QUALITY=.82,MAX_BYTES=4.5*1024*1024;

/** Page canvases of a PDF (selected 1-based pages, default the first) or the image itself. */
async function masterCanvases(a:Attachment,pages:number[]=[1],size=MASTER):Promise<{page:number;canvas:HTMLCanvasElement}[]>{
 const blob=await getBlob(ref(storage,a.path)),out:{page:number;canvas:HTMLCanvasElement}[]=[];
 if(a.contentType==='application/pdf'){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const doc=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
  try{for(const n of [...new Set(pages)].filter(n=>n>=1&&n<=doc.numPages)){
   const p=await doc.getPage(n),v1=p.getViewport({scale:1}),v=p.getViewport({scale:size/Math.max(v1.width,v1.height)}),c=document.createElement('canvas'),ctx=c.getContext('2d')!;
   c.width=Math.round(v.width);c.height=Math.round(v.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
   await p.render({canvasContext:ctx,canvas:c,viewport:v}).promise;out.push({page:n,canvas:c});}}finally{await doc.destroy();}
 }else{const img=await createImageBitmap(blob),c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d')!.drawImage(img,0,0);img.close();out.push({page:1,canvas:c});}
 return out;
}
const masterCanvas=async(a:Attachment)=>(await masterCanvases(a))[0].canvas;
async function jpeg(src:HTMLCanvasElement,sx:number,sy:number,sw:number,sh:number,long:number):Promise<string>{
 let k=Math.min(1,long/Math.max(sw,sh));
 for(let i=0;i<4;i++){
  const c=document.createElement('canvas');c.width=Math.round(sw*k);c.height=Math.round(sh*k);
  const ctx=c.getContext('2d')!;ctx.imageSmoothingQuality='high';ctx.drawImage(src,sx,sy,sw,sh,0,0,c.width,c.height);
  const data=c.toDataURL('image/jpeg',QUALITY).split(',')[1];
  if(data.length*.75<=MAX_BYTES)return data;k*=.8;
 }
 throw Error('ภาพขยายของแบบใหญ่เกินกำหนด');
}
/** Overview + tiles of page 1 (PDF) or of the image, as base64 JPEG for the gateway. */
export async function drawingViews(a:Attachment):Promise<DrawingView[]>{return tiles(await masterCanvas(a),a.name);}
/** Views (and for DXF / IFC an exact text summary) of one source file for the AI shape reader. DWG has no reader: Save As DXF. */
/** `pages`: PDF pages of the element (from the inventory) · `overview`: one view per page (inventory of the whole file). */
export async function prepareDrawing(a:Attachment,focus:string[]=[],o:{pages?:number[];overview?:boolean}={}):Promise<{views:DrawingView[];text?:string}>{
 if(a.contentType==='image/vnd.dwg')throw Error(`${a.name}: ระบบยังอ่าน DWG ไม่ได้ · ใน AutoCAD ใช้ Save As → DXF (AutoCAD 2018 DXF) แล้วอัปโหลดไฟล์ DXF`);
 if(a.contentType==='image/vnd.dxf'||a.contentType==='application/x-step'){
  const {dxfDrawing,ifcDrawing}=await import('./cadDrawings'),blob=await getBlob(ref(storage,a.path));
  const d=a.contentType==='image/vnd.dxf'?await dxfDrawing(blob,{focus}):await ifcDrawing(blob);
  const views=[...(d.canvas?await tiles(d.canvas,a.name):[]),...(d.views||[]).map(v=>({...v,mimeType:'image/jpeg' as const}))];
  return {views:views.slice(0,8),text:d.text};
 }
 if(a.contentType==='application/pdf'&&(o.overview||(o.pages?.length||0)>1)){
  // several pages: one readable view per page (8 views max), whole file for the inventory
  const pages=o.overview?Array.from({length:Math.min(8,a.pageCount||8)},(_,i)=>i+1):o.pages!.slice(0,8);
  const list=await masterCanvases(a,pages,2400).catch(()=>[]);
  return {views:await Promise.all(list.map(async x=>({label:`หน้า ${x.page} · ${a.name}`,mimeType:'image/jpeg' as const,data:await jpeg(x.canvas,0,0,x.canvas.width,x.canvas.height,2000)})))};
 }
 if(o.pages?.length===1){const list=await masterCanvases(a,o.pages).catch(()=>[]);if(list.length)return {views:await tiles(list[0].canvas,`${a.name} · หน้า ${list[0].page}`)};}
 return {views:await drawingViews(a).catch(()=>[])};
}
async function tiles(c:HTMLCanvasElement,name:string):Promise<DrawingView[]>{
 const W=c.width,H=c.height,landscape=W>=H,cols=landscape?COLS:ROWS,rows=landscape?ROWS:COLS;
 const tw=W/cols,th=H/rows,ox=tw*OVERLAP,oy=th*OVERLAP,rowName=['บน','กลาง','ล่าง'],colName=['ซ้าย','กลาง','ขวา'];
 const out:DrawingView[]=[{label:`ภาพรวมทั้งแผ่น · ${name}`,mimeType:'image/jpeg',data:await jpeg(c,0,0,W,H,OVERVIEW)}];
 for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){
  const x0=Math.max(0,k*tw-ox),y0=Math.max(0,r*th-oy),x1=Math.min(W,(k+1)*tw+ox),y1=Math.min(H,(r+1)*th+oy);
  const label=`ภาพขยาย ส่วน${rows===2?(r?'ล่าง':'บน'):rowName[r]}${cols===2?(k?'ขวา':'ซ้าย'):colName[k]} (แถว ${r+1}/${rows} · คอลัมน์ ${k+1}/${cols})`;
  out.push({label,mimeType:'image/jpeg',data:await jpeg(c,x0,y0,x1-x0,y1-y0,1800)});
 }
 return out;
}
