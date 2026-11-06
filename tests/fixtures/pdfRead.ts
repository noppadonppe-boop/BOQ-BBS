// Reads one page of a PDF in Node (pdfjs legacy build) the way the browser loader does: operator list + texts + OCG names.
import {pdfDoc,type CadDoc} from '../../src/domain/cadEntities';
import {PDF_ORIGIN_MM} from './slabPlan';
export async function readPdf(bytes:Uint8Array,page=1):Promise<CadDoc>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
 try{const p=await pdf.getPage(page),cfg=await pdf.getOptionalContentConfig(),texts=(await p.getTextContent()).items as any[];
  return pdfDoc(await p.getOperatorList(),pdfjs.OPS as unknown as Record<string,number>,p.view as [number,number,number,number],
   {texts,ocName:(props:any)=>{const id=typeof props==='string'?props:props?.id;return id?cfg.getGroup(id)?.name||undefined:undefined;}});}
 finally{await pdf.destroy();}
}
/** page points → floor mm at 1:100 with grid A/1 at the origin (the calibration of the fixture pages) */
export const PAGE_T={scale:100*25.4/72,rotation:0,tx:-PDF_ORIGIN_MM[0]*100,ty:-(297-PDF_ORIGIN_MM[1])*100};
