import type {Member,Vec3} from './model';
import {footingExtent,footingOutline,lineIntervals,pilePositions,type ElementInput,type Pt} from './elementInput';
import {solidsOf} from './solids';
import {contextSolids} from './placementContext';
import {textWidth,type Prim} from './drawingPrims';

export type ViewRow={id:string;mark:string;diameter:number;note:string;count:number;paths:Vec3[][]};
export type ViewSpec={axes:[number,number];normal?:number;cut?:number};
type Rect={u0:number;u1:number;v0:number;v1:number;kind:'concrete'|'context'|'lean'|'pile';circle?:boolean};
type Pile={u:number;v:number;square:boolean;size:number;hollow:boolean};
type Line={a:[number,number];b:[number,number]};
export const barPalette=['#167561','#c2410c','#2563eb','#9333ea','#b45309','#0e7490','#be123c','#4d7c0f','#7c3aed','#0369a1','#a16207','#15803d'];
export const markColors=(rows:{id:string}[])=>new Map(rows.map((r,i)=>[r.id,barPalette[i%barPalette.length]]));
const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');

function circleIds(input?:ElementInput){
 const ids=new Set<string>();
 if(input?.category==='Column'&&input.shape==='circle')ids.add('main');
 if(input?.category==='Foundation'&&input.column.type!=='none'&&input.column.shape==='circle'){ids.add('pedestal');ids.add('context_gencol1');}
 return ids;
}
function leanRect(m:Member,a:number,b:number,normal:number|undefined,cut:number|undefined):Rect[]{
 const o=[(m.x-m.lean.x)/2,(m.y-m.lean.y)/2,-m.lean.thickness],s=[m.lean.x,m.lean.y,m.lean.thickness];
 if(normal!==undefined&&(cut!<o[normal]||cut!>o[normal]+s[normal]))return [];
 return [{u0:o[a],u1:o[a]+s[a],v0:o[b],v1:o[b]+s[b],kind:'lean'}];
}

