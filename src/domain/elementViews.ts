import type {Member,Vec3} from './model';
import {barCouplerEnds,beamGroupLayout,columnPour,columnExtent,columnOutline,footingColumns,footingExtent,footingLevels,footingOutline,footingPour,footingSlabOn,lineIntervals,pilePositions,type ElementInput,type Pt} from './elementInput';
import {solidsOf} from './solids';
import {contextSolids} from './placementContext';
import {partExtent,partPolygon,shapePlanRings,shapeSectionRects} from './shapeGeometry';
import {textWidth,type Prim} from './drawingPrims';

export type ViewRow={id:string;mark:string;diameter:number;note:string;count:number;paths:Vec3[][]};
/** `columns`: footing pedestal / starter plan section (normal = 2) with only the column outlines and column bars. */
export type ViewSpec={axes:[number,number];normal?:number;cut?:number;columns?:boolean};
type Rect={u0:number;u1:number;v0:number;v1:number;kind:'concrete'|'context'|'lean'|'sand'|'pile';circle?:boolean};
type Pile={u:number;v:number;square:boolean;size:number;hollow:boolean};
type Line={a:[number,number];b:[number,number]};
export const barPalette=['#167561','#c2410c','#2563eb','#9333ea','#b45309','#0e7490','#be123c','#4d7c0f','#7c3aed','#0369a1','#a16207','#15803d'];
export const markColors=(rows:{id:string}[])=>new Map(rows.map((r,i)=>[r.id,barPalette[i%barPalette.length]]));
const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');

function circleIds(input?:ElementInput){
 const ids=new Set<string>();
 if(input?.category==='Column'&&input.shape==='circle')ids.add('main');
 if(input?.category==='Foundation')footingColumns(input).forEach((c,ci)=>{if(c.shape!=='circle')return;
  if(ci){ids.add(`pedestal-c${ci+1}-1`);ids.add(`context_gencol-c${ci+1}-1`);}else{ids.add('pedestal');ids.add('pedestal1');ids.add('context_gencol1');}});
 return ids;
}
function leanRect(m:Member,a:number,b:number,normal:number|undefined,cut:number|undefined):Rect[]{
 const o=[(m.x-m.lean.x)/2,(m.y-m.lean.y)/2,-m.lean.thickness],s=[m.lean.x,m.lean.y,m.lean.thickness];
 if(normal!==undefined&&(cut!<o[normal]||cut!>o[normal]+s[normal]))return [];
 return [{u0:o[a],u1:o[a]+s[a],v0:o[b],v1:o[b]+s[b],kind:'lean'}];
}
/** Sand bed under the lean concrete (site work), centred on the element plan. */
function sandRect(m:Member,a:number,b:number,normal:number|undefined,cut:number|undefined):Rect[]{
 const sd=m.siteWork?.sand;if(!sd||sd.thickness<=0)return [];
 const o=[(m.x-sd.x)/2,(m.y-sd.y)/2,-m.lean.thickness-sd.thickness],s=[sd.x,sd.y,sd.thickness];
 if(normal!==undefined&&(cut!<o[normal]||cut!>o[normal]+s[normal]))return [];
 return [{u0:o[a],u1:o[a]+s[a],v0:o[b],v1:o[b]+s[b],kind:'sand'}];
}
/** Thickness under the concrete down to the pit bottom: lean + sand (mm). */
const underside=(m:Member)=>m.lean.thickness+(m.siteWork?.sand.thickness||0);

