import {getBlob,ref} from 'firebase/storage';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {storage} from './firebase';
import type {Attachment} from '../domain/model';

// Zoomed views of a drawing sheet for the AI shape reader: one overview plus a 3 × 2 grid of overlapping tiles.
// An A1 sheet sent as one page image is downscaled by the AI providers until dimension text is unreadable.
export type DrawingView={label:string;mimeType:'image/jpeg';data:string};
const MASTER=4800,OVERVIEW=1600,COLS=3,ROWS=2,OVERLAP=.08,QUALITY=.82,MAX_BYTES=4.5*1024*1024;

async function masterCanvas(a:Attachment):Promise<HTMLCanvasElement>{
 const blob=await getBlob(ref(storage,a.path)),c=document.createElement('canvas'),ctx=c.getContext('2d')!;
 if(a.contentType==='application/pdf'){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const doc=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
  try{const p=await doc.getPage(1),v1=p.getViewport({scale:1}),v=p.getViewport({scale:MASTER/Math.max(v1.width,v1.height)});
   c.width=Math.round(v.width);c.height=Math.round(v.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
   await p.render({canvasContext:ctx,canvas:c,viewport:v}).promise;}finally{await doc.destroy();}
 }else{const img=await createImageBitmap(blob);c.width=img.width;c.height=img.height;ctx.drawImage(img,0,0);img.close();}
 return c;
}
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
export async function prepareDrawing(a:Attachment,focus:string[]=[]):Promise<{views:DrawingView[];text?:string}>{
 if(a.contentType==='image/vnd.dwg')throw Error(`${a.name}: ระบบยังอ่าน DWG ไม่ได้ · ใน AutoCAD ใช้ Save As → DXF (AutoCAD 2018 DXF) แล้วอัปโหลดไฟล์ DXF`);
 if(a.contentType==='image/vnd.dxf'||a.contentType==='application/x-step'){
  const {dxfDrawing,ifcDrawing}=await import('./cadDrawings'),blob=await getBlob(ref(storage,a.path));
  const d=a.contentType==='image/vnd.dxf'?await dxfDrawing(blob,{focus}):await ifcDrawing(blob);
  const views=[...(d.canvas?await tiles(d.canvas,a.name):[]),...(d.views||[]).map(v=>({...v,mimeType:'image/jpeg' as const}))];
  return {views:views.slice(0,8),text:d.text};
 }
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