/** Geometry of one view (plan when `normal` is undefined, otherwise a section at `cut`). */
export function buildView(m:Member,rows:ViewRow[],input:ElementInput|undefined,{axes,normal,cut}:ViewSpec){
 const [a,b]=axes,round=circleIds(input),rects:Rect[]=[],guides:Line[]=[];
 // Footing concrete comes from the true plan outline (circle / polygons / L / U), not the bounding box.
 const foot=input?.category==='Foundation'?footingOutline(input):undefined,polys:Pt[][]=[],piles:Pile[]=[];
 const isFooting=(id:string)=>!!foot&&(id==='main'||id.startsWith('footing'));
 const boxes=[...solidsOf(m).filter(s=>!isFooting(s.id)).map(s=>({s,kind:'concrete' as const})),...contextSolids(m).map(s=>({s,kind:'context' as const}))];
 if(m.category==='Foundation'&&m.lean.thickness>0)rects.push(...leanRect(m,a,b,normal,cut));
 if(foot&&input?.category==='Foundation'){
  if(normal===undefined)polys.push(foot);else for(const [u0,u1] of lineIntervals(foot,a as 0|1,Math.min(Math.max(cut!,1e-3),(a===0?m.y:m.x)-1e-3)))rects.push({u0,u1,v0:0,v1:input.thickness,kind:'concrete'});
  const p=input.pile,square=p.type==='square'||p.type==='I',h=p.size/2,bottom=-m.lean.thickness-700;
  for(const [x,y] of pilePositions(input)){
   if(normal===undefined){piles.push({u:[x,y][a],v:[x,y][b],square,size:p.size,hollow:p.type==='spun'});continue;}
   const along=normal===1?y:x,dz=Math.abs(along-cut!);if(dz>h)continue;const half=square?h:Math.sqrt(h*h-dz*dz),u=normal===1?x:y;
   rects.push({u0:u-half,u1:u+half,v0:bottom,v1:p.embed,kind:'pile'});
  }
 }
 for(const {s,kind} of boxes){
  const circle=round.has(s.id);
  if(normal===undefined){rects.push({u0:s.origin[a],u1:s.origin[a]+s.size[a],v0:s.origin[b],v1:s.origin[b]+s.size[b],kind,circle});continue;}
  const lo=s.origin[normal],hi=lo+s.size[normal];if(cut!<lo-1e-6||cut!>hi+1e-6)continue;
  if(circle){const r=s.size[normal]/2,c=lo+r,h=Math.sqrt(Math.max(0,r*r-(cut!-c)**2)),cu=s.origin[a]+s.size[a]/2;if(h>0)rects.push({u0:cu-h,u1:cu+h,v0:s.origin[b],v1:s.origin[b]+s.size[b],kind});}
  else rects.push({u0:s.origin[a],u1:s.origin[a]+s.size[a],v0:s.origin[b],v1:s.origin[b]+s.size[b],kind});
 }
 // Excavation outline and ground line (foundations).
 const e=m.excavation,ground=e.depth-m.lean.thickness;
 if(m.category==='Foundation'&&e.depth>0){
  if(normal===undefined){for(const [wx,wy] of [[e.topX,e.topY],[e.bottomX,e.bottomY]]){const u0=(m.x-wx)/2,v0=(m.y-wy)/2;guides.push({a:[u0,v0],b:[u0+wx,v0]},{a:[u0+wx,v0],b:[u0+wx,v0+wy]},{a:[u0+wx,v0+wy],b:[u0,v0+wy]},{a:[u0,v0+wy],b:[u0,v0]});}}
  else{const size=a===0?m.x:m.y,bw=a===0?e.bottomX:e.bottomY,tw=a===0?e.topX:e.topY,z0=-m.lean.thickness;guides.push({a:[(size-bw)/2,z0],b:[(size+bw)/2,z0]},{a:[(size-bw)/2,z0],b:[(size-tw)/2,ground]},{a:[(size+bw)/2,z0],b:[(size+tw)/2,ground]},{a:[(size-tw)/2-300,ground],b:[(size+tw)/2+300,ground]});}
 }
 // Bars: plan projects everything; sections show bars lying in the nearest plane and dots where bars cross it.
 const bars=rows.map(r=>{
  const lines:Line[]=[],dots:[number,number][]=[];
  if(normal===undefined){for(const p of r.paths)for(let i=1;i<p.length;i++){const s=p[i-1],t=p[i];if(Math.hypot(t[a]-s[a],t[b]-s[b])<1){if(Math.abs(t[2]-s[2])>1)dots.push([s[a],s[b]]);}else lines.push({a:[s[a],s[b]],b:[t[a],t[b]]});}}
  else{
   // A path lying (mostly) parallel to the view plane is drawn in elevation, snapped to the
   // nearest bar of its Mark; other paths show where they cross the cut (a horizontal loop such
   // as a tie shows as a line between its crossings).
   const inPlane:{v:number;lines:Line[]}[]=[];
   for(const p of r.paths){
    let along=0,total=0,weighted=0;const segs:Line[]=[],all:Line[]=[],hits:[number,number][]=[];
    for(let i=1;i<p.length;i++){const s=p[i-1],t=p[i],len=Math.hypot(t[0]-s[0],t[1]-s[1],t[2]-s[2]);total+=len;all.push({a:[s[a],s[b]],b:[t[a],t[b]]});
     if(Math.abs(s[normal]-t[normal])<.5){along+=len;weighted+=len*(s[normal]+t[normal])/2;segs.push({a:[s[a],s[b]],b:[t[a],t[b]]});}
     else if((s[normal]-cut!)*(t[normal]-cut!)<=0){const k=(cut!-s[normal])/(t[normal]-s[normal]);hits.push([s[a]+(t[a]-s[a])*k,s[b]+(t[b]-s[b])*k]);}}
    if(total>0&&along>=.8*total){inPlane.push({v:weighted/along,lines:all.filter(l=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1])>.5)});continue;}
    const extent=(k:number)=>Math.max(...p.map(q=>q[k]))-Math.min(...p.map(q=>q[k])),planar=extent(a)<1||extent(b)<1;
    if(planar&&hits.length>=2){const k=extent(b)<1?0:1,sorted=hits.sort((x,y)=>x[k]-y[k]);lines.push({a:sorted[0],b:sorted.at(-1)!});}else dots.push(...hits);
   }
   const values=[...new Set(inPlane.map(c=>Math.round(c.v*2)/2))].sort((x,y)=>x-y);
   if(values.length){const near=values.reduce((best,v)=>Math.abs(v-cut!)<Math.abs(best-cut!)?v:best,values[0]),gap=values.length>1?Math.max(...values.slice(1).map((v,i)=>v-values[i])):Infinity;
    if(Math.abs(near-cut!)<=gap/2+1)lines.push(...inPlane.filter(c=>Math.abs(c.v-near)<.75).flatMap(c=>c.lines));}
  }
  return {row:r,lines,dots};
 });
 const us=[...rects.flatMap(r=>[r.u0,r.u1]),...polys.flat().map(p=>p[0]),...piles.flatMap(p=>[p.u-p.size/2,p.u+p.size/2]),...guides.flatMap(g=>[g.a[0],g.b[0]]),...bars.flatMap(x=>[...x.lines.flatMap(l=>[l.a[0],l.b[0]]),...x.dots.map(d=>d[0])])];
 const vs=[...rects.flatMap(r=>[r.v0,r.v1]),...polys.flat().map(p=>p[1]),...piles.flatMap(p=>[p.v-p.size/2,p.v+p.size/2]),...guides.flatMap(g=>[g.a[1],g.b[1]]),...bars.flatMap(x=>[...x.lines.flatMap(l=>[l.a[1],l.b[1]]),...x.dots.map(d=>d[1])])];
 return {member:m,input,axes,normal,cut,rects,polys,piles,guides,bars,u:[Math.min(0,...us),Math.max(1,...us)] as [number,number],v:[Math.min(0,...vs),Math.max(1,...vs)] as [number,number],ground:normal!==undefined&&m.category==='Foundation'&&e.depth>0?ground:undefined};
}
export type ViewData=ReturnType<typeof buildView>;

