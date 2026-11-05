import {expandPrims,type PlainPrim,type Prim} from './drawingPrims';

/** Clip region of a Detail view (sheet / target units): circle or axis-aligned rectangle. */
export type ClipShape={kind:'circle';cx:number;cy:number;r:number}|{kind:'rect';x0:number;y0:number;x1:number;y1:number};
type P=[number,number];
const inside=(s:ClipShape,x:number,y:number)=>s.kind==='circle'?Math.hypot(x-s.cx,y-s.cy)<=s.r+1e-9:x>=s.x0-1e-9&&x<=s.x1+1e-9&&y>=s.y0-1e-9&&y<=s.y1+1e-9;
/** Parameter range [t0, t1] ⊂ [0, 1] of the segment a→b inside the shape (undefined = outside). */
function segRange(s:ClipShape,a:P,b:P):[number,number]|undefined{
 const dx=b[0]-a[0],dy=b[1]-a[1];
 if(s.kind==='circle'){const fx=a[0]-s.cx,fy=a[1]-s.cy,A=dx*dx+dy*dy,B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-s.r*s.r;
  if(A<1e-12)return C<=0?[0,1]:undefined;const D=B*B-4*A*C;if(D<0)return;const q=Math.sqrt(D),t0=Math.max(0,(-B-q)/(2*A)),t1=Math.min(1,(-B+q)/(2*A));return t1>t0?[t0,t1]:undefined;}
 // Liang–Barsky
 let t0=0,t1=1;for(const [p,q] of [[-dx,a[0]-s.x0],[dx,s.x1-a[0]],[-dy,a[1]-s.y0],[dy,s.y1-a[1]]] as P[]){
  if(Math.abs(p)<1e-12){if(q<0)return;continue;}const r=q/p;if(p<0){if(r>t1)return;if(r>t0)t0=r;}else{if(r<t0)return;if(r<t1)t1=r;}}
 return t1>t0?[t0,t1]:undefined;}
const at=(a:P,b:P,t:number):P=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
/** Primitives cut to a Detail region: lines / polygon edges / rectangle edges clipped (fills dropped, outlines kept),
 * circles / ellipses / text kept when their centre / anchor is inside, images dropped. Semantic primitives (leaders of the
 * Mark labels, dims) are kept whole when their first point is inside, else dropped. */
export function clipPrims(prims:Prim[],s:ClipShape):Prim[]{
 const out:Prim[]=[];
 const segs=(p:PlainPrim&{stroke?:string;width?:number;dash?:number[]},pts:P[],closed:boolean)=>{if(!p.stroke||p.stroke==='none')return;const n=closed?pts.length:pts.length-1;
  for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%pts.length],r=segRange(s,a,b);if(!r)continue;const A=at(a,b,r[0]),B=at(a,b,r[1]);
   out.push({t:'line',x1:A[0],y1:A[1],x2:B[0],y2:B[1],stroke:p.stroke,width:p.width,dash:p.dash,group:p.group,layer:p.layer,key:p.key});}};
 for(const p of prims){
  if(p.t==='leader'){if(inside(s,p.pts[0][0],p.pts[0][1]))out.push(p);continue;}
  if(p.t==='dim'){if(inside(s,p.a[0],p.a[1])&&inside(s,p.b[0],p.b[1]))out.push(p);continue;}
  if(p.t==='mtext'){if(inside(s,p.x,p.y))out.push(p);continue;}
  for(const q of expandPrims([p])){
   if(q.t==='line'){const r=segRange(s,[q.x1,q.y1],[q.x2,q.y2]);if(!r)continue;const A=at([q.x1,q.y1],[q.x2,q.y2],r[0]),B=at([q.x1,q.y1],[q.x2,q.y2],r[1]);out.push({...q,x1:A[0],y1:A[1],x2:B[0],y2:B[1]});}
   else if(q.t==='poly'){const all=q.pts.every(pt=>inside(s,pt[0],pt[1]));if(all){out.push(q);continue;}segs(q,q.pts,q.closed!==false);}
   else if(q.t==='rect'){const pts:P[]=[[q.x,q.y],[q.x+q.w,q.y],[q.x+q.w,q.y+q.h],[q.x,q.y+q.h]];if(pts.every(pt=>inside(s,pt[0],pt[1]))){out.push(q);continue;}segs(q,pts,true);}
   else if(q.t==='circle'||q.t==='ellipse'){if(inside(s,q.cx,q.cy))out.push(q);}
   else if(q.t==='text'){if(inside(s,q.x,q.y))out.push(q);}}}
 return out;
}