/** Geometry of one view (plan when `normal` is undefined, otherwise a section at `cut`). */
export function buildView(m:Member,rows:ViewRow[],input:ElementInput|undefined,{axes,normal,cut,columns}:ViewSpec){
 const [a,b]=axes,round=circleIds(input),rects:Rect[]=[],guides:Line[]=[];
 // Footing concrete comes from the true plan outline (circle / polygons / L / U), not the bounding box.
 const only=!!columns&&input?.category==='Foundation'&&normal===2,foot=input?.category==='Foundation'&&!only?footingOutline(input):undefined,polys:Pt[][]=[],refs:Pt[][]=[],piles:Pile[]=[];
 if(only){rows=rows.filter(r=>/column-(main|tie)/.test(r.id));const fe=footingExtent(input);
  for(const c of footingColumns(input)){const {w,d}=columnExtent(c),ox=(fe.w-w)/2+c.offsetX,oy=(fe.d-d)/2+c.offsetY;(input.column.type==='pedestal'?polys:refs).push(columnOutline(c).map(([x,y])=>[ox+x,oy+y] as Pt));}}
 const isFooting=(id:string)=>!!foot&&(id==='main'||id.startsWith('footing'));
 const boxes=only?[]:[...solidsOf(m).filter(s=>!isFooting(s.id)).map(s=>({s,kind:'concrete' as const})),...contextSolids(m).map(s=>({s,kind:'context' as const}))];
 const sm=m.shapeModel,earth=m.category==='Foundation'||!!sm?.site,holes:Pt[][]=[],edges:Line[]=[];
 if(!only){if(m.lean.thickness>0)rects.push(...leanRect(m,a,b,normal,cut));
 rects.push(...sandRect(m,a,b,normal,cut));}
 // shape model: plan = footprint (holes white) + thin outlines of every part; section = cut rectangles per level band
 if(sm){
  if(normal===undefined){const r=shapePlanRings(sm);polys.push(...r.outer);holes.push(...r.holes);
   for(const p of sm.parts)for(const ring of partPolygon(p))ring.forEach((q,i)=>{const n=ring[(i+1)%ring.length];edges.push({a:[q[a],q[b]],b:[n[a],n[b]]});});}
  else for(const r of shapeSectionRects(sm,a as 0|1,cut!))rects.push({u0:r.u0,u1:r.u1,v0:r.z0,v1:r.z1,kind:'concrete'});
  const p=sm.piles;if(p){const h=p.size/2,bottom=-m.lean.thickness-700,square=p.type==='square';
   for(const [x,y] of p.positions){if(normal===undefined){piles.push({u:[x,y][a],v:[x,y][b],square,size:p.size,hollow:false});continue;}
    const along=normal===1?y:x,dz=Math.abs(along-cut!);if(dz>h)continue;const half=square?h:Math.sqrt(h*h-dz*dz),u=normal===1?x:y;rects.push({u0:u-half,u1:u+half,v0:bottom,v1:p.embed,kind:'pile'});}}
 }
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
 const e=m.excavation,ground=e.depth-underside(m);
 if(earth&&e.depth>0&&!only){
  if(normal===undefined){for(const [wx,wy] of [[e.topX,e.topY],[e.bottomX,e.bottomY]]){const u0=(m.x-wx)/2,v0=(m.y-wy)/2;guides.push({a:[u0,v0],b:[u0+wx,v0]},{a:[u0+wx,v0],b:[u0+wx,v0+wy]},{a:[u0+wx,v0+wy],b:[u0,v0+wy]},{a:[u0,v0+wy],b:[u0,v0]});}}
  else{const size=a===0?m.x:m.y,bw=a===0?e.bottomX:e.bottomY,tw=a===0?e.topX:e.topY,z0=-underside(m);guides.push({a:[(size-bw)/2,z0],b:[(size+bw)/2,z0]},{a:[(size-bw)/2,z0],b:[(size-tw)/2,ground]},{a:[(size+bw)/2,z0],b:[(size+tw)/2,ground]},{a:[(size-tw)/2-300,ground],b:[(size+tw)/2+300,ground]});}
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
    // also a bar standing on the cut plane with a leg turned out of it (corner starter bar with a diagonal foot)
    if(total>0&&(along>=.8*total||along>=.6*total&&Math.abs(weighted/along-cut!)<1)){inPlane.push({v:weighted/along,lines:all.filter(l=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1])>.5)});continue;}
    const extent=(k:number)=>Math.max(...p.map(q=>q[k]))-Math.min(...p.map(q=>q[k])),planar=extent(a)<1||extent(b)<1;
    if(planar&&hits.length>=2){const k=extent(b)<1?0:1,sorted=hits.sort((x,y)=>x[k]-y[k]);lines.push({a:sorted[0],b:sorted.at(-1)!});}else dots.push(...hits);
   }
   const values=[...new Set(inPlane.map(c=>Math.round(c.v*2)/2))].sort((x,y)=>x-y);
   if(values.length){const near=values.reduce((best,v)=>Math.abs(v-cut!)<Math.abs(best-cut!)?v:best,values[0]),gap=values.length>1?Math.max(...values.slice(1).map((v,i)=>v-values[i])):Infinity;
    if(Math.abs(near-cut!)<=gap/2+1)lines.push(...inPlane.filter(c=>Math.abs(c.v-near)<.75).flatMap(c=>c.lines));}
  }
  // coupler at the top end of footing column bars (vertical sections): a box centred on the bar end
  const couplers:[number,number][]=[];
  const ce=barCouplerEnds(input,r.id);
  if(normal!==undefined&&normal!==2&&(ce.top||ce.bottom)){const zs=r.paths.flatMap(p=>p.map(q=>q[2])),zTop=Math.max(...zs),zBot=Math.min(...zs);
   for(const l of lines){if(Math.abs(l.a[0]-l.b[0])>=.5)continue;const hi=l.a[1]>l.b[1]?l.a:l.b,lo=hi===l.a?l.b:l.a;
    if(ce.top&&Math.abs(hi[1]-zTop)<1)couplers.push(hi);if(ce.bottom&&Math.abs(lo[1]-zBot)<1)couplers.push(lo);}}
  return {row:r,lines,dots,couplers};
 });
 // footing sections: construction joints between pour stages, stage names, level marks (T.O.F. / B.O.F. / C.J. / NGL)
 const joints:{v:number;u0:number;u1:number}[]=[],stageText:{u0:number;u1:number;v0:number;v1:number;text:string}[]=[],levels:{u:number;v:number;text:string}[]=[];
 if(normal!==undefined&&!only&&input?.category==='Foundation'){
  const pr=footingPour(input),conc=rects.filter(r=>r.kind==='concrete'),T=input.thickness,ord=['First','Second','Third','Fourth','Fifth','Sixth'];
  const right=(z:number)=>Math.max(...conc.filter(r=>r.v0-1e-6<=z&&z<=r.v1+1e-6).map(r=>r.u1),-Infinity);
  if(pr.stages.length>1){
   for(const J of pr.levels)for(const r of conc)if(r.v0-1e-6<=J&&J<r.v1-1e-6)joints.push({v:J,u0:r.u0,u1:r.u1});
   for(const st of pr.stages){const band=conc.filter(r=>r.v0<st.z1-1e-6&&r.v1>st.z0+1e-6);if(!band.length)continue;const wide=band.reduce((x,y)=>y.u1-y.u0>x.u1-x.u0?y:x);
    stageText.push({u0:wide.u0,u1:wide.u1,v0:Math.max(st.z0,wide.v0),v1:Math.min(st.z1,wide.v1),text:`${ord[st.stage-1]||`Stage ${st.stage}`}-stage concrete pouring`});}}
  if(input.levels.enabled){const lv=footingLevels(input),sg=(x:number)=>`${x>0?'+':x<0?'−':'±'}${Math.abs(x).toFixed(3)}`,at=(z:number,t:string)=>{const u=right(z);if(Number.isFinite(u))levels.push({u,v:z,text:`${t} ${sg(lv.bottom+z/1000)}`});};
   at(T,'T.O.F.');at(0,'B.O.F.');for(const J of pr.stages.length>1?pr.levels:[])if(Math.abs(J-T)>1)at(J,'C.J.');
   const Hp=input.column.type==='pedestal'?Math.max(0,...footingColumns(input).map(c=>c.height)):0;if(Hp>0)at(T+Hp,'T.O.P.');
   if(earth&&e.depth>0){const u=Math.max(...conc.map(r=>r.u1));levels.push({u:u+300,v:ground,text:`NGL ${sg(input.levels.ground)}`});}}
 }
 // single column poured in two stages: joint below the beam, stage names, B.O.C. / C.J. / T.O.C. levels
 if(normal!==undefined&&normal!==2&&input?.category==='Column'&&input.layout!=='stack'){const cp=columnPour(input);
  if(cp.on){const conc=rects.filter(r=>r.kind==='concrete'),H=input.height,ord=['First','Second'],sg=(x:number)=>`${x>0?'+':x<0?'−':'±'}${Math.abs(x).toFixed(3)}`;
   const right=(z:number)=>Math.max(...conc.filter(r=>r.v0-1e-6<=z&&z<=r.v1+1e-6).map(r=>r.u1),-Infinity),at=(z:number,t:string)=>{const u=right(z);if(Number.isFinite(u))levels.push({u,v:z,text:`${t} ${sg(cp.bottom+z/1000)}`});};
   for(const r of conc)if(r.v0<cp.z&&cp.z<r.v1)joints.push({v:cp.z,u0:r.u0,u1:r.u1});
   const wide=conc.reduce<Rect|undefined>((x,y)=>!x||y.u1-y.u0>x.u1-x.u0?y:x,undefined);
   if(wide)[[0,cp.z],[cp.z,H]].forEach(([z0,z1],k)=>stageText.push({u0:wide.u0,u1:wide.u1,v0:z0,v1:z1,text:`${ord[k]}-stage concrete pouring`}));
   at(H,'T.O.C.');at(cp.z,'C.J.');at(0,'B.O.C.');}
 }
 // concrete cover C: footing bottom / top / side and pedestal side (sections), column side (Z–Z section)
 const covers:{a:[number,number];b:[number,number];text:string}[]=[];
 if(normal!==undefined&&input?.category==='Foundation'){const c=input.cover,T=input.thickness,C=(v:number)=>`C=${Math.round(v)}`;
  if(only){const p=[...polys,...refs][0],col=footingColumns(input)[0];if(p&&col){const x0=Math.min(...p.map(q=>q[0])),ys=p.map(q=>q[1]),y=(Math.min(...ys)+Math.max(...ys))/2;covers.push({a:[x0,y],b:[x0+col.cover,y],text:C(col.cover)});}}
  else{const conc=rects.filter(r=>r.kind==='concrete'),f=conc.filter(r=>r.v0<1&&r.v1>T-1).sort((p,q)=>(q.u1-q.u0)-(p.u1-p.u0))[0];
   if(f){const u=f.u0+(f.u1-f.u0)*.12;covers.push({a:[u,0],b:[u,c.bottom],text:C(c.bottom)},{a:[f.u0,T*.5],b:[f.u0+c.side,T*.5],text:C(c.side)});
    if(!footingSlabOn(input))covers.push({a:[u,T-c.top],b:[u,T],text:C(c.top)});}
   const ped=input.column.type==='pedestal'?conc.filter(r=>r.v0>T-1&&r.v0<T+1).sort((p,q)=>p.u0-q.u0)[0]:undefined;
   if(ped)covers.push({a:[ped.u0,T+(ped.v1-T)*.75],b:[ped.u0+input.column.cover,T+(ped.v1-T)*.75],text:C(input.column.cover)});}
 }
 // beam group (plan / elevation): dashed column faces + grid centre lines, and dimensions of the EX bars
 const beamCols:{g:number;x0:number;x1:number;label:string;lo:number;hi:number}[]=[],exDims:{id:string;mark:string;top:boolean;stops:number[]}[]=[];
 let band:[number,number]|undefined;
 if(!only&&a===0&&(b===1||b===2)&&input?.category==='Beam'&&input.layout==='group'&&input.spans.length){
  const lay=beamGroupLayout(input);band=b===2?[0,lay.H]:[0,lay.W];const ext=Math.max(300,band[1]-band[0]);
  lay.grid.forEach((g,k)=>{const c=lay.columns.find(q=>q.k===k);beamCols.push({g,x0:c?.x0??g,x1:c?.x1??g,label:input.grids[k]?.label||'',lo:band![0]-ext,hi:band![1]+ext});});
  const faces=lay.columns.flatMap(c=>[c.x0,c.x1]);
  for(const r of rows){const t=r.id.match(/-ex-(?:mid-)?(top|bottom)/),p=r.paths[0];if(!t||!p)continue;const xs=p.map(q=>q[0]),xa=Math.min(...xs),xb=Math.max(...xs);
   exDims.push({id:r.id,mark:r.mark,top:t[1]==='top',stops:[xa,...faces.filter(x=>x>xa+1&&x<xb-1),xb]});}
 }
 const us=[...beamCols.flatMap(c=>[c.x0,c.x1]),...rects.flatMap(r=>[r.u0,r.u1]),...[...polys,...refs].flat().map(p=>p[0]),...piles.flatMap(p=>[p.u-p.size/2,p.u+p.size/2]),...guides.flatMap(g=>[g.a[0],g.b[0]]),...bars.flatMap(x=>[...x.lines.flatMap(l=>[l.a[0],l.b[0]]),...x.dots.map(d=>d[0])])];
 const vs=[...beamCols.flatMap(c=>[c.lo,c.hi]),...rects.flatMap(r=>[r.v0,r.v1]),...[...polys,...refs].flat().map(p=>p[1]),...piles.flatMap(p=>[p.v-p.size/2,p.v+p.size/2]),...guides.flatMap(g=>[g.a[1],g.b[1]]),...bars.flatMap(x=>[...x.lines.flatMap(l=>[l.a[1],l.b[1]]),...x.dots.map(d=>d[1])])];
 return {member:m,input,axes,normal,cut,rects,polys,refs,holes,edges,piles,guides,bars,joints,stageText,levels,covers,beamCols,exDims,band,u:(only?[Math.min(...us),Math.max(...us)]:[Math.min(0,...us),Math.max(1,...us)]) as [number,number],v:(only?[Math.min(...vs),Math.max(...vs)]:[Math.min(0,...vs),Math.max(1,...vs)]) as [number,number],ground:normal!==undefined&&!only&&earth&&e.depth>0?ground:undefined,columns:only};
}
export type ViewData=ReturnType<typeof buildView>;