type DimSpec={dir:'h'|'v';stops:number[];side:'start'|'end'};
/** Chained dimensions per view from the member / input (not measured from the drawing). */
function dimensionSets(m:Member,input:ElementInput|undefined,axes:[number,number],normal?:number):DimSpec[]{
 const [a,b]=axes,size=[m.x,m.y,m.z],out:DimSpec[]=[{dir:'h',stops:[0,size[a]],side:'start'}];
 if(normal===undefined)out.push({dir:'v',stops:[0,size[b]],side:'start'});
 if(input?.category==='Foundation'){
  const col=input.column,T=input.thickness,H=col.type==='pedestal'?col.height:0;
  if(col.type!=='none'){
   const w=col.shape==='circle'?col.diameter:col.width,d=col.shape==='circle'?col.diameter:col.depth,ext=[w,d];
   const fe=footingExtent(input),chain=(axis:number)=>{const total=axis===0?fe.w:fe.d,e=ext[axis],off=axis===0?col.offsetX:col.offsetY;return [0,(total-e)/2+off,(total+e)/2+off,total];};
   out.push({dir:'h',stops:chain(a),side:'end'});
   if(normal===undefined)out.push({dir:'v',stops:chain(b),side:'end'});
  }
  if(normal!==undefined){
   const zs=[0,T,...(H>0?[T+H]:[]),...(col.type!=='none'&&col.projection>0?[T+H+col.projection]:[])];
   out.push({dir:'v',stops:m.lean.thickness>0?[-m.lean.thickness,...zs]:zs,side:'start'});
   if(m.excavation.depth>0)out.push({dir:'v',stops:[-m.lean.thickness,m.excavation.depth-m.lean.thickness],side:'end'});
  }
 }else if(normal!==undefined)out.push({dir:'v',stops:[0,size[b]],side:'start'});
 return out;
}

/** Height that keeps the view's aspect for a given width (screen layout, px). */
export function viewHeight(v:ViewData,width:number,maxHeight:number,k=1){
 const M=48*k,s=Math.min((width-2*M)/(v.u[1]-v.u[0]),(maxHeight-2*M+20*k)/(v.v[1]-v.v[0]));
 return Math.max(160*k,(v.v[1]-v.v[0])*s+2*M);
}
/** Draw a view into `box`. `k` converts the screen design sizes (px) to the target unit
 * (k = 1 for px, ≈ 0.26 for mm on an A3 sheet). */
