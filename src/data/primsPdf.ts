import type {jsPDF} from 'jspdf';
import {textWidth,type Prim} from '../domain/drawingPrims';

const rgb=(hex:string):[number,number,number]=>{const h=hex.replace('#','');const n=h.length===3?h.split('').map(c=>c+c).join(''):h;return [parseInt(n.slice(0,2),16),parseInt(n.slice(2,4),16),parseInt(n.slice(4,6),16)];};
const cjk=/[⺀-鿿豈-﫿＀-￯]/;
const PX_PER_MM=16; // ≈ 400 dpi
/** Chinese text: the embedded PDF font (Sarabun) has no CJK glyphs, so the browser's system font draws it into
 * a high-resolution image placed at the same baseline / anchor. */
function cjkText(doc:jsPDF,p:Extract<Prim,{t:'text'}>){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!,px=p.size*PX_PER_MM;
 const font=`${p.bold?'600 ':''}${px}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Noto Sans SC",Sarabun,sans-serif`;ctx.font=font;
 const w=Math.ceil(ctx.measureText(p.text).width)+4,h=Math.ceil(px*1.4);canvas.width=w;canvas.height=h;
 if(p.halo){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
 ctx.font=font;ctx.fillStyle=p.color||'#253b42';ctx.textBaseline='alphabetic';ctx.fillText(p.text,2,px*1.1);
 const wm=w/PX_PER_MM,hm=h/PX_PER_MM,x=p.anchor==='end'?p.x-wm:p.anchor==='middle'?p.x-wm/2:p.x;
 doc.addImage(canvas.toDataURL('image/png'),'PNG',x-2/PX_PER_MM,p.y-1.1*p.size,wm,hm,undefined,'FAST');
}
/** Draws primitives (mm) with jsPDF; text sizes are in mm (converted to pt). */
export function drawPrims(doc:jsPDF,prims:Prim[]){
 for(const p of prims){
  if(p.t==='text'){
   if(cjk.test(p.text)&&typeof document!=='undefined'){cjkText(doc,p);continue;}
   const pt=p.size/0.3528;doc.setFontSize(pt);
   if(p.halo){const w=textWidth(p.text,p.size),x=p.anchor==='end'?p.x-w:p.anchor==='middle'?p.x-w/2:p.x;doc.setFillColor(255,255,255);doc.rect(x-.3,p.y-p.size*.8,w+.6,p.size,'F');}
   doc.setTextColor(...rgb(p.color||'#253b42'));doc.text(p.text,p.x,p.y,{align:p.anchor==='end'?'right':p.anchor==='middle'?'center':'left'});continue;
  }
  if(p.t==='image'){const format=p.src.startsWith('data:image/png')?'PNG':'JPEG';try{doc.addImage(p.src,format,p.x,p.y,p.w,p.h,undefined,'FAST');}catch{/* unreadable logo: leave the box empty */}continue;}
  const fill='fill' in p&&p.fill&&p.fill!=='none'?p.fill:undefined,stroke=p.stroke&&p.stroke!=='none'?p.stroke:undefined;
  if(!fill&&!stroke)continue;
  if(stroke){doc.setDrawColor(...rgb(stroke));doc.setLineWidth(p.width??.2);}
  if(fill)doc.setFillColor(...rgb(fill));
  doc.setLineDashPattern(stroke&&p.dash?p.dash:[],0);
  const style=fill&&stroke?'FD':fill?'F':'S';
  if(p.t==='line')doc.line(p.x1,p.y1,p.x2,p.y2);
  else if(p.t==='rect')doc.rect(p.x,p.y,p.w,p.h,style);
  else if(p.t==='circle')doc.circle(p.cx,p.cy,p.r,style);
  else if(p.t==='ellipse')doc.ellipse(p.cx,p.cy,p.rx,p.ry,style);
  else if(p.pts.length>1)doc.lines(p.pts.slice(1).map((q,i)=>[q[0]-p.pts[i][0],q[1]-p.pts[i][1]]),p.pts[0][0],p.pts[0][1],[1,1],p.closed===false?'S':style,p.closed!==false);
 }
 doc.setLineDashPattern([],0);
}
