import {expandPrims,type Prim} from '../../domain/drawingPrims';
import {textWidth} from '../../domain/drawingPrims';
import type {SheetViewInfo} from '../../domain/bbsSheet';
import type {CadStandard} from '../../domain/cadStandard';
import type {DimStyleDef,DxfDoc} from './writer';
import type {Emitter,Tf} from './entities';

/** One sheet to export: primitives (semantic ones kept), its views (box, scale, sheet ↔ model map) and paper size. */
export type DxfSheet={prims:Prim[];views:SheetViewInfo[];w:number;h:number;size:string};
export type Ctx={doc:DxfDoc;em:Emitter;cad:CadStandard;warnings:string[];ext:{x0:number;y0:number;x1:number;y1:number}};
export const pad=(n:number)=>String(n).padStart(2,'0');
const num=(v:number)=>Number.isInteger(v)?String(v):v.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
const style=(cad:CadStandard,name:string,dimscale:number,dimlfac:number):DimStyleDef=>({name,dimscale,dimlfac,...cad.dim});
/** DIMSTYLE definitions (registered in the file only when a dimension / leader uses them). */
/** DIMSTYLE of dimensions drawn at true size in model space: BBS-DIM-1-n (DIMSCALE = n, DIMLFAC = 1). */
export const modelDim=(c:Ctx,n:number)=>style(c.cad,`BBS-DIM-1-${num(n)}`,n,1);
/** DIMSTYLE of dimensions drawn on paper (sheet mm) for a 1:n view: BBS-DIM-1-n (DIMSCALE = 1, DIMLFAC = n). */
export const paperDim=(c:Ctx,n:number)=>style(c.cad,`BBS-DIM-1-${num(n)}`,1,n);
/** not to scale views: DIMLFAC = real mm per drawn unit (1 / s), DIMSCALE = size of the drawing units */
export const ntsDim=(c:Ctx,lfac:number,dimscale=1)=>(style(c.cad,`BBS-DIM-NTS-${num(lfac)}${dimscale!==1?`-S${num(dimscale)}`:''}`,dimscale,lfac));
/** Primitives by view id ('' = paper). */
export function byView(prims:Prim[]){const m=new Map<string,Prim[]>();for(const p of prims){const k=p.view||'';(m.get(k)||m.set(k,[]).get(k)!).push(p);}return m;}
/** Sheet-mm bounding box of primitives (drawing as on the PDF; text by its estimated width). */
export function bbox(prims:Prim[]){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;const P=(x:number,y:number)=>{if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;};
 for(const p of [...expandPrims(prims),...prims.filter(q=>q.t==='dim').flatMap(q=>q.t==='dim'?[{t:'line' as const,x1:q.a[0],y1:q.a[1],x2:q.b[0],y2:q.b[1]},{t:'line' as const,x1:q.line[0],y1:q.line[1],x2:q.line[0],y2:q.line[1]}]:[])]){
  if(p.t==='line'){P(p.x1,p.y1);P(p.x2,p.y2);}else if(p.t==='rect'||p.t==='image'){P(p.x,p.y);P(p.x+p.w,p.y+p.h);}else if(p.t==='poly')p.pts.forEach(q=>P(q[0],q[1]));
  else if(p.t==='circle'){P(p.cx-p.r,p.cy-p.r);P(p.cx+p.r,p.cy+p.r);}else if(p.t==='ellipse'){P(p.cx-p.rx,p.cy-p.ry);P(p.cx+p.rx,p.cy+p.ry);}
  else if(p.t==='text'){const w=textWidth(p.text,p.size),x=p.anchor==='end'?p.x-w:p.anchor==='middle'?p.x-w/2:p.x;P(x,p.y-p.size);P(x+w,p.y+p.size*.3);}}
 return Number.isFinite(x0)?{x0,y0,x1,y1,w:x1-x0,h:y1-y0}:undefined;
}
export function grow(c:Ctx,tf:Tf,b:{x0:number;y0:number;x1:number;y1:number}){
 const xs=[tf.ax+b.x0*tf.sc,tf.ax+b.x1*tf.sc],ys=[tf.ay-b.y0*tf.sc,tf.ay-b.y1*tf.sc];
 c.ext.x0=Math.min(c.ext.x0,...xs);c.ext.x1=Math.max(c.ext.x1,...xs);c.ext.y0=Math.min(c.ext.y0,...ys);c.ext.y1=Math.max(c.ext.y1,...ys);
}
/** Model transform of a view at true size: sheet (x, y) → (ox + u, oy + v) with the view's own u / v (mm). */
export function viewTf(v:SheetViewInfo,ox:number,oy:number):Tf{const sc=1/v.s;return {ax:ox+v.origin.model[0]-v.origin.sheet[0]*sc,ay:oy+v.origin.model[1]+v.origin.sheet[1]*sc,sc};}