export function renderView(v:ViewData,box:{x:number;y:number;w:number;h:number},opts:{k?:number;colors:Map<string,string>;cuts?:{x:number;y:number};fontScale?:number}):Prim[]{
 const k=opts.k??1,fs=opts.fontScale??1,M=48*k,{u,v:vr}=v,spanU=u[1]-u[0],spanV=vr[1]-vr[0];
 const s=Math.min((box.w-2*M)/spanU,(box.h-2*M)/spanV),offU=(box.w-2*M-spanU*s)/2,offV=(box.h-2*M-spanV*s)/2;
 const X=(x:number)=>box.x+M+offU+(x-u[0])*s,Y=(y:number)=>box.y+box.h-M-offV-(y-vr[0])*s,out:Prim[]=[];
 const style:Record<Rect['kind'],{fill?:string;stroke:string;width:number;dash?:number[]}>={concrete:{fill:'#e9efec',stroke:'#51706a',width:1.2*k},lean:{fill:'#dcd8cf',stroke:'#8a857a',width:.8*k},context:{stroke:'#d07a2d',width:1*k,dash:[5*k,3*k]},pile:{fill:'#cfc6b6',stroke:'#6b5b45',width:1*k}};
 const rect=(r:Rect)=>out.push(r.circle?{t:'ellipse',cx:X((r.u0+r.u1)/2),cy:Y((r.v0+r.v1)/2),rx:(r.u1-r.u0)/2*s,ry:(r.v1-r.v0)/2*s,...style[r.kind]}:{t:'rect',x:X(r.u0),y:Y(r.v1),w:(r.u1-r.u0)*s,h:(r.v1-r.v0)*s,...style[r.kind]});
 v.rects.filter(r=>r.kind==='lean').forEach(rect);
 for(const p of v.polys)out.push({t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])]),closed:true,...style.concrete});
 for(const p of v.piles){const dash=[4*k,2*k];if(p.square)out.push({t:'rect',x:X(p.u-p.size/2),y:Y(p.v+p.size/2),w:p.size*s,h:p.size*s,stroke:'#6b5b45',width:k,dash});else{out.push({t:'circle',cx:X(p.u),cy:Y(p.v),r:p.size/2*s,stroke:'#6b5b45',width:k,dash});if(p.hollow)out.push({t:'circle',cx:X(p.u),cy:Y(p.v),r:p.size/4*s,stroke:'#6b5b45',width:k,dash});}}
 v.rects.filter(r=>r.kind!=='lean').forEach(rect);
 for(const g of v.guides)out.push({t:'line',x1:X(g.a[0]),y1:Y(g.a[1]),x2:X(g.b[0]),y2:Y(g.b[1]),stroke:'#a07b54',width:.8*k,dash:[6*k,4*k]});
 if(v.ground!==undefined)out.push({t:'text',x:X(u[1]),y:Y(v.ground)-4*k,text:'ระดับดิน',size:10*k*fs,color:'#8a6a45',anchor:'end'});
 const cuts=opts.cuts;
 if(cuts){const cs={stroke:'#7c8b8f',width:.8*k,dash:[10*k,3*k,2*k,3*k]};out.push({t:'line',x1:X(u[0]),x2:X(u[1]),y1:Y(cuts.y),y2:Y(cuts.y),...cs},{t:'line',x1:X(cuts.x),x2:X(cuts.x),y1:Y(vr[0]),y2:Y(vr[1]),...cs});
  const ts={size:11*k*fs,color:'#5b6b70',bold:true};out.push({t:'text',x:X(u[0])-6*k,y:Y(cuts.y)+4*k,text:'X',anchor:'end',...ts},{t:'text',x:X(u[1])+6*k,y:Y(cuts.y)+4*k,text:'X',...ts},{t:'text',x:X(cuts.x),y:Y(vr[1])-6*k,text:'Y',anchor:'middle',...ts},{t:'text',x:X(cuts.x),y:Y(vr[0])+14*k,text:'Y',anchor:'middle',...ts});}
 // Mark labels: start near the bar, then move down until they no longer overlap a placed label.
 // Marks split by bar length (gen-bottom-x-1, -2, …) share one label "F01–F08".
 const placed:{x:number;y:number;w:number}[]=[],family=(id:string)=>id.replace(/^(gen-(?:bottom|top)-[xy])-\d+$/,'$1'),labelled=new Set<string>();
 const size=10*k*fs,step=size*1.15;
 for(const {row,lines,dots} of v.bars){
  const color=opts.colors.get(row.id)||'#167561',w=Math.max(k,row.diameter*s);
  for(const l of lines)out.push({t:'line',x1:X(l.a[0]),y1:Y(l.a[1]),x2:X(l.b[0]),y2:Y(l.b[1]),stroke:color,width:w,cap:'round',group:row.id});
  for(const d of dots)out.push({t:'circle',cx:X(d[0]),cy:Y(d[1]),r:Math.max(1.6*k,row.diameter*s/2),fill:color,group:row.id});
  const fam=family(row.id);if(labelled.has(fam))continue;
  const p=lines[0]?[(lines[0].a[0]+lines[0].b[0])/2,(lines[0].a[1]+lines[0].b[1])/2]:dots[0];if(!p)continue;labelled.add(fam);
  const marks=fam!==row.id?v.bars.filter(x=>family(x.row.id)===fam).map(x=>x.row.mark):[row.mark],text=marks.length>1?`${marks[0]}–${marks.at(-1)}`:row.mark;
  const ax=X(p[0]),ay=Y(p[1]),tw=textWidth(text,size);let x=ax+8*k,y=ay-8*k;
  for(let n=0;n<30&&placed.some(q=>x<q.x+q.w+2*k&&q.x<x+tw+2*k&&Math.abs(q.y-y)<step);n++)y+=step;
  placed.push({x,y,w:tw});
  out.push({t:'line',x1:ax,y1:ay,x2:x,y2:y-3*k,stroke:color,width:.5*k,group:row.id},{t:'text',x:x+2*k,y,text,size,color,bold:true,halo:true,group:row.id});
 }
 // Dimensions.
 const line={stroke:'#5f7378',width:.7*k},dsize=10*k*fs;
 for(const d of dimensionSets(v.member,v.input,v.axes,v.normal)){
  const pts=[...new Set(d.stops.map(n=>Math.round(n*10)/10))].sort((p,q)=>p-q);if(pts.length<2)continue;
  if(d.dir==='h'){const y=d.side==='start'?Y(vr[0])+22*k:Y(vr[1])-16*k;for(const p of pts)out.push({t:'line',x1:X(p),x2:X(p),y1:y-5*k,y2:y+5*k,...line});out.push({t:'line',x1:X(pts[0]),x2:X(pts.at(-1)!),y1:y,y2:y,...line});pts.slice(1).forEach((p,i)=>{if(X(p)-X(pts[i])>textWidth(fmt(p-pts[i]),dsize)+2*k)out.push({t:'text',x:(X(p)+X(pts[i]))/2,y:y-3*k,text:fmt(p-pts[i]),size:dsize,color:'#3f5459',anchor:'middle'});});}
  else{const x=d.side==='start'?X(u[0])-24*k:X(u[1])+24*k;for(const p of pts)out.push({t:'line',x1:x-5*k,x2:x+5*k,y1:Y(p),y2:Y(p),...line});out.push({t:'line',x1:x,x2:x,y1:Y(pts[0]),y2:Y(pts.at(-1)!),...line});pts.slice(1).forEach((p,i)=>{if(Y(pts[i])-Y(p)>dsize*1.2)out.push({t:'text',x:x+(d.side==='start'?-3*k:3*k),y:(Y(p)+Y(pts[i]))/2+3*k,text:fmt(p-pts[i]),size:dsize,color:'#3f5459',anchor:d.side==='start'?'end':'start'});});}
 }
 const axisName=['X','Y','Z'];
 out.push({t:'text',x:box.x+box.w-6*k,y:box.y+box.h-6*k,text:`${axisName[v.axes[0]]} → · ${axisName[v.axes[1]]} ↑`,size:9*k*fs,color:'#9aa8a6',anchor:'end'});
 return out;
}

/** Default cut positions: section X–X through the first column bar row (or member.sectionY), Y–Y likewise. */
export function defaultCuts(m:Member,rows:ViewRow[]){
 const top=rows.find(r=>r.id.startsWith('gen-column-main'))?.paths[0]?.at(-1);
 return {x:Math.min(m.x,Math.max(0,top?.[0]??m.x/2)),y:Math.min(m.y,Math.max(0,m.sectionY??m.y/2))};
}
