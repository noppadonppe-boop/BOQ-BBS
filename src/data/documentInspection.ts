import type {Attachment} from '../domain/model';
import {isModelFile} from '../domain/fileTypes';
import type {PDFDocument as PdfDocument} from 'pdf-lib';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
// A PDF may prohibit editing while remaining readable with the empty user
// password. Verify that readability with the same parser as FilePanel; never
// strip protection, guess passwords or modify the supplied bytes.
export async function readablePdfInput(bytes:ArrayBuffer):Promise<{pdf?:PdfDocument;pageCount:number}>{
 const {PDFDocument}=await import('pdf-lib');
 try{const pdf=await PDFDocument.load(bytes);if(pdf.isEncrypted)throw Error('Protected PDF requires viewer verification');return {pdf,pageCount:pdf.getPageCount()};}catch{
  // pdf-lib's bundled Error subclasses are not reliably instanceof their
  // exports. A fallback still has to parse successfully in the actual viewer;
  // no error string or encryption flag alone constitutes valid input.
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const task=pdfjs.getDocument({data:new Uint8Array(bytes).slice(),password:''});let doc;
  try{doc=await task.promise;return {pageCount:doc.numPages};}catch(error:any){
   if(error?.name==='PasswordException')throw Object.assign(Error('PDF นี้ต้องใช้รหัสผ่านเพื่ออ่าน กรุณาแนบฉบับที่คุณเปิดอ่านได้โดยไม่ต้องใส่รหัสผ่าน'),{code:'failed-precondition'});
   throw error;
  }finally{await (doc?.destroy()||task.destroy());}
 }
}
export async function readablePdfPageCount(bytes:ArrayBuffer){return (await readablePdfInput(bytes)).pageCount;}
export async function inspectAttachmentDocument(a:Attachment,blob:Blob){
 let pageCount=1;
 if(a.contentType==='application/pdf')pageCount=await readablePdfPageCount(await blob.arrayBuffer());
 else if(isModelFile(a)){
  // CAD / BIM: one "page"; check the file signature only (DWG "AC10xx", IFC "ISO-10303-21", DXF section header)
  const head=new TextDecoder('latin1').decode(await blob.slice(0,4096).arrayBuffer());
  const ok=a.contentType==='image/vnd.dwg'?/^AC10\d\d/.test(head):a.contentType==='application/x-step'?/^\s*ISO-10303-21/.test(head):/(^|\n)\s*0\s*\r?\n\s*SECTION/.test(head)||head.startsWith('AutoCAD Binary DXF');
  if(!ok)throw Object.assign(Error(`ไฟล์ไม่ใช่ ${a.contentType==='image/vnd.dwg'?'DWG':a.contentType==='application/x-step'?'IFC':'DXF'} ที่ถูกต้อง`),{code:'failed-precondition'});
 }
 else{const bitmap=await createImageBitmap(blob);if(bitmap.width<=0||bitmap.height<=0)throw Error('ไฟล์ภาพไม่ถูกต้อง');bitmap.close();}
 if(a.pageCount&&a.pageCount!==pageCount)throw Object.assign(Error('จำนวนหน้าไฟล์ไม่ตรง'),{code:'failed-precondition'});
 if(a.page>pageCount||(a.annotations||[]).some(p=>p.page>pageCount)||Object.keys(a.calibrations||{}).some(p=>Number(p)>pageCount))throw Object.assign(Error('หน้าแบบหรือจุดชี้เกินไฟล์'),{code:'failed-precondition'});
 return pageCount;
}