type DimSpec={dir:'h'|'v';stops:number[];side:'start'|'end'};
/** Chained dimensions per view from the member / input (not measured from the drawing). */
function dimensionSets(m:Member,input:ElementInput|undefined,axes:[number,number],normal?:number,columns=false):DimSpec[]{
 const [a,b]=axes,size=[m.x,m.y,m.z];
 // pedestal / starter section: faces of every column along each axis
 if(columns&&input?.category==='Foundation'){const fe=footingExtent(input),cols=footingColumns(input),faces=(axis:number)=>cols.flatMap(c=>{const e=columnExtent(c),size=axis?e.d:e.w,total=axis?fe.d:fe.w,off=axis?c.offsetY:c.offsetX;return [(total-size)/2+off,(total+size)/2+off];});
  return [{dir:'h',stops:faces(a),side:'start'},{dir:'v',stops:faces(b),side:'start'}];}
 const out:DimSpec[]=[{dir:'h',stops:[0,size[a]],side:'start'}];
 // beam group: grid to grid (c/c spans) above the beam
 if(a===0&&b!==0&&input?.category==='Beam'&&input.layout==='group'&&input.spans.length)out.push({dir:'h',stops:beamGroupLayout(input).grid,side:'end'});
 if(normal===undefined)out.push({dir:'v',stops:[0,size[b]],side:'start'});
 // shape model: chain of every part edge along each axis and every level in sections (dimensions come from the model)
 if(m.shapeModel){const sm=m.shapeModel,stops=(axis:number)=>{const vs=sm.parts.flatMap(p=>{const e=partExtent(p);return p.shape==='circle'?[e[axis],e[axis+2],axis?p.cy:p.cx]:partPolygon(p)[0].map(q=>q[axis]);});return [...new Set(vs.map(v=>Math.round(v)))].filter(v=>v>=0&&v<=size[axis]).sort((x,y)=>x-y).slice(0,12);};
  out.push({dir:'h',stops:stops(a),side:'end'});
  if(normal===undefined)out.push({dir:'v',stops:stops(b),side:'end'});
  else{const zs=[...new Set(sm.parts.flatMap(p=>[p.z0,p.z0+p.height]))].sort((x,y)=>x-y);out.push({dir:'v',stops:[...new Set([...(underside(m)>m.lean.thickness?[-underside(m)]:[]),...(m.lean.thickness>0?[-m.lean.thickness]:[]),...zs])],side:'start'});if(m.excavation.depth>0)out.push({dir:'v',stops:[-underside(m),m.excavation.depth-underside(m)],side:'end'});}
  return out;}
 if(input?.category==='Foundation'){
  const col=input.column,T=input.thickness,H=col.type==='pedestal'?col.height:0;
  if(col.type!=='none'){
   // dimension chain: footing edges + both faces of every column along the axis
   const fe=footingExtent(input),cols=footingColumns(input),chain=(axis:number)=>{const total=axis===0?fe.w:fe.d;
    return [...new Set([0,total,...cols.flatMap(c=>{const e=c.shape==='circle'?c.diameter:axis===0?c.width:c.depth,off=axis===0?c.offsetX:c.offsetY;return [(total-e)/2+off,(total+e)/2+off];})].map(v=>Math.round(v*10)/10))].sort((x,y)=>x-y);};
   out.push({dir:'h',stops:chain(a),side:'end'});
   if(normal===undefined)out.push({dir:'v',stops:chain(b),side:'end'});
  }
  if(normal!==undefined){
   const zs=[0,T,...footingPour(input).levels,...(H>0?[T+H]:[]),...(col.type!=='none'&&col.projection>0?[T+H+col.projection]:[])];
   out.push({dir:'v',stops:[...new Set([...(underside(m)>m.lean.thickness?[-underside(m)]:[]),...(m.lean.thickness>0?[-m.lean.thickness]:[]),...zs])],side:'start'});
   if(m.excavation.depth>0)out.push({dir:'v',stops:[-underside(m),m.excavation.depth-underside(m)],side:'end'});
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
export function renderView(v:ViewData,box:{x:number;y:number;w:number;h:number},opts:{k?:number;colors:Map<string,string>;cuts?:{x:number;y:number};zCut?:number;fontScale?:number}):Prim[]{
 const k=opts.k??1,fs=opts.fontScale??1,M=48*k,{u,v:vr}=v,spanU=u[1]-u[0],spanV=vr[1]-vr[0];
 // level marks sit right of the concrete: keep room for their text inside the box
 const lvW=v.levels.length?Math.max(...v.levels.map(l=>textWidth(l.text,9*k*fs)))+16*k:0;
 const s=Math.min((box.w-2*M-lvW)/spanU,(box.h-2*M)/spanV),offU=(box.w-2*M-lvW-spanU*s)/2,offV=(box.h-2*M-spanV*s)/2;
 const X=(x:number)=>box.x+M+offU+(x-u[0])*s,Y=(y:number)=>box.y+box.h-M-offV-(y-vr[0])*s,out:Prim[]=[];
 const style:Record<Rect['kind'],{fill?:string;stroke:string;width:number;dash?:number[]}>={concrete:{fill:'#e9efec',stroke:'#51706a',width:1.2*k},lean:{fill:'#dcd8cf',stroke:'#8a857a',width:.8*k},sand:{fill:'#f3e6bf',stroke:'#b39552',width:.8*k},context:{stroke:'#d07a2d',width:1*k,dash:[5*k,3*k]},pile:{fill:'#cfc6b6',stroke:'#6b5b45',width:1*k}};
 const rect=(r:Rect)=>out.push(r.circle?{t:'ellipse',cx:X((r.u0+r.u1)/2),cy:Y((r.v0+r.v1)/2),rx:(r.u1-r.u0)/2*s,ry:(r.v1-r.v0)/2*s,...style[r.kind]}:{t:'rect',x:X(r.u0),y:Y(r.v1),w:(r.u1-r.u0)*s,h:(r.v1-r.v0)*s,...style[r.kind]});
 v.rects.filter(r=>r.kind==='sand').forEach(rect);
 v.rects.filter(r=>r.kind==='lean').forEach(rect);
 for(const p of v.polys)out.push({t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])]),closed:true,...style.concrete});
 // starter bars: the column above is a reference outline (dashed), not concrete of this element
 for(const p of v.refs)out.push({t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])]),closed:true,...style.context});
 for(const p of v.holes)out.push({t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])]),closed:true,fill:'#ffffff',stroke:style.concrete.stroke,width:style.concrete.width});
 for(const g of v.edges)out.push({t:'line',x1:X(g.a[0]),y1:Y(g.a[1]),x2:X(g.b[0]),y2:Y(g.b[1]),stroke:'#7d9690',width:.5*k});
 for(const p of v.piles){const dash=[4*k,2*k];if(p.square)out.push({t:'rect',x:X(p.u-p.size/2),y:Y(p.v+p.size/2),w:p.size*s,h:p.size*s,stroke:'#6b5b45',width:k,dash});else{out.push({t:'circle',cx:X(p.u),cy:Y(p.v),r:p.size/2*s,stroke:'#6b5b45',width:k,dash});if(p.hollow)out.push({t:'circle',cx:X(p.u),cy:Y(p.v),r:p.size/4*s,stroke:'#6b5b45',width:k,dash});}}
 v.rects.filter(r=>r.kind!=='lean'&&r.kind!=='sand').forEach(rect);
 for(const g of v.guides)out.push({t:'line',x1:X(g.a[0]),y1:Y(g.a[1]),x2:X(g.b[0]),y2:Y(g.b[1]),stroke:'#a07b54',width:.8*k,dash:[6*k,4*k]});
 if(v.ground!==undefined&&!v.levels.length)out.push({t:'text',x:X(u[1]),y:Y(v.ground)-4*k,text:'ระดับดิน',size:10*k*fs,color:'#8a6a45',anchor:'end'});
 // pour stages: joint lines (red dashed) and the stage names; level marks: ▽ + text right of the concrete face
 for(const j of v.joints)out.push({t:'line',x1:X(j.u0),x2:X(j.u1),y1:Y(j.v),y2:Y(j.v),stroke:'#c0392b',width:1.1*k,dash:[6*k,3*k]});
 for(const l of v.levels){const x=X(l.u)+10*k,y=Y(l.v),h=5*k;
  out.push({t:'line',x1:X(l.u),x2:x+textWidth(l.text,9*k*fs)+4*k,y1:y,y2:y,stroke:'#3f5459',width:.6*k},{t:'poly',pts:[[x,y],[x-h*.6,y-h],[x+h*.6,y-h]],closed:true,stroke:'#3f5459',width:.6*k},{t:'text',x:x+h,y:y-2*k,text:l.text,size:9*k*fs,color:'#3f5459',halo:true});}
 const cuts=opts.cuts;
 if(cuts){const cs={stroke:'#7c8b8f',width:.8*k,dash:[10*k,3*k,2*k,3*k]};out.push({t:'line',x1:X(u[0]),x2:X(u[1]),y1:Y(cuts.y),y2:Y(cuts.y),...cs},{t:'line',x1:X(cuts.x),x2:X(cuts.x),y1:Y(vr[0]),y2:Y(vr[1]),...cs});
  const ts={size:11*k*fs,color:'#5b6b70',bold:true};out.push({t:'text',x:X(u[0])-6*k,y:Y(cuts.y)+4*k,text:'X',anchor:'end',...ts},{t:'text',x:X(u[1])+6*k,y:Y(cuts.y)+4*k,text:'X',...ts},{t:'text',x:X(cuts.x),y:Y(vr[1])-6*k,text:'Y',anchor:'middle',...ts},{t:'text',x:X(cuts.x),y:Y(vr[0])+14*k,text:'Y',anchor:'middle',...ts});}
 // level of the pedestal / starter plan section (Z–Z) on the vertical sections
 if(opts.zCut!==undefined&&v.normal!==undefined&&v.normal!==2&&opts.zCut>vr[0]&&opts.zCut<vr[1]){const y=Y(opts.zCut),ts={size:11*k*fs,color:'#5b6b70',bold:true};
  out.push({t:'line',x1:X(u[0]),x2:X(u[1]),y1:y,y2:y,stroke:'#7c8b8f',width:.8*k,dash:[10*k,3*k,2*k,3*k]},{t:'text',x:X(u[0])-6*k,y:y+4*k,text:'Z',anchor:'end',...ts},{t:'text',x:X(u[1])+6*k,y:y+4*k,text:'Z',...ts});}
 // Mark labels: start near the bar, then move down until they no longer overlap a placed label.
 // Marks split by bar length (gen-bottom-x-1, -2, …) share one label "F01–F08".
 const placed:{x:number;y:number;w:number}[]=[],family=(id:string)=>id.replace(/^(gen-(?:bottom|top)-[xy])-\d+$/,'$1'),labelled=new Set<string>();
 const size=10*k*fs,step=size*1.15;
 for(const {row,lines,dots,couplers} of v.bars){
  const color=opts.colors.get(row.id)||'#167561',w=Math.max(k,row.diameter*s);
  for(const l of lines)out.push({t:'line',x1:X(l.a[0]),y1:Y(l.a[1]),x2:X(l.b[0]),y2:Y(l.b[1]),stroke:color,width:w,cap:'round',group:row.id});
  for(const d of dots)out.push({t:'circle',cx:X(d[0]),cy:Y(d[1]),r:Math.max((v.columns?3:1.6)*k,row.diameter*s/2),fill:color,group:row.id});
  for(const c of couplers){const cw=Math.max(4.5*k,row.diameter*1.6*s),ch=Math.max(9*k,row.diameter*3*s);out.push({t:'rect',x:X(c[0])-cw/2,y:Y(c[1])-ch/2,w:cw,h:ch,fill:'#ffffff',stroke:color,width:.9*k,group:row.id},{t:'line',x1:X(c[0])-cw/2,x2:X(c[0])+cw/2,y1:Y(c[1]),y2:Y(c[1]),stroke:color,width:.6*k,group:row.id});}
  const fam=family(row.id);if(labelled.has(fam))continue;
  const p=lines[0]?[(lines[0].a[0]+lines[0].b[0])/2,(lines[0].a[1]+lines[0].b[1])/2]:dots[0];if(!p)continue;labelled.add(fam);
  const marks=fam!==row.id?v.bars.filter(x=>family(x.row.id)===fam).map(x=>x.row.mark):[row.mark],text=marks.length>1?`${marks[0]}–${marks.at(-1)}`:row.mark;
  const ax=X(p[0]),ay=Y(p[1]),tw=textWidth(text,size);let x=ax+8*k,y=ay-8*k;
  for(let n=0;n<30&&placed.some(q=>x<q.x+q.w+2*k&&q.x<x+tw+2*k&&Math.abs(q.y-y)<step);n++)y+=step;
  placed.push({x,y,w:tw});
  out.push({t:'line',x1:ax,y1:ay,x2:x,y2:y-3*k,stroke:color,width:.5*k,group:row.id},{t:'text',x:x+2*k,y,text,size,color,bold:true,halo:true,group:row.id});
 }
 // one "COUPLER" label per view, left of the leftmost coupler
 const cp=v.bars.flatMap(b=>b.couplers).sort((p,q)=>p[0]-q[0])[0];
 if(cp){const x=X(cp[0])-10*k,y=Y(cp[1])-12*k;out.push({t:'line',x1:X(cp[0])-3*k,y1:Y(cp[1])-3*k,x2:x,y2:y,stroke:'#3f5459',width:.5*k},{t:'text',x:x-2*k,y:y+3*k,text:'COUPLER',size:8.5*k*fs,color:'#3f5459',bold:true,anchor:'end',halo:true});}
 // cover C: short dimension with ticks, value beside it (right of a vertical one, above a horizontal one)
 for(const c of v.covers){const x1=X(c.a[0]),y1=Y(c.a[1]),x2=X(c.b[0]),y2=Y(c.b[1]),vert=Math.abs(x1-x2)<.5,t=2.5*k,st={stroke:'#7a3e9d',width:.6*k};
  out.push({t:'line',x1,y1,x2,y2,...st},...(vert?[{t:'line' as const,x1:x1-t,x2:x1+t,y1,y2:y1,...st},{t:'line' as const,x1:x2-t,x2:x2+t,y1:y2,y2,...st}]:[{t:'line' as const,x1,x2:x1,y1:y1-t,y2:y1+t,...st},{t:'line' as const,x1:x2,x2,y1:y2-t,y2:y2+t,...st}]),
   {t:'text',x:vert?x1+4*k:Math.max(x1,x2)+3*k,y:vert?(y1+y2)/2+3*k:y1-3*k,text:c.text,size:8*k*fs,color:'#7a3e9d',bold:true,halo:true});}
 // beam group: column faces (dashed), grid centre lines (dash-dot) with bubbles at the bottom, EX bar dimensions
 for(const c of v.beamCols){const y0=Y(c.lo),y1=Y(c.hi),cs={stroke:'#d07a2d',width:.7*k,dash:[5*k,3*k]};
  if(c.x1-c.x0>1)out.push({t:'line',x1:X(c.x0),x2:X(c.x0),y1:y0,y2:y1,...cs},{t:'line',x1:X(c.x1),x2:X(c.x1),y1:y0,y2:y1,...cs});
  out.push({t:'line',x1:X(c.g),x2:X(c.g),y1:y0,y2:y1,stroke:'#7c8b8f',width:.5*k,dash:[10*k,3*k,2*k,3*k]});
  if(c.label){const r=5.5*k,cy=y0+r+1.5*k;out.push({t:'circle',cx:X(c.g),cy,r,stroke:'#4a5a66',width:.6*k,fill:'#ffffff'},{t:'text',x:X(c.g),y:cy+3*k*fs,text:c.label,size:8*k*fs,color:'#22393f',anchor:'middle'});}}
 if(v.band)for(const {d,row} of exDimRows(v.exDims)){const x0=d.stops[0],x1=d.stops.at(-1)!;
   const color=opts.colors.get(d.id)||'#3f5459',y=d.top?Y(v.band[1])-(9+row*9)*k:Y(v.band[0])+(9+row*9)*k,st={stroke:color,width:.6*k},ds=7.5*k*fs;
   out.push({t:'line',x1:X(x0),x2:X(x1),y1:y,y2:y,...st});
   for(const p of d.stops)out.push({t:'line',x1:X(p)-2*k,x2:X(p)+2*k,y1:y+2*k,y2:y-2*k,...st});
   d.stops.slice(1).forEach((p,i)=>{const a=d.stops[i],t=fmt(p-a);if(X(p)-X(a)>textWidth(t,ds)+2*k)out.push({t:'text',x:(X(p)+X(a))/2,y:y-1.5*k,text:t,size:ds,color,anchor:'middle',halo:true});});
   out.push({t:'text',x:X(x0)-3*k,y:y+2.5*k,text:d.mark,size:ds,color,bold:true,anchor:'end',halo:true});}
 // Dimensions.
 const line={stroke:'#5f7378',width:.7*k},dsize=10*k*fs;
 for(const d of dimensionSets(v.member,v.input,v.axes,v.normal,v.columns)){
  const pts=[...new Set(d.stops.map(n=>Math.round(n*10)/10))].sort((p,q)=>p-q);if(pts.length<2)continue;
  if(d.dir==='h'){const y=d.side==='start'?Y(vr[0])+22*k:Y(vr[1])-16*k;for(const p of pts)out.push({t:'line',x1:X(p),x2:X(p),y1:y-5*k,y2:y+5*k,...line});out.push({t:'line',x1:X(pts[0]),x2:X(pts.at(-1)!),y1:y,y2:y,...line});pts.slice(1).forEach((p,i)=>{if(X(p)-X(pts[i])>textWidth(fmt(p-pts[i]),dsize)+2*k)out.push({t:'text',x:(X(p)+X(pts[i]))/2,y:y-3*k,text:fmt(p-pts[i]),size:dsize,color:'#3f5459',anchor:'middle'});});}
  else{const x=d.side==='start'?X(u[0])-24*k:X(u[1])+24*k;for(const p of pts)out.push({t:'line',x1:x-5*k,x2:x+5*k,y1:Y(p),y2:Y(p),...line});out.push({t:'line',x1:x,x2:x,y1:Y(pts[0]),y2:Y(pts.at(-1)!),...line});pts.slice(1).forEach((p,i)=>{if(Y(pts[i])-Y(p)>dsize*1.2)out.push({t:'text',x:x+(d.side==='start'?-3*k:3*k),y:(Y(p)+Y(pts[i]))/2+3*k,text:fmt(p-pts[i]),size:dsize,color:'#3f5459',anchor:d.side==='start'?'end':'start'});});}
 }
 // Stage names last: framed text at the first spot inside its stage band (spread across, stepping up / down) that
 // clears every text already on the view (Marks, levels, dimensions); else beside the concrete with a leader.
 const ss=9*k*fs,pad=3*k,bh=ss+2*pad,taken=out.flatMap(p=>{if(p.t!=='text')return [];const w=textWidth(p.text,p.size),x=p.anchor==='middle'?p.x-w/2:p.anchor==='end'?p.x-w:p.x;return [{x0:x,x1:x+w,y0:p.y-p.size,y1:p.y+p.size*.25}];});
 for(const t of v.stageText){
  const tw=textWidth(t.text,ss)+2*pad,x0=X(t.u0),x1=X(t.u1),yt=Y(t.v1),yb=Y(t.v0),mid=(yt+yb)/2,fits=x1-x0>=tw+8*k;
  const free=(cx:number,cy:number)=>cx-tw/2>=box.x+2*k&&cx+tw/2<=box.x+box.w-2*k&&cy-bh/2>=box.y+2*k&&cy+bh/2<=box.y+box.h-2*k&&
   !taken.some(q=>cx-tw/2<q.x1+1.5*k&&q.x0<cx+tw/2+1.5*k&&cy-bh/2<q.y1+k&&q.y0<cy+bh/2+k);
  const steps=Array.from({length:20},(_,n)=>mid+Math.ceil(n/2)*bh*.75*(n%2?-1:1)),inBand=steps.filter(cy=>cy-bh/2>=yt-1e-6&&cy+bh/2<=yb+1e-6);
  const across=fits?[.5,.25,.75,.15,.85,.35,.65].map(f=>Math.min(x1-tw/2-4*k,Math.max(x0+tw/2+4*k,x0+(x1-x0)*f))):[];
  const cands:[number,number][]=[...inBand.flatMap(cy=>across.map(cx=>[cx,cy] as [number,number])),...steps.flatMap(cy=>[[x0-tw/2-12*k,cy],[x1+tw/2+12*k,cy]] as [number,number][])];
  const [cx,cy]=cands.find(([x,y])=>free(x,y))??(inBand.length&&across.length?[across[0],inBand[0]]:[(x0+x1)/2,mid]);
  if(cx+tw/2<=x0||cx-tw/2>=x1)out.push({t:'line',x1:cx+(cx<x0?tw/2:-tw/2),y1:cy,x2:(x0+x1)/2,y2:mid,stroke:'#8a4a3f',width:.5*k});
  out.push({t:'rect',x:cx-tw/2,y:cy-bh/2,w:tw,h:bh,stroke:'#8a4a3f',width:.5*k,dash:[3*k,2*k]},{t:'text',x:cx,y:cy+ss*.35,text:t.text,size:ss,color:'#8a4a3f',anchor:'middle',halo:true});
  taken.push({x0:cx-tw/2,x1:cx+tw/2,y0:cy-bh/2,y1:cy+bh/2});
 }
 const axisName=['X','Y','Z'];
 out.push({t:'text',x:box.x+box.w-6*k,y:box.y+box.h-6*k,text:`${axisName[v.axes[0]]} → · ${axisName[v.axes[1]]} ↑`,size:9*k*fs,color:'#9aa8a6',anchor:'end'});
 return out;
}

