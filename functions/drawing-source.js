const sharp = require('sharp');
const {createCanvas} = require('@napi-rs/canvas');
const path = require('node:path');

// Render only the requested viewport, not a huge full-page bitmap. Boxes are
// fractions of the displayed (rotated) page, top-left origin: [x,y,width,height].
async function openDrawing(file) {
  if (file.mimeType === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const root = path.dirname(require.resolve('pdfjs-dist/package.json')).replace(/\\/g,'/') + '/';
    const loading = pdfjs.getDocument({data: new Uint8Array(file.buffer),isEvalSupported:false,
      standardFontDataUrl:root+'standard_fonts/',cMapUrl:root+'cmaps/',cMapPacked:true});
    const pdf = await loading.promise;
    return {pages:pdf.numPages,close:()=>pdf.destroy(),async render(page,box=[0,0,1,1],pixels=1800) {
      check(page,box,pdf.numPages);
      const p=await pdf.getPage(page),base=p.getViewport({scale:1});
      const scale=Math.min(12,pixels/Math.max(base.width*box[2],base.height*box[3]));
      const view=p.getViewport({scale}),width=Math.max(1,Math.ceil(view.width*box[2])),height=Math.max(1,Math.ceil(view.height*box[3]));
      const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
      await p.render({canvasContext:ctx,viewport:view,transform:[1,0,0,1,-box[0]*view.width,-box[1]*view.height],background:'white'}).promise;
      const buffer=await canvas.encode('png');
      return {buffer,mimeType:'image/png',filename:`page-${page}.png`,size:buffer.length,width,height};
    }};
  }
  if(!['image/png','image/jpeg'].includes(file.mimeType))throw Error('รองรับ PDF / PNG / JPEG');
  // Auto-orient once so every crop uses the same coordinate system as discovery.
  const original=await sharp(file.buffer,{limitInputPixels:100000000}).rotate().png().toBuffer();
  const meta=await sharp(original).metadata();
  return {pages:1,close:async()=>{},async render(page,box=[0,0,1,1],pixels=1800) {
    check(page,box,1);
    const left=Math.floor(box[0]*meta.width),top=Math.floor(box[1]*meta.height);
    const width=Math.min(meta.width-left,Math.max(1,Math.ceil(box[2]*meta.width))),height=Math.min(meta.height-top,Math.max(1,Math.ceil(box[3]*meta.height)));
    const buffer=await sharp(original).extract({left,top,width,height}).resize({width:pixels,height:pixels,fit:'inside',withoutEnlargement:true}).png().toBuffer();
    return {buffer,mimeType:'image/png',filename:`page-${page}.png`,size:buffer.length,width,height};
  }};
}
function check(page,box,pages) {
  if(!Number.isInteger(page)||page<1||page>pages||!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[0]<0||box[1]<0||box[2]<=0||box[3]<=0||box[0]+box[2]>1.001||box[1]+box[3]>1.001)throw Error('หน้า/กรอบภาพไม่ถูกต้อง');
}
exports.openDrawing=openDrawing;