/** Rows of the beam EX bar dimensions (above the beam for top bars, below for bottom bars; overlapping bars stack). */
export function exDimRows<D extends {top:boolean;stops:number[]}>(dims:D[]){
 const used:{top:boolean;x0:number;x1:number;row:number}[]=[];
 return [...dims].sort((p,q)=>p.stops[0]-q.stops[0]).map(d=>{const x0=d.stops[0],x1=d.stops.at(-1)!;let row=0;while(used.some(u=>u.top===d.top&&u.row===row&&x0<u.x1+1&&u.x0<x1-1))row++;used.push({top:d.top,x0,x1,row});return {d,row};});
}
/** Level of the pedestal / starter plan section: mid-height of the pedestal (nearest tie set is drawn), or just above the
 * top of footing for starter bars (below their top end). Undefined when the footing has no column bars. */
export function columnSectionCut(input:ElementInput|undefined,rows:ViewRow[]):{z:number;kind:'pedestal'|'starter'}|undefined{
 if(input?.category!=='Foundation'||input.column.type==='none')return;
 const main=rows.filter(r=>/column-main/.test(r.id)&&r.paths.length);if(!main.length)return;
 const T=input.thickness,H=input.column.type==='pedestal'?Math.max(0,...footingColumns(input).map(c=>c.height)):0;
 if(H>0)return {z:T+H/2,kind:'pedestal'};
 const top=Math.min(...main.flatMap(r=>r.paths.map(p=>Math.max(...p.map(q=>q[2])))));
 return {z:Math.min(T+100,top-10),kind:'starter'};
}
/** Default cut positions: section X–X through the first column bar row (or member.sectionY), Y–Y likewise. */
export function defaultCuts(m:Member,rows:ViewRow[]){
 const top=rows.find(r=>r.id.startsWith('gen-column-main'))?.paths[0]?.at(-1);
 return {x:Math.min(m.x,Math.max(0,top?.[0]??m.x/2)),y:Math.min(m.y,Math.max(0,m.sectionY??m.y/2))};
}
