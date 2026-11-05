import type {Member,Vec3} from './model';
import {barCouplerEnds,beamGroupLayout,columnPour,columnExtent,columnOutline,footingColumns,footingExtent,footingLevels,footingOpenings,footingOutline,footingPour,footingSlabOn,lineIntervals,pilePositions,type ElementInput,type Pt} from './elementInput';
import {solidsOf} from './solids';
import {prismAxis,prismBounds,prismPoint,prismSection} from './prismGeometry';
import {contextSolids} from './placementContext';
import {partExtent,partPolygon,shapePlanRings,shapeSectionRects} from './shapeGeometry';
import {expandPrims,textWidth,type DimPrim,type LayerRole,type PlainPrim,type Prim} from './drawingPrims';
import type {Anchor,ViewEdits} from './drawingEdits';
import {clipPrims} from './primClip';
import {boundsOf} from './solids';
import {floorCtx,floorFocus,floorKind,floorLayerToken,floorRowLayer,isTopExtra,slabMarkOf,type FloorCtx} from './slabFloorSheet';

export type ViewRow={id:string;mark:string;diameter:number;note:string;count:number;paths:Vec3[][]};
/** `columns`: footing pedestal / starter plan section (normal = 2) with only the column outlines and column bars. */
/** layer = plan of the bottom or top bars only; rep = plan draws one representative bar per Mark plus its distribution line. */
/** tight = extents of the member itself (concrete, piles, bars) + a small margin: reference context (excavation, slab
 * around a footing) is clipped to it, so large drawing sheets show the member big */
/** Sections (Sheet Composer): look '-' = view from the other side (horizontal axis mirrored), depth = also show bars lying up
 * to `depth` mm beyond the cut in the viewing direction, extent = crop to that range along the cut line (+ a margin). */
export type ViewSpec={axes:[number,number];normal?:number;cut?:number;columns?:boolean;layer?:'bottom'|'top';rep?:boolean;tight?:boolean;look?:'+'|'-';depth?:number;extent?:[number,number];
 /** extent without the margin (pieces of a stepped section) */ exact?:boolean;
 /** Detail view: the parent view drawn around (u, v) within r mm (circle or square), cropped to it */ window?:{u:number;v:number;r:number;circle?:boolean};
 /** stepped section: from `from` (along the view's horizontal axis) the cut moves to `cut` */ steps?:{from:number;cut:number}[];
 /** isometric 3D view (concrete edges + bar centrelines) */ iso?:boolean;
 /** slab floor plan (S2): bars of one layer (or all), one representative bar per Mark per panel, grids / beams / other marks */
 floor?:{layer:'bottom'|'top'|'all'}};
type Rect={u0:number;u1:number;v0:number;v1:number;kind:'concrete'|'context'|'wall'|'lean'|'sand'|'pile';circle?:boolean};
type Pile={u:number;v:number;square:boolean;size:number;hollow:boolean};
type Line={a:[number,number];b:[number,number]};
export const barPalette=['#167561','#c2410c','#2563eb','#9333ea','#b45309','#0e7490','#be123c','#4d7c0f','#7c3aed','#0369a1','#a16207','#15803d'];
export const markColors=(rows:{id:string}[])=>new Map(rows.map((r,i)=>[r.id,barPalette[i%barPalette.length]]));
const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
/** Plan layer of a Mark: bars lying below / above mid-depth of the member; bars without a plan length (vertical) count as top. */
export function planLayerOf(m:Member,input:ElementInput|undefined,r:ViewRow):'bottom'|'top'{
 const flat=r.paths.some(p=>p.some((q,i)=>i>0&&Math.hypot(q[0]-p[i-1][0],q[1]-p[i-1][1])>=1));if(!flat)return 'top';
 const pts=r.paths.flat(),zm=pts.reduce((t,q)=>t+q[2],0)/Math.max(1,pts.length);
 return zm<(input?.category==='Foundation'?input.thickness:m.z)/2?'bottom':'top';
}
/** Bars of one Mark laid side by side at even spacing (translated copies in plan): the middle bar, the bar centres
 * at both ends and the spacing. Undefined when the bars are not a straight row (radial, single, mixed shapes). */
function distribution(paths:Vec3[][],a:number,b:number){
 if(paths.length<3)return;
 const c=paths.map((p,i)=>({i,u:p.reduce((t,q)=>t+q[a],0)/p.length,v:p.reduce((t,q)=>t+q[b],0)/p.length}));
 const ru=Math.max(...c.map(q=>q.u))-Math.min(...c.map(q=>q.u)),rv=Math.max(...c.map(q=>q.v))-Math.min(...c.map(q=>q.v));
 c.sort((p,q)=>ru>=rv?p.u-q.u:p.v-q.v);
 const f=c[0],l=c.at(-1)!,du=l.u-f.u,dv=l.v-f.v,len=Math.hypot(du,dv);if(len<1)return;
 // centres on one line (within 2 %) and every bar the same plan length
 if(c.some(q=>Math.abs((q.u-f.u)*dv-(q.v-f.v)*du)/len>Math.max(20,len*.02)))return;
 const plan=(p:Vec3[])=>p.slice(1).reduce((t,q,i)=>t+Math.hypot(q[a]-p[i][a],q[b]-p[i][b]),0),L0=plan(paths[0]);
 if(paths.some(p=>Math.abs(plan(p)-L0)>Math.max(5,L0*.02)))return;
 const mid=c[Math.floor(c.length/2)];
 return {path:paths[mid.i],first:[f.u-mid.u,f.v-mid.v] as [number,number],last:[l.u-mid.u,l.v-mid.v] as [number,number],spacing:len/(c.length-1),n:c.length};
}

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
// min / max of long coordinate lists (spreading them into Math.min overflows the call stack on large members)
const low=(a:number[],start=Infinity)=>a.reduce((m,v)=>v<m?v:m,start),high=(a:number[],start=-Infinity)=>a.reduce((m,v)=>v>m?v:m,start);
/** View data for a spec: plain view, Detail window (`window`), stepped section (`steps`: pieces merged) or ISO 3D (`iso`). */
export function buildView(m:Member,rows:ViewRow[],input:ElementInput|undefined,spec:ViewSpec):ViewData{
 if(spec.iso)return isoView(m,rows,input);
 if(spec.steps?.length&&spec.normal!==undefined&&spec.cut!==undefined){
  const full=buildViewOne(m,rows,input,{...spec,steps:undefined}),lo=spec.extent?.[0]??full.u[0],hi=spec.extent?.[1]??full.u[1];
  const st=spec.steps.filter(x=>x.from>lo+1&&x.from<hi-1).sort((a,b)=>a.from-b.from),cuts=[spec.cut,...st.map(x=>x.cut)],edges=[lo,...st.map(x=>x.from),hi];
  const parts=cuts.map((c,i)=>buildViewOne(m,rows,input,{...spec,steps:undefined,cut:c,extent:[edges[i],edges[i+1]],exact:true}));
  const base=spec.extent?full:buildViewOne(m,rows,input,{...spec,steps:undefined,extent:[lo,hi],exact:true}),join=<T,>(f:(d:ViewData)=>T[])=>parts.flatMap(f);
  const uniq=<T,>(xs:T[],key:(x:T)=>string)=>{const seen=new Set<string>();return xs.filter(x=>{const k=key(x);if(seen.has(k))return false;seen.add(k);return true;});};
  return {...base,rects:join(d=>d.rects),polys:join(d=>d.polys),refs:join(d=>d.refs),holes:join(d=>d.holes),edges:join(d=>d.edges),piles:join(d=>d.piles),guides:join(d=>d.guides),
   bars:join(d=>d.bars),joints:join(d=>d.joints),stageText:uniq(join(d=>d.stageText),t=>t.text),levels:uniq(join(d=>d.levels),l=>l.text),covers:join(d=>d.covers),
   u:[Math.min(...parts.map(d=>d.u[0])),Math.max(...parts.map(d=>d.u[1]))],v:[Math.min(...parts.map(d=>d.v[0])),Math.max(...parts.map(d=>d.v[1]))],
   cropped:true,stepAt:st.map(x=>base.flip?base.u[0]+base.u[1]-x.from:x.from)};}
 const d=buildViewOne(m,rows,input,spec);return spec.window?{...d,window:spec.window}:d;
}
/** Isometric 3D view (u = (x − y)·cos 30°, v = z + (x + y)·sin 30°): concrete box / outline edges and bar centrelines. */
function isoView(m:Member,rows:ViewRow[],input:ElementInput|undefined):ViewData{
 const c=Math.cos(Math.PI/6),P=(p:Vec3):[number,number]=>[(p[0]-p[1])*c,p[2]+(p[0]+p[1])*.5],edges:{a:[number,number];b:[number,number]}[]=[];
 const box=(o:Vec3,sz:Vec3)=>{const q=(i:number,j:number,k2:number):Vec3=>[o[0]+i*sz[0],o[1]+j*sz[1],o[2]+k2*sz[2]];
  for(const [a,b] of [[[0,0,0],[1,0,0]],[[1,0,0],[1,1,0]],[[1,1,0],[0,1,0]],[[0,1,0],[0,0,0]],[[0,0,1],[1,0,1]],[[1,0,1],[1,1,1]],[[1,1,1],[0,1,1]],[[0,1,1],[0,0,1]],[[0,0,0],[0,0,1]],[[1,0,0],[1,0,1]],[[1,1,0],[1,1,1]],[[0,1,0],[0,1,1]]] as [number,number,number][][])
   edges.push({a:P(q(a[0],a[1],a[2])),b:P(q(b[0],b[1],b[2]))});};
 const foot=input?.category==='Foundation'?footingOutline(input):undefined;
 if(foot){const T=input!.category==='Foundation'?input!.thickness:0;const ring=foot;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];
   edges.push({a:P([a[0],a[1],0]),b:P([b[0],b[1],0])},{a:P([a[0],a[1],T]),b:P([b[0],b[1],T])},{a:P([a[0],a[1],0]),b:P([a[0],a[1],T])});}}
 const solids=solidsOf(m).filter(x=>!foot||!(x.id==='main'||x.id.startsWith('footing')));
 if(solids.length)for(const x of solids)box(x.origin,x.size);else if(!foot){const b=boundsOf(m);box([0,0,0],[b[0],b[1],b[2]]);}
 let n=0;const bars=rows.map(row=>({row,lines:row.paths.slice(0,40).flatMap(p=>p.slice(1).map((q,i)=>({a:P(p[i]),b:P(q)}))).filter(()=>n++<6000),dots:[] as [number,number][],couplers:[] as [number,number][],dist:undefined,part:undefined}));
 const pts=[...edges.flatMap(e=>[e.a,e.b]),...bars.flatMap(b=>b.lines.flatMap(l=>[l.a,l.b]))],us=pts.map(p=>p[0]),vs=pts.map(p=>p[1]);
 const base=buildViewOne(m,[],input,{axes:[0,1]});
 return {...base,rects:[],polys:[],refs:[],holes:[],edges,piles:[],guides:[],bars,joints:[],stageText:[],levels:[],covers:[],beamCols:[],exDims:[],band:undefined,ground:undefined,
  u:us.length?[Math.min(...us),Math.max(...us)]:base.u,v:vs.length?[Math.min(...vs),Math.max(...vs)]:base.v,iso:true};
}
function buildViewOne(m:Member,rows:ViewRow[],input:ElementInput|undefined,{axes,normal,cut,columns,layer,rep,tight,look,depth,extent,exact,floor:fspec,window:win}:ViewSpec){
 const fc=floorCtx(m),fplan=!!fc&&!!fspec&&normal===undefined;
 if(fplan&&fspec!.layer!=='all')rows=rows.filter(r=>(floorRowLayer(r)??planLayerOf(m,input,r))===fspec!.layer);
 else if(layer&&normal===undefined)rows=rows.filter(r=>planLayerOf(m,input,r)===layer);
 const [a,b]=axes,round=circleIds(input),rects:Rect[]=[],guides:Line[]=[];
 // Footing concrete comes from the true plan outline (circle / polygons / L / U), not the bounding box.
 const only=!!columns&&input?.category==='Foundation'&&normal===2,foot=input?.category==='Foundation'&&!only?footingOutline(input):undefined,polys:Pt[][]=[],refs:Pt[][]=[],piles:Pile[]=[];
 if(only){rows=rows.filter(r=>/column-(main|tie)/.test(r.id));const fe=footingExtent(input);
  for(const c of footingColumns(input)){const {w,d}=columnExtent(c),ox=(fe.w-w)/2+c.offsetX,oy=(fe.d-d)/2+c.offsetY;(input.column.type==='pedestal'?polys:refs).push(columnOutline(c).map(([x,y])=>[ox+x,oy+y] as Pt));}}
 const isFooting=(id:string)=>!!foot&&(id==='main'||id.startsWith('footing'));
 const boxes=only?[]:[...solidsOf(m).filter(s=>!isFooting(s.id)).map(s=>({s,kind:'concrete' as const})),...(fplan?[]:contextSolids(m)).map(s=>({s,kind:s.id.startsWith('context_genwall')?'wall' as const:'context' as const}))];
 const sm=m.shapeModel,earth=m.category==='Foundation'||!!sm?.site,holes:Pt[][]=[],edges:Line[]=[];
 if(!only){if(m.lean.thickness>0)rects.push(...leanRect(m,a,b,normal,cut));
 rects.push(...sandRect(m,a,b,normal,cut));}
 // shape model: plan = footprint (holes white) + thin outlines of every part; section = cut rectangles per level band
 if(sm){
  if(fplan){const on=new Set(floorFocus(m));polys.push(...fc!.panels.filter(p=>on.has(p.mark)).map(p=>p.ring));holes.push(...fc!.openings.map(o=>[[o.x0,o.y0],[o.x1,o.y0],[o.x1,o.y1],[o.x0,o.y1]] as Pt[]));}
  else if(normal===undefined){const r=shapePlanRings(sm);polys.push(...r.outer);holes.push(...r.holes);
   for(const p of sm.parts)for(const ring of partPolygon(p))ring.forEach((q,i)=>{const n=ring[(i+1)%ring.length];edges.push({a:[q[a],q[b]],b:[n[a],n[b]]});});}
  else for(const r of shapeSectionRects(sm,a as 0|1,cut!))rects.push({u0:r.u0,u1:r.u1,v0:r.z0,v1:r.z1,kind:'concrete'});
  const p=sm.piles;if(p){const h=p.size/2,bottom=-m.lean.thickness-700,square=p.type==='square';
   for(const [x,y] of p.positions){if(normal===undefined){piles.push({u:[x,y][a],v:[x,y][b],square,size:p.size,hollow:false});continue;}
    const along=normal===1?y:x,dz=Math.abs(along-cut!);if(dz>h)continue;const half=square?h:Math.sqrt(h*h-dz*dz),u=normal===1?x:y;rects.push({u0:u-half,u1:u+half,v0:bottom,v1:p.embed,kind:'pile'});}}
 }
 // prism members (V-ditch lining, extruded profiles): plan = bounding outline, sections = the cut polygons
 const pg=m.prismGeometry;
 if(pg&&!sm&&!only){if(normal===undefined){const B=prismBounds(pg);polys.push([[0,0],[B[a],0],[B[a],B[b]],[0,B[b]]]);}
  // a cut square to a straight prism is the profile itself (prismSection returns it in pieces)
  else if(pg.version===1&&prismAxis(pg)===normal)polys.push(pg.profile.vertices.map(v=>{const q=prismPoint(pg,v,cut!);return [q[a],q[b]] as Pt;}));
  else polys.push(...prismSection(pg,normal,cut!).filter(r=>r.length>2).map(r=>r.map(q=>[q[a],q[b]] as Pt)));}
 if(foot&&input?.category==='Foundation'){
  // lowered areas (cuts from the footing top) lower the top of the section where the cut line crosses them
  const cuts=(input.cuts||[]).filter(c=>normal!==undefined&&(normal===1?c.y0<cut!&&cut!<c.y1:c.x0<cut!&&cut!<c.x1)).map(c=>({u0:normal===1?c.x0:c.y0,u1:normal===1?c.x1:c.y1,top:c.z0}));
  // full-depth openings inside the plan (the outline keeps only the outer ring): white holes in plan, gaps in sections
  const open=footingOpenings(input).filter(o=>normal===undefined||(normal===1?o.y0<cut!&&cut!<o.y1:o.x0<cut!&&cut!<o.x1));
  if(normal===undefined)holes.push(...open.map(o=>[[o.x0,o.y0],[o.x1,o.y0],[o.x1,o.y1],[o.x0,o.y1]] as Pt[]));
  const gaps=(u0:number,u1:number)=>open.map(o=>normal===1?[o.x0,o.x1]:[o.y0,o.y1]).reduce<[number,number][]>((iv,[p,q])=>iv.flatMap(([x,y]):[number,number][]=>q<=x||p>=y?[[x,y]]:[...(p>x?[[x,p] as [number,number]]:[]),...(q<y?[[q,y] as [number,number]]:[])]),[[u0,u1]]);
  if(normal===undefined)polys.push(foot);else for(const [u0,u1] of lineIntervals(foot,a as 0|1,Math.min(Math.max(cut!,1e-3),(a===0?m.y:m.x)-1e-3)).flatMap(([p,q])=>gaps(p,q))){
   const ks=[...new Set([u0,u1,...cuts.flatMap(c=>[c.u0,c.u1]).filter(k=>k>u0&&k<u1)])].sort((p,q)=>p-q);
   for(let k=1;k<ks.length;k++){const mid=(ks[k-1]+ks[k])/2,top=Math.min(input.thickness,...cuts.filter(c=>c.u0<mid&&mid<c.u1).map(c=>c.top));rects.push({u0:ks[k-1],u1:ks[k],v0:0,v1:top,kind:'concrete'});}}
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
 let rowIndex=0;
 let bars=rows.map(r=>{
  const lines:Line[]=[],dots:[number,number][]=[];
  // representative bar: the middle bar of the row, plus a line across all bar positions at a staggered point along it
  let dist:{a:[number,number];b:[number,number];q:[number,number];spacing:number;n:number}|undefined;
  const d=rep&&normal===undefined?distribution(r.paths,a,b):undefined;
  if(d){const segs=d.path.slice(1).map((q,i)=>({s:d.path[i],t:q,l:Math.hypot(q[a]-d.path[i][a],q[b]-d.path[i][b])})),main=segs.reduce((x,y)=>y.l>x.l?y:x),f=.2+(rowIndex++*.13)%.6;
   const q:[number,number]=[main.s[a]+(main.t[a]-main.s[a])*f,main.s[b]+(main.t[b]-main.s[b])*f];
   dist={q,a:[q[0]+d.first[0],q[1]+d.first[1]],b:[q[0]+d.last[0],q[1]+d.last[1]],spacing:d.spacing,n:d.n};}
  if(normal===undefined){for(const p of d?[d.path]:r.paths)for(let i=1;i<p.length;i++){const s=p[i-1],t=p[i];if(Math.hypot(t[a]-s[a],t[b]-s[b])<1){if(Math.abs(t[2]-s[2])>1)dots.push([s[a],s[b]]);}else lines.push({a:[s[a],s[b]],b:[t[a],t[b]]});}}
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
   // depth: every bar plane from the cut up to `depth` beyond it (viewing direction), else the nearest plane as before
   if(values.length&&depth!==undefined){const lo=look==='-'?cut!-depth:cut!,hi=look==='-'?cut!:cut!+depth;lines.push(...inPlane.filter(c=>c.v>=lo-.75&&c.v<=hi+.75).flatMap(c=>c.lines));}
   else if(values.length){const near=values.reduce((best,v)=>Math.abs(v-cut!)<Math.abs(best-cut!)?v:best,values[0]),gap=values.length>1?Math.max(...values.slice(1).map((v,i)=>v-values[i])):Infinity;
    if(Math.abs(near-cut!)<=gap/2+1)lines.push(...inPlane.filter(c=>Math.abs(c.v-near)<.75).flatMap(c=>c.lines));}
  }
  // coupler at the top end of footing column bars (vertical sections): a box centred on the bar end
  const couplers:[number,number][]=[];
  const ce=barCouplerEnds(input,r.id);
  if(normal!==undefined&&normal!==2&&(ce.top||ce.bottom)){const zs=r.paths.flatMap(p=>p.map(q=>q[2])),zTop=high(zs),zBot=low(zs);
   for(const l of lines){if(Math.abs(l.a[0]-l.b[0])>=.5)continue;const hi=l.a[1]>l.b[1]?l.a:l.b,lo=hi===l.a?l.b:l.a;
    if(ce.top&&Math.abs(hi[1]-zTop)<1)couplers.push(hi);if(ce.bottom&&Math.abs(lo[1]-zBot)<1)couplers.push(lo);}}
  return {row:r,lines,dots,couplers,dist,part:undefined as string|undefined};
 });
 // slab floor plan: one entry per Mark per panel (representative bar + distribution line of that panel, else every bar)
 const fdata=fplan?floorPlanData(m,fc!,rows,a,b,!!rep,win):undefined;
 if(fdata)bars=fdata.bars;
 // footing sections: construction joints between pour stages, stage names, level marks (T.O.F. / B.O.F. / C.J. / NGL)
 const joints:{v:number;u0:number;u1:number}[]=[],stageText:{u0:number;u1:number;v0:number;v1:number;text:string}[]=[],levels:{u:number;v:number;text:string}[]=[];
 // level (m) at v = 0 of a vertical section, when the member has a level reference (user level marks of the Drawing Edit)
 let datum:number|undefined;
 if(normal!==undefined&&!only&&input?.category==='Foundation'){
  const pr=footingPour(input),conc=rects.filter(r=>r.kind==='concrete'),T=input.thickness,ord=['First','Second','Third','Fourth','Fifth','Sixth'];
  const right=(z:number)=>Math.max(...conc.filter(r=>r.v0-1e-6<=z&&z<=r.v1+1e-6).map(r=>r.u1),-Infinity);
  if(pr.stages.length>1){
   for(const J of pr.levels)for(const r of conc)if(r.v0-1e-6<=J&&J<r.v1-1e-6)joints.push({v:J,u0:r.u0,u1:r.u1});
   for(const st of pr.stages){const band=conc.filter(r=>r.v0<st.z1-1e-6&&r.v1>st.z0+1e-6);if(!band.length)continue;const wide=band.reduce((x,y)=>y.u1-y.u0>x.u1-x.u0?y:x);
    stageText.push({u0:wide.u0,u1:wide.u1,v0:Math.max(st.z0,wide.v0),v1:Math.min(st.z1,wide.v1),text:`${ord[st.stage-1]||`Stage ${st.stage}`}-stage concrete pouring`});}}
  if(input.levels.enabled){const lv=footingLevels(input);datum=lv.bottom;const sg=(x:number)=>`${x>0?'+':x<0?'−':'±'}${Math.abs(x).toFixed(3)}`,at=(z:number,t:string)=>{const u=right(z);if(Number.isFinite(u))levels.push({u,v:z,text:`${t} ${sg(lv.bottom+z/1000)}`});};
   at(T,'T.O.F.');at(0,'B.O.F.');for(const J of pr.stages.length>1?pr.levels:[])if(Math.abs(J-T)>1)at(J,'C.J.');
   const Hp=input.column.type==='pedestal'?Math.max(0,...footingColumns(input).map(c=>c.height)):0;if(Hp>0)at(T+Hp,'T.O.P.');
   if(earth&&e.depth>0){const u=Math.max(...conc.map(r=>r.u1));levels.push({u:u+300,v:ground,text:`NGL ${sg(input.levels.ground)}`});}}
 }
 // single column poured in two stages: joint below the beam, stage names, B.O.C. / C.J. / T.O.C. levels
 if(normal!==undefined&&normal!==2&&input?.category==='Column'&&input.layout!=='stack'){const cp=columnPour(input);
  if(cp.on){datum=cp.bottom;const conc=rects.filter(r=>r.kind==='concrete'),H=input.height,ord=['First','Second'],sg=(x:number)=>`${x>0?'+':x<0?'−':'±'}${Math.abs(x).toFixed(3)}`;
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
 const fext=fdata?{u:[...fdata.grids.flatMap(g=>g.axis===a?[g.at]:[g.lo,g.hi]),...fdata.faded.flat().map(p=>p[0])],v:[...fdata.grids.flatMap(g=>g.axis===b?[g.at]:[g.lo,g.hi]),...fdata.faded.flat().map(p=>p[1])]}:{u:[],v:[]};
 const us=[...fext.u,...beamCols.flatMap(c=>[c.x0,c.x1]),...rects.flatMap(r=>[r.u0,r.u1]),...[...polys,...refs].flat().map(p=>p[0]),...piles.flatMap(p=>[p.u-p.size/2,p.u+p.size/2]),...guides.flatMap(g=>[g.a[0],g.b[0]]),...bars.flatMap(x=>[...x.lines.flatMap(l=>[l.a[0],l.b[0]]),...x.dots.map(d=>d[0]),...(x.dist?[x.dist.a[0],x.dist.b[0]]:[])])];
 const vs=[...fext.v,...beamCols.flatMap(c=>[c.lo,c.hi]),...rects.flatMap(r=>[r.v0,r.v1]),...[...polys,...refs].flat().map(p=>p[1]),...piles.flatMap(p=>[p.v-p.size/2,p.v+p.size/2]),...guides.flatMap(g=>[g.a[1],g.b[1]]),...bars.flatMap(x=>[...x.lines.flatMap(l=>[l.a[1],l.b[1]]),...x.dots.map(d=>d[1]),...(x.dist?[x.dist.a[1],x.dist.b[1]]:[])])];
 let U:[number,number]=only?[low(us),high(us)]:[low(us,0),high(us,1)],V:[number,number]=only?[low(vs),high(vs)]:[low(vs,0),high(vs,1)];
 if(tight&&!beamCols.length&&!fdata){
  const core=rects.filter(r=>r.kind!=='context'),cu=[...core.flatMap(r=>[r.u0,r.u1]),...polys.flat().map(p=>p[0]),...piles.flatMap(p=>[p.u-p.size/2,p.u+p.size/2]),...bars.flatMap(x=>[...x.lines.flatMap(l=>[l.a[0],l.b[0]]),...x.dots.map(d=>d[0])])];
  const cv=[...core.flatMap(r=>[r.v0,r.v1]),...polys.flat().map(p=>p[1]),...piles.flatMap(p=>[p.v-p.size/2,p.v+p.size/2]),...bars.flatMap(x=>[...x.lines.flatMap(l=>[l.a[1],l.b[1]]),...x.dots.map(d=>d[1])])];
  if(cu.length&&cv.length){const pu=Math.max(300,.06*(high(cu)-low(cu))),pv=Math.max(300,.06*(high(cv)-low(cv))),cl=(x:number,r:[number,number])=>Math.min(r[1],Math.max(r[0],x));
   U=[Math.max(U[0],low(cu)-pu),Math.min(U[1],high(cu)+pu)];V=[Math.max(V[0],low(cv)-pv),Math.min(V[1],high(cv)+pv)];
   for(let j=rects.length-1;j>=0;j--){const r=rects[j];if(r.kind!=='context')continue;r.u0=cl(r.u0,U);r.u1=cl(r.u1,U);r.v0=cl(r.v0,V);r.v1=cl(r.v1,V);if(r.u1-r.u0<1||r.v1-r.v0<1)rects.splice(j,1);}
   for(const q of refs)for(const pt of q){pt[0]=cl(pt[0],U);pt[1]=cl(pt[1],V);}
   for(const g of guides){g.a=[cl(g.a[0],U),cl(g.a[1],V)];g.b=[cl(g.b[0],U),cl(g.b[1],V)];}}}
 // extent: crop along the cut line to the clicked range (+ margin)
 if(extent&&normal!==undefined){const pad=exact?0:Math.max(150,.05*(extent[1]-extent[0])),lo=Math.max(U[0],extent[0]-pad),hi=Math.min(U[1],extent[1]+pad);
  if(hi-lo>1){U=[lo,hi];const cl=(x:number)=>Math.min(hi,Math.max(lo,x)),inU=(x:number)=>x>=lo-1e-6&&x<=hi+1e-6;
   for(let j=rects.length-1;j>=0;j--){const r=rects[j];r.u0=cl(r.u0);r.u1=cl(r.u1);if(r.u1-r.u0<1)rects.splice(j,1);}
   for(const q of [...polys,...refs,...holes])for(const pt of q)pt[0]=cl(pt[0]);
   for(const g of [...guides,...edges]){g.a=[cl(g.a[0]),g.a[1]];g.b=[cl(g.b[0]),g.b[1]];}
   for(let j=piles.length-1;j>=0;j--)if(!inU(piles[j].u))piles.splice(j,1);
   for(const b of bars){b.lines=b.lines.flatMap(l=>{const a=l.a[0],c=l.b[0];if(Math.max(a,c)<lo||Math.min(a,c)>hi)return [];if(Math.abs(c-a)<1e-9)return [l];
     const at=(x:number):[number,number]=>[x,l.a[1]+(l.b[1]-l.a[1])*(x-a)/(c-a)];return [{a:inU(a)?l.a:at(cl(a)),b:inU(c)?l.b:at(cl(c))}];});
    b.dots=b.dots.filter(d=>inU(d[0]));b.couplers=b.couplers.filter(d=>inU(d[0]));if(b.dist&&!inU(b.dist.q[0]))b.dist=undefined;}
   for(const j of joints){j.u0=cl(j.u0);j.u1=cl(j.u1);}for(const t of stageText){t.u0=cl(t.u0);t.u1=cl(t.u1);}
   for(let j=covers.length-1;j>=0;j--)if(!inU(covers[j].a[0])||!inU(covers[j].b[0]))covers.splice(j,1);
   for(const l of levels)l.u=cl(l.u);}}
 // look '-': seen from the other side, the horizontal axis runs the other way (mirror inside the same range)
 let flip=false;
 if(look==='-'&&normal!==undefined){flip=true;const f=(x:number)=>U[0]+U[1]-x,fp=(p:[number,number]):[number,number]=>[f(p[0]),p[1]];
  for(const r of rects){const a=r.u0;r.u0=f(r.u1);r.u1=f(a);}
  for(const q of [...polys,...refs,...holes])for(const pt of q)pt[0]=f(pt[0]);
  for(const g of [...guides,...edges]){g.a=fp(g.a);g.b=fp(g.b);}for(const p of piles)p.u=f(p.u);
  for(const b of bars){b.lines=b.lines.map(l=>({a:fp(l.a),b:fp(l.b)}));b.dots=b.dots.map(fp);b.couplers=b.couplers.map(fp);if(b.dist)b.dist={...b.dist,a:fp(b.dist.a),b:fp(b.dist.b),q:fp(b.dist.q)};}
  for(const j of joints){const a=j.u0;j.u0=f(j.u1);j.u1=f(a);}for(const t of stageText){const a=t.u0;t.u0=f(t.u1);t.u1=f(a);}
  for(const c of covers){c.a=fp(c.a);c.b=fp(c.b);}
  // level marks stay right of the concrete
  const conc=rects.filter(r=>r.kind==='concrete');for(const l of levels){const at=conc.filter(r=>r.v0-1e-6<=l.v&&l.v<=r.v1+1e-6);l.u=at.length?Math.max(...at.map(r=>r.u1)):f(l.u);}
  for(const c of beamCols){const a=c.x0;c.g=f(c.g);c.x0=f(c.x1);c.x1=f(a);}for(const d of exDims)d.stops=d.stops.map(f).sort((p,q)=>p-q);}
 return {member:m,input,axes,normal,cut,rects,polys,refs,holes,edges,piles,guides,bars,joints,stageText,levels,covers,beamCols,exDims,band,datum:normal!==undefined&&normal!==2?datum:undefined,window:undefined as ViewSpec['window'],stepAt:[] as number[],iso:false,u:U,v:V,ground:normal!==undefined&&!only&&earth&&e.depth>0?ground:undefined,columns:only,flip,cropped:!!extent&&normal!==undefined,
  floor:fdata,floorMember:!!fc,floorNote:undefined as string[]|undefined};
}
type FloorEntry={row:ViewRow;lines:Line[];dots:[number,number][];couplers:[number,number][];dist:{a:[number,number];b:[number,number];q:[number,number];spacing:number;n:number}|undefined;part:string|undefined};
const pointIn=(p:[number,number],r:[number,number][])=>{let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const A=r[i],B=r[j];if((A[1]>p[1])!==(B[1]>p[1])&&p[0]<(B[0]-A[0])*(p[1]-A[1])/(B[1]-A[1])+A[0])inside=!inside;}return inside;};
const lineLen=(l:Line)=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]);
/** Slab floor plan data (member coordinates): bar entries per panel, grids with bubbles, reference beams, panels of other marks
 * (faded), drops, and the dimension chains of the extra top bars (projection past the beam faces) / opening trimmers (past the
 * opening edges). `win` (Detail view) keeps only bars near the window. */
function floorPlanData(m:Member,c:FloorCtx,rows:ViewRow[],a:number,b:number,rep:boolean,win:ViewSpec['window']){
 const on=new Set(floorFocus(m)),panelOf=(u:number,v:number)=>c.panels.find(p=>pointIn([u,v],p.ring)),bars:FloorEntry[]=[];let k=0;
 const near=(p:Vec3[])=>!win||p.some(q=>Math.abs(q[a]-win.u)<=win.r*1.3&&Math.abs(q[b]-win.v)<=win.r*1.3)||p.length>1&&p.slice(1).some((q,i)=>{const s=p[i];
  return Math.min(s[a],q[a])<=win.u+win.r&&Math.max(s[a],q[a])>=win.u-win.r&&Math.min(s[b],q[b])<=win.v+win.r&&Math.max(s[b],q[b])>=win.v-win.r;});
 // panels a bar passes through (points along its plan segments); a continuous bar belongs to every panel it crosses
 const panelsOn=(p:Vec3[])=>{const out=new Set<string>();for(let i=1;i<p.length;i++){const s=p[i-1],t=p[i],L=Math.hypot(t[a]-s[a],t[b]-s[b]),n=Math.min(40,Math.max(1,Math.ceil(L/400)));
  for(let j=0;j<=n;j++){const f=(j+.5)/(n+1),pn=panelOf(s[a]+(t[a]-s[a])*f,s[b]+(t[b]-s[b])*f);if(pn)out.add(pn.tag);}}return out.size?[...out]:[''];};
 for(const r of rows){
  const by=new Map<string,Vec3[][]>(),drawn=new Set<Vec3[]>();
  for(const p of r.paths){if(!near(p))continue;for(const key of panelsOn(p))by.set(key,[...(by.get(key)||[]),p]);}
  for(const [part,paths] of by){const d=rep&&paths.length>=3?distribution(paths,a,b):undefined,lines:Line[]=[],dots:[number,number][]=[];let dist:FloorEntry['dist'];
   if(d){const segs=d.path.slice(1).map((q,i)=>({s:d.path[i],t:q,l:Math.hypot(q[a]-d.path[i][a],q[b]-d.path[i][b])})),main=segs.reduce((x,y)=>y.l>x.l?y:x),f0=.2+(k++*.13)%.6;
    // distribution line inside this panel: the point of the main leg nearest the panel's centre (staggered a little per Mark)
    const pn=c.panels.find(x=>x.tag===part),du=main.t[a]-main.s[a],dv=main.t[b]-main.s[b],L2=du*du+dv*dv||1;
    let f=f0;if(pn){const cx=(pn.box.x0+pn.box.x1)/2,cy=(pn.box.y0+pn.box.y1)/2,span=Math.abs(du)>=Math.abs(dv)?(pn.box.x1-pn.box.x0):(pn.box.y1-pn.box.y0);
     f=Math.min(1,Math.max(0,((cx-main.s[a])*du+(cy-main.s[b])*dv)/L2+(f0-.5)*.6*span/Math.sqrt(L2)));}
    const q:[number,number]=[main.s[a]+du*f,main.s[b]+dv*f];dist={q,a:[q[0]+d.first[0],q[1]+d.first[1]],b:[q[0]+d.last[0],q[1]+d.last[1]],spacing:d.spacing,n:d.n};}
   const draw=(d?[d.path]:rep&&paths.length>8?[paths[Math.floor(paths.length/2)]]:paths).filter(p=>!drawn.has(p));
   for(const p of draw){drawn.add(p);for(let i=1;i<p.length;i++){const s=p[i-1],t=p[i];if(Math.hypot(t[a]-s[a],t[b]-s[b])<1){if(Math.abs(t[2]-s[2])>1)dots.push([s[a],s[b]]);}else lines.push({a:[s[a],s[b]],b:[t[a],t[b]]});}}
   bars.push({row:r,lines,dots,couplers:[],dist,part:part||undefined});}
 }
 const e=c.extent,pad=900,grids=c.grids.map(g=>({axis:g.axis as number,at:g.at,label:g.label,lo:(g.axis===0?e.y0:e.x0)-pad,hi:(g.axis===0?e.y1:e.x1)+pad}));
 const beams=c.beams.map(x=>({u0:x.x0,u1:x.x1,v0:x.y0,v1:x.y1}));
 const faded=c.panels.filter(p=>!on.has(p.mark)).map(p=>p.ring);
 // dimension chains: extra top bars across the beam (stops at the beam faces), opening trimmers across the opening
 const dims:{id:string;row:string;dir:'h'|'v';stops:number[];at:number;texts:(string|undefined)[]}[]=[];
 for(const x of bars){const kind=floorKind(x.row.id),extra=isTopExtra(x.row);if(!extra&&kind!=='OP')continue;
  const l=x.lines.reduce<Line|undefined>((best,y)=>!best||lineLen(y)>lineLen(best)?y:best,undefined);if(!l)continue;
  const h=Math.abs(l.b[0]-l.a[0])>=Math.abs(l.b[1]-l.a[1]),s0=Math.min(h?l.a[0]:l.a[1],h?l.b[0]:l.b[1]),s1=Math.max(h?l.a[0]:l.a[1],h?l.b[0]:l.b[1]),pos=h?l.a[1]:l.a[0];
  const obs=extra?beams.map(q=>h?{lo:q.u0,hi:q.u1,p0:q.v0,p1:q.v1}:{lo:q.v0,hi:q.v1,p0:q.u0,p1:q.u1}):c.openings.map(o=>h?{lo:o.x0,hi:o.x1,p0:o.y0-800,p1:o.y1+800}:{lo:o.y0,hi:o.y1,p0:o.x0-800,p1:o.x1+800});
  const faces=obs.filter(q=>pos>=q.p0-1&&pos<=q.p1+1&&q.hi>s0+1&&q.lo<s1-1).flatMap(q=>[q.lo,q.hi]).filter(v=>v>s0+1&&v<s1-1);if(!faces.length)continue;
  const stops=[...new Set([s0,...faces,s1].map(v=>Math.round(v)))].sort((p,q)=>p-q);
  const mk=c.f.marks.find(y=>y.name===slabMarkOf(x.row)),te=mk?.rebar.topExtra,ratio=extra&&te?.length.mode==='ratio'?`L/${te.length.n}`:undefined;
  const texts=stops.slice(1).map((_,i)=>ratio&&(i===0||i===stops.length-2)?`<> (${ratio})`:undefined);
  dims.push({id:`${x.row.id}@${x.part||''}`,row:x.row.id,dir:h?'h':'v',stops,at:pos,texts});}
 return {bars,grids,beams,faded,drops:c.drops.map(d=>({ring:d.ring,label:d.label,kind:d.kind})),dims,layerText:(r:ViewRow)=>floorLayerToken(r.note)};
}
export type ViewData=ReturnType<typeof buildViewOne>;

type DimSpec={dir:'h'|'v';stops:number[];side:'start'|'end'};
/** Chained dimensions per view from the member / input (not measured from the drawing). */
function dimensionSets(m:Member,input:ElementInput|undefined,axes:[number,number],normal?:number,columns=false,grids?:{axis:number;at:number}[]):DimSpec[]{
 const [a,b]=axes,size=[m.x,m.y,m.z];
 // pedestal / starter section: faces of every column along each axis
 if(columns&&input?.category==='Foundation'){const fe=footingExtent(input),cols=footingColumns(input),faces=(axis:number)=>cols.flatMap(c=>{const e=columnExtent(c),size=axis?e.d:e.w,total=axis?fe.d:fe.w,off=axis?c.offsetY:c.offsetX;return [(total-size)/2+off,(total+size)/2+off];});
  return [{dir:'h',stops:faces(a),side:'start'},{dir:'v',stops:faces(b),side:'start'}];}
 const out:DimSpec[]=[{dir:'h',stops:[0,size[a]],side:'start'}];
 // slab floor plan: overall size + grid to grid along each axis
 if(grids&&normal===undefined){const at=(ax:number)=>[...new Set(grids.filter(g=>g.axis===ax).map(g=>Math.round(g.at)))].sort((p,q)=>p-q);return [...out,{dir:'h',stops:at(a),side:'end'},{dir:'v',stops:[0,size[b]],side:'start'},{dir:'v',stops:at(b),side:'end'}];}
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
export function renderView(v:ViewData,box:{x:number;y:number;w:number;h:number},opts:{k?:number;colors:Map<string,string>;cuts?:{x:number;y:number};zCut?:number;fontScale?:number;scale?:(fit:number)=>number;gutter?:boolean;
 /** reports the mapping view (u, v mm) → target: x = x0 + (u − u0)·s, y = y0 − (v − v0)·s */
 frame?:(f:{s:number;x0:number;y0:number;u0:number;v0:number})=>void;
 /** per-view display switches of the Sheet Composer */
 hide?:{dims?:boolean;marks?:boolean;levels?:boolean};
 /** added section cut lines (plan / elevation): model axis, position, label (A-A), sheet reference, viewing side, extent */
 sectionLines?:{axis:number;at:number;label:string;ref?:string;look?:'+'|'-';extent?:[number,number];steps?:{from:number;at:number}[]}[];
 /** Drawing Edit layer of this view (`drawingEdits.ts`): overrides of the automatic annotations by key + user text / leaders */
 edits?:ViewEdits;
 /** Detail marks on this (parent) view: region (view mm), label, sheet reference */ detailMarks?:{u:number;v:number;r:number;circle?:boolean;label:string;ref?:string}[]}):Prim[]{
 const win=v.window,{u,v:vr}=win?{u:[win.u-win.r,win.u+win.r] as [number,number],v:[win.v-win.r,win.v+win.r] as [number,number]}:v;
 // Detail (window) and ISO views: no chained dims / levels / stage names (member-wide); ISO: no Mark labels either
 const hide={...opts.hide,...opts.edits?.hide,...(win||v.iso?{dims:true,levels:true}:{}),...(v.iso?{marks:true}:{})};
 const k=opts.k??1,fs=opts.fontScale??1,M=48*k,spanU=u[1]-u[0],spanV=vr[1]-vr[0];
 // level marks sit right of the concrete: keep room for their text inside the box
 const levelList=hide.levels?[]:v.levels,lvW=levelList.length?Math.max(...levelList.map(l=>textWidth(l.text,9*k*fs)))+16*k:0;
 // `scale` picks the drawing scale (target units per model mm) from the largest one that fits, e.g. a standard 1:N
 // Mark labels (one per Mark family; marks split by bar length, gen-bottom-x-1, -2 …, share "F01–F08");
 // a representative bar adds count and spacing: "F01 36-DB32@250"
 const size=10*k*fs,step=size*1.15,family=(id:string)=>id.replace(/^(gen-(?:bottom|top)-[xy])-\d+$/,'$1'),labelled=new Set<string>();
 const labels:{id:string;text:string;at:[number,number];left:boolean;mark:{mark:string;n?:number;size?:string;spacing?:number}}[]=[];
 for(const {row,lines,dots,dist,part} of v.bars){
  // slab floor plan: one label per Mark per panel, "S1-B01 DB12@200 (B1)"
  if(v.floor){if(win&&!/^(OP|OD)$/.test(floorKind(row.id)||''))continue;const id=`${row.id}@${part||''}`,p=dist?dist.q:lines[0]?[(lines[0].a[0]+lines[0].b[0])/2,(lines[0].a[1]+lines[0].b[1])/2] as [number,number]:dots[0];if(!p||labelled.has(id))continue;labelled.add(id);
   const sp=dist?Math.round(dist.spacing/5)*5:0,n=dist?dist.n:row.count,lay=v.floor.layerText(row);
   labels.push({id,text:`${row.mark} ${dist?`${barName(row.diameter)}@${sp}`:`${n>1?`${n}-`:''}${barName(row.diameter)}`}${lay?` (${lay})`:''}`,at:p,left:p[0]<(u[0]+u[1])/2,mark:{mark:row.mark,size:barName(row.diameter),...(dist?{n:dist.n,spacing:sp}:{})}});continue;}
  const fam=family(row.id);if(labelled.has(fam))continue;
  const p=dist?dist.q:lines[0]?[(lines[0].a[0]+lines[0].b[0])/2,(lines[0].a[1]+lines[0].b[1])/2] as [number,number]:dots[0];if(!p)continue;labelled.add(fam);
  const marks=fam!==row.id?v.bars.filter(x=>family(x.row.id)===fam).map(x=>x.row.mark):[row.mark],name=marks.length>1?`${marks[0]}–${marks.at(-1)}`:row.mark;
  labels.push({id:row.id,text:dist?`${name} ${dist.n}-${barName(row.diameter)}@${Math.round(dist.spacing/5)*5}`:name,at:p,left:p[0]<(u[0]+u[1])/2,mark:{mark:name,size:barName(row.diameter),...(dist?{n:dist.n,spacing:Math.round(dist.spacing/5)*5}:{})}});}
 if(hide.marks)labels.length=0;
 if(win)for(let i=labels.length-1;i>=0;i--){const [a,b]=labels[i].at;if(win.circle?Math.hypot(a-win.u,b-win.v)>win.r:Math.abs(a-win.u)>win.r||Math.abs(b-win.v)>win.r)labels.splice(i,1);}
 // gutter: labels just outside the dimension lines, in columns left / right of the drawing ('side') or in rows
 // above / below it ('rows'). Use the direction the drawing leaves spare (no shrinking); else shrink by at most a
 // third of the view; else labels next to the bars ('near').
 const tw=(l:{text:string})=>textWidth(l.text,size)*1.08,dimW=27*k+textWidth('88,888',10*k*fs)+4*k,GV=34*k;
 const sideNeed=(t:typeof labels)=>t.length?Math.max(0,dimW+Math.max(...t.map(tw))+2*k-M):0;
 const rowsNeed=(t:typeof labels)=>{if(!t.length)return 0;let rows=1,x=0;for(const l of t){const w=tw(l)+8*k;if(x&&x+w>box.w-8*k){rows++;x=0;}x+=w;}return Math.max(0,GV+rows*step-M);};
 const up=labels.filter(l=>l.at[1]>=(vr[0]+vr[1])/2),down=labels.filter(l=>l.at[1]<(vr[0]+vr[1])/2);
 const fit0=Math.min((box.w-2*M-lvW)/spanU,(box.h-2*M)/spanV),spareW=box.w-2*M-lvW-spanU*fit0,spareH=box.h-2*M-spanV*fit0;
 const sL=sideNeed(labels.filter(l=>l.left)),sR=sideNeed(labels.filter(l=>!l.left)),rT=rowsNeed(up),rB=rowsNeed(down);
 const mode:'side'|'rows'|'near'=!opts.gutter||!labels.length?'near':sL+sR<=spareW+1e-6?'side':rT+rB<=spareH+1e-6?'rows':
  (sL+sR)/box.w<=(rT+rB)/box.h&&sL+sR<=box.w/3?'side':rT+rB<=box.h/3?'rows':'near';
 const gL=mode==='side'?sL:0,gR=mode==='side'?sR:0,gT=mode==='rows'?rT:0,gB=mode==='rows'?rB:0;
 const fit=Math.min((box.w-2*M-lvW-gL-gR)/spanU,(box.h-2*M-gT-gB)/spanV),s=opts.scale?opts.scale(fit):fit,offU=(box.w-2*M-lvW-gL-gR-spanU*s)/2,offV=(box.h-2*M-gT-gB-spanV*s)/2;
 const X=(x:number)=>box.x+M+gL+offU+(x-u[0])*s,Y=(y:number)=>box.y+box.h-M-gB-offV-(y-vr[0])*s,out:Prim[]=[];
 opts.frame?.({s,x0:X(u[0]),y0:Y(vr[0]),u0:u[0],v0:vr[0]});
 // push with a CAD layer role (DXF export); `barLayer` = links / ties / stirrups vs main bars
 const put=(layer:LayerRole,...ps:Prim[])=>{for(const p of ps){p.layer=layer;out.push(p);}};
 // Drawing Edit: override of an automatic annotation (stable key), paper unit (sheet mm when k = 0.26)
 const over=(key:string)=>opts.edits?.over?.[key],pu=k/.26;
 const barLayer=(id:string,row?:ViewRow):LayerRole=>{if(v.floorMember&&row){const f=floorRowLayer(row);if(f)return f==='top'?'barTop':'barBottom';}return /tie|stirrup|link|hoop|spiral/i.test(id)?'barLink':'barMain';};
 const style:Record<Rect['kind'],{fill?:string;stroke:string;width:number;dash?:number[]}>={concrete:{fill:'#e9efec',stroke:'#51706a',width:1.2*k},lean:{fill:'#dcd8cf',stroke:'#8a857a',width:.8*k},sand:{fill:'#f3e6bf',stroke:'#b39552',width:.8*k},context:{stroke:'#d07a2d',width:1*k,dash:[5*k,3*k]},wall:{fill:'#b9c4c1',stroke:'#3d5054',width:1*k},pile:{fill:'#cfc6b6',stroke:'#6b5b45',width:1*k}};
 const rect=(r:Rect)=>put(r.kind==='context'?'concreteHidden':'concrete',r.circle?{t:'ellipse',cx:X((r.u0+r.u1)/2),cy:Y((r.v0+r.v1)/2),rx:(r.u1-r.u0)/2*s,ry:(r.v1-r.v0)/2*s,...style[r.kind]}:{t:'rect',x:X(r.u0),y:Y(r.v1),w:(r.u1-r.u0)*s,h:(r.v1-r.v0)*s,...style[r.kind]});
 v.rects.filter(r=>r.kind==='sand').forEach(rect);
 v.rects.filter(r=>r.kind==='lean').forEach(rect);
 // slab floor plan: panels of other slab marks (faded), reference beams (dashed), grids (dash-dot + bubbles)
 const F=v.floor;
 if(F){for(const p of F.faded)put('concreteHidden',{t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])]),closed:true,fill:'#f1f5f9',stroke:'#cbd5e1',width:.5*k});
}
 for(const p of v.polys)put('concrete',{t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])]),closed:true,...style.concrete});
 // starter bars: the column above is a reference outline (dashed), not concrete of this element
 for(const p of v.refs)put('concreteHidden',{t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])]),closed:true,...style.context});
 for(const p of v.holes)put('concrete',{t:'poly',pts:p.map(q=>[X(q[0]),Y(q[1])]),closed:true,fill:'#ffffff',stroke:style.concrete.stroke,width:style.concrete.width});
 for(const g of v.edges)put('concrete',{t:'line',x1:X(g.a[0]),y1:Y(g.a[1]),x2:X(g.b[0]),y2:Y(g.b[1]),stroke:'#7d9690',width:.5*k});
 for(const p of v.piles){const dash=[4*k,2*k];if(p.square)put('concreteHidden',{t:'rect',x:X(p.u-p.size/2),y:Y(p.v+p.size/2),w:p.size*s,h:p.size*s,stroke:'#6b5b45',width:k,dash});else{put('concreteHidden',{t:'circle',cx:X(p.u),cy:Y(p.v),r:p.size/2*s,stroke:'#6b5b45',width:k,dash});if(p.hollow)put('concreteHidden',{t:'circle',cx:X(p.u),cy:Y(p.v),r:p.size/4*s,stroke:'#6b5b45',width:k,dash});}}
 v.rects.filter(r=>r.kind!=='lean'&&r.kind!=='sand').forEach(rect);
 if(F){
  for(const g of F.grids){const vert=g.axis===v.axes[0],r=6*k,cs={stroke:'#94a3b8',width:.5*k,dash:[10*k,3*k,2*k,3*k]};
   const [x1,y1,x2,y2]=vert?[X(g.at),Y(g.hi),X(g.at),Y(g.lo)]:[X(g.lo),Y(g.at),X(g.hi),Y(g.at)];put('symbol',{t:'line',x1,y1,x2,y2,...cs});
   const cx=vert?x1:x1-r,cy=vert?y1-r:y1;put('symbol',{t:'circle',cx,cy,r,stroke:'#334155',width:.5*k,fill:'#ffffff'});put('text',{t:'text',x:cx,y:cy+3.2*k*fs,text:g.label,size:8*k*fs,color:'#334155',anchor:'middle',bold:true});}
  for(const b of F.beams)put('concreteHidden',{t:'rect',x:X(b.u0),y:Y(b.v1),w:(b.u1-b.u0)*s,h:(b.v1-b.v0)*s,stroke:'#475569',width:.6*k,dash:[4*k,2.4*k]});
  for(const h of v.holes){const [p0,,p2]=h,[q0,q1]=[[X(p0[0]),Y(p0[1])],[X(p2[0]),Y(p2[1])]];put('concrete',{t:'line',x1:q0[0],y1:q0[1],x2:q1[0],y2:q1[1],stroke:'#94a3b8',width:.4*k},{t:'line',x1:q0[0],y1:q1[1],x2:q1[0],y2:q0[1],stroke:'#94a3b8',width:.4*k});}
  for(const d of F.drops)put('concreteHidden',{t:'poly',pts:d.ring.map(q=>[X(q[0]),Y(q[1])]),closed:true,stroke:'#0f766e',width:.6*k,dash:[3*k,2*k]});}
 for(const g of v.guides)put('concreteHidden',{t:'line',x1:X(g.a[0]),y1:Y(g.a[1]),x2:X(g.b[0]),y2:Y(g.b[1]),stroke:'#a07b54',width:.8*k,dash:[6*k,4*k]});
 if(v.ground!==undefined&&!levelList.length)put('text',{t:'text',x:X(u[1]),y:Y(v.ground)-4*k,text:'ระดับดิน',size:10*k*fs,color:'#8a6a45',anchor:'end'});
 // pour stages: joint lines (red dashed) and the stage names; level marks: ▽ + text right of the concrete face
 for(const x of v.stepAt)put('symbol',{t:'line',x1:X(x),x2:X(x),y1:Y(vr[0]),y2:Y(vr[1]),stroke:'#7c8b8f',width:.6*k,dash:[8*k,3*k,2*k,3*k]});
 for(const j of v.joints)put('symbol',{t:'line',x1:X(j.u0),x2:X(j.u1),y1:Y(j.v),y2:Y(j.v),stroke:'#c0392b',width:1.1*k,dash:[6*k,3*k]});
 levelList.forEach((l,i)=>{const key=`level:${i}`,o=over(key);if(o?.hidden)return;const x=X(l.u)+10*k+(o?.dx||0)*pu,y=Y(l.v),h=5*k,text=o?.text??l.text;
  put('dim',{t:'line',x1:X(l.u),x2:x+textWidth(text,9*k*fs)+4*k,y1:y,y2:y,stroke:'#3f5459',width:.6*k,key},{t:'poly',pts:[[x,y],[x-h*.6,y-h],[x+h*.6,y-h]],closed:true,stroke:'#3f5459',width:.6*k,key});put('text',{t:'text',x:x+h,y:y-2*k,text,size:9*k*fs,color:'#3f5459',halo:true,key});});
 const cuts=opts.cuts;
 if(cuts){const cs={stroke:'#7c8b8f',width:.8*k,dash:[10*k,3*k,2*k,3*k]};put('symbol',{t:'line',x1:X(u[0]),x2:X(u[1]),y1:Y(cuts.y),y2:Y(cuts.y),...cs},{t:'line',x1:X(cuts.x),x2:X(cuts.x),y1:Y(vr[0]),y2:Y(vr[1]),...cs});
  const ts={size:11*k*fs,color:'#5b6b70',bold:true};put('text',{t:'text',x:X(u[0])-6*k,y:Y(cuts.y)+4*k,text:'X',anchor:'end',...ts},{t:'text',x:X(u[1])+6*k,y:Y(cuts.y)+4*k,text:'X',...ts},{t:'text',x:X(cuts.x),y:Y(vr[1])-6*k,text:'Y',anchor:'middle',...ts},{t:'text',x:X(cuts.x),y:Y(vr[0])+14*k,text:'Y',anchor:'middle',...ts});}
 // level of the pedestal / starter plan section (Z–Z) on the vertical sections
 if(opts.zCut!==undefined&&v.normal!==undefined&&v.normal!==2&&opts.zCut>vr[0]&&opts.zCut<vr[1]){const y=Y(opts.zCut),ts={size:11*k*fs,color:'#5b6b70',bold:true};
  put('symbol',{t:'line',x1:X(u[0]),x2:X(u[1]),y1:y,y2:y,stroke:'#7c8b8f',width:.8*k,dash:[10*k,3*k,2*k,3*k]});put('text',{t:'text',x:X(u[0])-6*k,y:y+4*k,text:'Z',anchor:'end',...ts},{t:'text',x:X(u[1])+6*k,y:y+4*k,text:'Z',...ts});}
 // added section cuts: dash-dot line across the view (or its extent), split bubble at both ends (label / sheet), arrow to the viewing side
 for(const c of opts.sectionLines||[]){const vert=c.axis===v.axes[0],horiz=c.axis===v.axes[1];if(!vert&&!horiz)continue;
  const [e0,e1]=c.extent||(vert?vr:u),ext=12*k,cs={stroke:'#7c8b8f',width:.8*k,dash:[10*k,3*k,2*k,3*k]},r=5*k,letter=c.label.split('-')[0],sign=c.look==='-'?-1:1;
  // stepped cut: the line jumps to the next position at each step (thick corners), bubbles at the first / last position
  const st=(c.steps||[]).filter(x=>x.from>e0&&x.from<e1).sort((p,q)=>p.from-q.from),ats=[c.at,...st.map(x=>x.at)],brk=[e0,...st.map(x=>x.from),e1];
  const pt=(along:number,at:number):[number,number]=>vert?[X(at),Y(along)]:[X(along),Y(at)];
  const a:[number,number]=vert?[X(ats[0]),Y(e1)-ext]:[X(e0)-ext,Y(ats[0])],b:[number,number]=vert?[X(ats.at(-1)!),Y(e0)+ext]:[X(e1)+ext,Y(ats.at(-1)!)];
  if(!st.length)put('symbol',{t:'line',x1:a[0],y1:a[1],x2:b[0],y2:b[1],...cs});
  else{const path:[number,number][]=[vert?a:a];ats.forEach((at,i)=>{const s0=pt(vert?brk[ats.length-i]:brk[i],at),s1=pt(vert?brk[ats.length-1-i]:brk[i+1],at);if(i)path.push(s0);path.push(s1);});
   const seq=vert?[...ats].reverse():ats;if(vert){path.length=0;path.push(a);seq.forEach((at,i)=>{const hiE=brk[brk.length-1-i],loE=brk[brk.length-2-i];if(i)path.push(pt(hiE,at));path.push(pt(loE,at));});path.push(b);}else path.push(b);
   put('symbol',{t:'poly',pts:path,closed:false,...cs});for(const q of path.slice(1,-1))put('symbol',{t:'circle',cx:q[0],cy:q[1],r:.9*k,fill:'#3f5459'});}
  for(const [px,py,out] of [[a[0],a[1],-1],[b[0],b[1],1]] as [number,number,number][]){const cx=vert?px:px+out*r,cy=vert?py+out*r:py;
   // arrow toward the viewing side (+ along the cut axis = right in plan / up for a horizontal cut)
   const ax=vert?sign*4*k:0,ay=vert?0:-sign*4*k;put('symbol',{t:'line',x1:px,y1:py,x2:px+ax*1.6,y2:py+ay*1.6,stroke:'#3f5459',width:.7*k},{t:'poly',pts:[[px+ax*2.2,py+ay*2.2],[px+ax*1.4-ay*.4,py+ay*1.4+ax*.4],[px+ax*1.4+ay*.4,py+ay*1.4-ax*.4]],closed:true,fill:'#3f5459',stroke:'#3f5459',width:.3*k});
   put('symbol',{t:'circle',cx,cy,r,stroke:'#3f5459',width:.6*k,fill:'#ffffff'},{t:'line',x1:cx-r,x2:cx+r,y1:cy,y2:cy,stroke:'#3f5459',width:.4*k});
   put('text',{t:'text',x:cx,y:cy-1.2*k,text:letter,size:5.5*k*fs,color:'#22393f',anchor:'middle',bold:true},{t:'text',x:cx,y:cy+4.3*k,text:c.ref||'—',size:4.2*k*fs,color:'#4b6166',anchor:'middle'});}}
 for(const {row,lines,dots,couplers,dist} of v.bars){
  const color=opts.colors.get(row.id)||'#167561',w=Math.max(k,row.diameter*s),bl=barLayer(row.id,row);
  for(const l of lines)put(bl,{t:'line',x1:X(l.a[0]),y1:Y(l.a[1]),x2:X(l.b[0]),y2:Y(l.b[1]),stroke:color,width:w,cap:'round',group:row.id});
  for(const d of dots)put(bl,{t:'circle',cx:X(d[0]),cy:Y(d[1]),r:Math.max((v.columns?3:1.6)*k,row.diameter*s/2),fill:color,group:row.id});
  for(const c of couplers){const cw=Math.max(4.5*k,row.diameter*1.6*s),ch=Math.max(9*k,row.diameter*3*s);put(bl,{t:'rect',x:X(c[0])-cw/2,y:Y(c[1])-ch/2,w:cw,h:ch,fill:'#ffffff',stroke:color,width:.9*k,group:row.id},{t:'line',x1:X(c[0])-cw/2,x2:X(c[0])+cw/2,y1:Y(c[1]),y2:Y(c[1]),stroke:color,width:.6*k,group:row.id});}
  // distribution line across all bar positions: end slashes, dot where it meets the drawn bar
  if(dist){const ax=X(dist.a[0]),ay=Y(dist.a[1]),bx=X(dist.b[0]),by=Y(dist.b[1]),l=Math.hypot(bx-ax,by-ay)||1,ux=(bx-ax)/l,uy=(by-ay)/l,t=3*k;
   const slash=(x:number,y:number)=>({t:'line' as const,x1:x-(ux-uy)*t,y1:y-(uy+ux)*t,x2:x+(ux-uy)*t,y2:y+(uy+ux)*t,stroke:color,width:.6*k,group:row.id});
   put(bl,{t:'line',x1:ax,y1:ay,x2:bx,y2:by,stroke:color,width:.5*k,group:row.id},slash(ax,ay),slash(bx,by),{t:'circle',cx:X(dist.q[0]),cy:Y(dist.q[1]),r:1.8*k,fill:color,group:row.id});}
 }
 // labels: gutter columns / rows (sorted so leaders do not cross), else next to the bar moving down to clear
 // (semantic leader: points from the bar, text, Mark data for the DXF Mark block; `draw` = the drawing as before)
 const colorOf=(id:string)=>opts.colors.get(id.split('@')[0])||'#167561';
 const leaderDraw=(l:{id:string;at:[number,number]},pts:[number,number][]):PlainPrim[]=>{const color=colorOf(l.id),ax=X(l.at[0]),ay=Y(l.at[1]);
  return [{t:'poly',pts:[[ax,ay],...pts],closed:false,stroke:color,width:.45*k,group:l.id},{t:'circle',cx:ax,cy:ay,r:1.1*k,fill:color,group:l.id}];};
 // Drawing Edit override `mark:<bar id>`: hidden, text moved by (dx, dy) paper mm (the arrow stays on the bar), own text
 const leader=(l:typeof labels[number],pts:[number,number][],tx:number,ty:number,anchor:'start'|'end'|undefined,arrow:'dot'|'none',draw:PlainPrim[])=>{
  const key=`mark:${l.id}`,o=over(key);if(o?.hidden)return;let P=pts,x=tx,y=ty,D=draw,text=[l.text];
  if(o?.dx||o?.dy){const dx=(o.dx||0)*pu,dy=(o.dy||0)*pu,sh=(q:[number,number]):[number,number]=>[q[0]+dx,q[1]+dy];P=pts.map(sh);x+=dx;y+=dy;
   D=draw.map(q=>q.t==='poly'?{...q,pts:q.pts.map((p,i)=>i?sh(p):p)}:q.t==='line'?{...q,x2:q.x2+dx,y2:q.y2+dy}:q.t==='text'?{...q,x:q.x+dx,y:q.y+dy}:q);}
  if(o?.text!==undefined){text=o.text.split('\n');const t0=D.find(q=>q.t==='text');if(t0&&t0.t==='text')D=[...D.filter(q=>q!==t0),...text.map((s2,i)=>({...t0,text:s2,y:t0.y+i*step}))];}
  put('mark',{t:'leader',pts:[[X(l.at[0]),Y(l.at[1])],...P],text,at:[x,y],anchor,...(o?.text!==undefined?{}:{mark:l.mark}),arrow,color:colorOf(l.id),size,bold:true,group:l.id,key,draw:D});};
 if(mode==='rows')for(const [list,above] of [[up,true],[down,false]] as const){
  const sorted=[...list].sort((p,q)=>p.at[0]-q.at[0]),x0=box.x+4*k,x1=box.x+box.w-4*k;let y=above?Y(vr[1])-GV:Y(vr[0])+GV+size,cursor=x0;
  for(const l of sorted){const w=tw(l);let x=Math.max(X(l.at[0])-w/2,cursor);if(x+w>x1){y+=above?-step:step;cursor=x0;x=Math.max(Math.min(X(l.at[0])-w/2,x1-w),x0);}
   const pts:[number,number][]=[[x+w/2,above?y+1.5*k:y-size]];
   leader(l,pts,x,y,undefined,'dot',[...leaderDraw(l,pts),{t:'text',x,y,text:l.text,size,color:colorOf(l.id),bold:true,halo:true,group:l.id}]);cursor=x+w+8*k;}}
 if(mode==='side'){for(const left of [true,false]){const side=labels.filter(l=>l.left===left).map(l=>({...l,ay:Y(l.at[1])})).sort((p,q)=>p.ay-q.ay);if(!side.length)continue;
  const top=box.y+size+2*k,bottom=box.y+box.h-4*k,gap=step*1.1;let y=-Infinity;const ys=side.map(l=>(y=Math.max(l.ay+size*.35,y+gap)));
  // past the bottom of the box: push the stack back up from the bottom
  if(ys.at(-1)!>bottom)for(let i=ys.length-1;i>=0;i--)ys[i]=Math.max(top+i*gap,i===ys.length-1?bottom:Math.min(ys[i],ys[i+1]-gap));
  const tx=left?X(u[0])-dimW:X(u[1])+lvW+dimW;
  side.forEach((l,i)=>{const ly=ys[i]-size*.35,edge=left?tx+1.5*k:tx-1.5*k,pts:[number,number][]=[[edge+(left?6:-6)*k,ly],[edge,ly]];
   leader(l,pts,tx,ys[i],left?'end':'start','dot',[...leaderDraw(l,pts),{t:'text',x:tx,y:ys[i],text:l.text,size,color:colorOf(l.id),bold:true,halo:true,anchor:left?'end':'start',group:l.id}]);});}}
 if(mode==='near'){const placed:{x:number;y:number;w:number}[]=[];
  for(const l of labels){const color=colorOf(l.id),ax=X(l.at[0]),ay=Y(l.at[1]),tw=textWidth(l.text,size);let x=ax+8*k,y=ay-8*k;
   for(let n=0;n<30&&placed.some(q=>x<q.x+q.w+2*k&&q.x<x+tw+2*k&&Math.abs(q.y-y)<step);n++)y+=step;
   placed.push({x,y,w:tw});
   leader(l,[[x,y-3*k]],x+2*k,y,undefined,'none',[{t:'line',x1:ax,y1:ay,x2:x,y2:y-3*k,stroke:color,width:.5*k,group:l.id},{t:'text',x:x+2*k,y,text:l.text,size,color,bold:true,halo:true,group:l.id}]);}}
 // one "COUPLER" label per view, left of the leftmost coupler
 const cp=v.bars.flatMap(b=>b.couplers).sort((p,q)=>p[0]-q[0])[0];
 if(cp){const x=X(cp[0])-10*k,y=Y(cp[1])-12*k;put('mark',{t:'line',x1:X(cp[0])-3*k,y1:Y(cp[1])-3*k,x2:x,y2:y,stroke:'#3f5459',width:.5*k},{t:'text',x:x-2*k,y:y+3*k,text:'COUPLER',size:8.5*k*fs,color:'#3f5459',bold:true,anchor:'end',halo:true});}
 // dimension segments (semantic): `a` / `b` = feature points, `line` = a point on the dimension line, value = real mm;
 // the whole chain's drawing rides on the first segment
 const chain=(segs:Omit<DimPrim,'t'|'kind'|'draw'|'size'>[],size:number,draw:PlainPrim[],color?:string)=>segs.forEach((d,i)=>put('dim',{t:'dim',kind:'linear',...d,size,color,draw:i?[]:draw}));
 // cover C: short dimension with ticks, value beside it (right of a vertical one, above a horizontal one)
 for(const [ci,c] of (hide.dims?[]:v.covers).entries()){if(over(`cover:${ci}`)?.hidden)continue;const x1=X(c.a[0]),y1=Y(c.a[1]),x2=X(c.b[0]),y2=Y(c.b[1]),vert=Math.abs(x1-x2)<.5,t=2.5*k,st={stroke:'#7a3e9d',width:.6*k};
  chain([{a:[x1,y1],b:[x2,y2],line:[x1,y1],dir:vert?'v':'h',value:Math.hypot(c.b[0]-c.a[0],c.b[1]-c.a[1]),text:'C=<>',key:`cover:${ci}`}],8*k*fs,[{t:'line',x1,y1,x2,y2,...st},...(vert?[{t:'line' as const,x1:x1-t,x2:x1+t,y1,y2:y1,...st},{t:'line' as const,x1:x2-t,x2:x2+t,y1:y2,y2,...st}]:[{t:'line' as const,x1,x2:x1,y1:y1-t,y2:y1+t,...st},{t:'line' as const,x1:x2,x2,y1:y2-t,y2:y2+t,...st}]),
   {t:'text',x:vert?x1+4*k:Math.max(x1,x2)+3*k,y:vert?(y1+y2)/2+3*k:y1-3*k,text:c.text,size:8*k*fs,color:'#7a3e9d',bold:true,halo:true}],'#7a3e9d');}
 // beam group: column faces (dashed), grid centre lines (dash-dot) with bubbles at the bottom, EX bar dimensions
 for(const c of v.beamCols){const y0=Y(c.lo),y1=Y(c.hi),cs={stroke:'#d07a2d',width:.7*k,dash:[5*k,3*k]};
  if(c.x1-c.x0>1)put('concreteHidden',{t:'line',x1:X(c.x0),x2:X(c.x0),y1:y0,y2:y1,...cs},{t:'line',x1:X(c.x1),x2:X(c.x1),y1:y0,y2:y1,...cs});
  put('symbol',{t:'line',x1:X(c.g),x2:X(c.g),y1:y0,y2:y1,stroke:'#7c8b8f',width:.5*k,dash:[10*k,3*k,2*k,3*k]});
  if(c.label){const r=5.5*k,cy=y0+r+1.5*k;put('dim',{t:'circle',cx:X(c.g),cy,r,stroke:'#4a5a66',width:.6*k,fill:'#ffffff'});put('text',{t:'text',x:X(c.g),y:cy+3*k*fs,text:c.label,size:8*k*fs,color:'#22393f',anchor:'middle'});}}
 if(v.band&&!hide.dims)for(const {d,row} of exDimRows(v.exDims)){if(over(`ex:${d.id}`)?.hidden)continue;const x0=d.stops[0],x1=d.stops.at(-1)!;
   const color=opts.colors.get(d.id)||'#3f5459',y=d.top?Y(v.band[1])-(9+row*9)*k:Y(v.band[0])+(9+row*9)*k,st={stroke:color,width:.6*k},ds=7.5*k*fs,draw:PlainPrim[]=[];
   draw.push({t:'line',x1:X(x0),x2:X(x1),y1:y,y2:y,...st});
   for(const p of d.stops)draw.push({t:'line',x1:X(p)-2*k,x2:X(p)+2*k,y1:y+2*k,y2:y-2*k,...st});
   d.stops.slice(1).forEach((p,i)=>{const a=d.stops[i],t=fmt(p-a);if(X(p)-X(a)>textWidth(t,ds)+2*k)draw.push({t:'text',x:(X(p)+X(a))/2,y:y-1.5*k,text:t,size:ds,color,anchor:'middle',halo:true});});
   chain(d.stops.slice(1).map((p,i)=>({a:[X(d.stops[i]),y],b:[X(p),y],line:[X(d.stops[i]),y],dir:'h' as const,value:p-d.stops[i],group:d.id,key:`ex:${d.id}`})),ds,draw,color);
   put('mark',{t:'text',x:X(x0)-3*k,y:y+2.5*k,text:d.mark,size:ds,color,bold:true,anchor:'end',halo:true});}
 // Dimensions.
 const line={stroke:'#5f7378',width:.7*k},dsize=10*k*fs;
 // Drawing Edit override `dim:<dir><side><n>` (n-th chain of that direction / side): hidden, dimension line moved (off,
 // paper mm: +y down for horizontal chains, +x right for vertical ones), text ('<>' = measured value)
 const dimN=new Map<string,number>();
 for(const d of hide.dims?[]:dimensionSets(v.member,v.input,v.axes,v.normal,v.columns,v.floor?.grids)){
  const kk=`${d.dir}${d.side}`,n=dimN.get(kk)||0;dimN.set(kk,n+1);const key=`dim:${kk}${n}`,o=over(key),off=(o?.off||0)*pu,tpl=o?.text,lab=(x:number)=>tpl!==undefined?tpl.replace('<>',fmt(x)):fmt(x);if(o?.hidden)continue;
  // mirrored view (look '-'): stops along the horizontal axis mirror too; a cropped view keeps the stops inside it
  const flipU=v.flip&&d.dir==='h',pts=[...new Set(d.stops.map(n=>Math.round((flipU?u[0]+u[1]-n:n)*10)/10))].filter(p=>!v.cropped||d.dir!=='h'||p>=u[0]-1&&p<=u[1]+1).sort((p,q)=>p-q);if(pts.length<2)continue;const draw:PlainPrim[]=[];
  if(d.dir==='h'){const y=(d.side==='start'?Y(vr[0])+22*k:Y(vr[1])-16*k)+off,fy=d.side==='start'?Y(vr[0]):Y(vr[1]);for(const p of pts)draw.push({t:'line',x1:X(p),x2:X(p),y1:y-5*k,y2:y+5*k,...line});draw.push({t:'line',x1:X(pts[0]),x2:X(pts.at(-1)!),y1:y,y2:y,...line});pts.slice(1).forEach((p,i)=>{if(X(p)-X(pts[i])>textWidth(lab(p-pts[i]),dsize)+2*k)draw.push({t:'text',x:(X(p)+X(pts[i]))/2,y:y-3*k,text:lab(p-pts[i]),size:dsize,color:'#3f5459',anchor:'middle'});});
   chain(pts.slice(1).map((p,i)=>({a:[X(pts[i]),fy],b:[X(p),fy],line:[X(pts[i]),y],dir:'h' as const,value:p-pts[i],key,...(tpl!==undefined?{text:tpl}:{})})),dsize,draw);}
  else{const x=(d.side==='start'?X(u[0])-24*k:X(u[1])+24*k)+off,fx=d.side==='start'?X(u[0]):X(u[1]);for(const p of pts)draw.push({t:'line',x1:x-5*k,x2:x+5*k,y1:Y(p),y2:Y(p),...line});draw.push({t:'line',x1:x,x2:x,y1:Y(pts[0]),y2:Y(pts.at(-1)!),...line});pts.slice(1).forEach((p,i)=>{if(Y(pts[i])-Y(p)>dsize*1.2)draw.push({t:'text',x:x+(d.side==='start'?-3*k:3*k),y:(Y(p)+Y(pts[i]))/2+3*k,text:lab(p-pts[i]),size:dsize,color:'#3f5459',anchor:d.side==='start'?'end':'start'});});
   chain(pts.slice(1).map((p,i)=>({a:[fx,Y(pts[i])],b:[fx,Y(p)],line:[x,Y(pts[i])],dir:'v' as const,value:p-pts[i],key,...(tpl!==undefined?{text:tpl}:{})})),dsize,draw);}
 }
 // slab floor: extra top bars across the beam (projection past the faces, L/n) and opening trimmers (past the opening edges);
 // one chain per Mark (Detail view: the one nearest its centre), drawn beside the bar
 if(F&&!opts.hide?.dims){const pick=new Map<string,typeof F.dims[number]>();
  for(const d of F.dims){if(!d.stops.some(x=>x>=u[0]&&x<=u[1]))continue;const o=pick.get(d.row);if(!o){pick.set(d.row,d);continue;}
   if(win){const c=(x:typeof d)=>Math.abs(x.at-(x.dir==='h'?win.v:win.u));if(c(d)<c(o))pick.set(d.row,d);}}
  for(const d of pick.values()){const key=`fdim:${d.id}`,o=over(key);if(o?.hidden)continue;const color=colorOf(d.row),h=d.dir==='h',off=(o?.off||0)*pu,ds=8*k*fs,st={stroke:color,width:.5*k},draw:PlainPrim[]=[];
   const pos=h?Y(d.at)-7*k+off:X(d.at)+7*k+off,P=(x:number)=>h?X(x):Y(x);
   draw.push(h?{t:'line',x1:P(d.stops[0]),x2:P(d.stops.at(-1)!),y1:pos,y2:pos,...st}:{t:'line',x1:pos,x2:pos,y1:P(d.stops[0]),y2:P(d.stops.at(-1)!),...st});
   for(const x of d.stops)draw.push(h?{t:'line',x1:P(x)-1.8*k,x2:P(x)+1.8*k,y1:pos+1.8*k,y2:pos-1.8*k,...st}:{t:'line',x1:pos-1.8*k,x2:pos+1.8*k,y1:P(x)+1.8*k,y2:P(x)-1.8*k,...st});
   d.stops.slice(1).forEach((x,i)=>{const val=x-d.stops[i],t=(o?.text??d.texts[i]??'<>').replace('<>',fmt(val));if(Math.abs(P(x)-P(d.stops[i]))<textWidth(t,ds)*(h?1:.4)+2*k)return;
    draw.push(h?{t:'text',x:(P(x)+P(d.stops[i]))/2,y:pos-1.3*k,text:t,size:ds,color,anchor:'middle',halo:true}:{t:'text',x:pos+1.5*k,y:(P(x)+P(d.stops[i]))/2+ds*.35,text:t,size:ds,color,halo:true});});
   chain(d.stops.slice(1).map((x,i)=>({a:(h?[P(d.stops[i]),Y(d.at)]:[X(d.at),P(d.stops[i])]) as [number,number],b:(h?[P(x),Y(d.at)]:[X(d.at),P(x)]) as [number,number],line:(h?[P(d.stops[i]),pos]:[pos,P(d.stops[i])]) as [number,number],dir:d.dir,value:x-d.stops[i],key,group:d.row,...((o?.text??d.texts[i])!==undefined?{text:o?.text??d.texts[i]}:{})})),ds,draw,color);}}
 // Stage names last: framed text at the first spot inside its stage band (spread across, stepping up / down) that
 // clears every text already on the view (Marks, levels, dimensions); else beside the concrete with a leader.
 const ss=9*k*fs,pad=3*k,bh=ss+2*pad,taken=expandPrims(out).flatMap(p=>{if(p.t!=='text')return [];const w=textWidth(p.text,p.size),x=p.anchor==='middle'?p.x-w/2:p.anchor==='end'?p.x-w:p.x;return [{x0:x,x1:x+w,y0:p.y-p.size,y1:p.y+p.size*.25}];});
 for(const t of v.stageText){
  const tw=textWidth(t.text,ss)+2*pad,x0=X(t.u0),x1=X(t.u1),yt=Y(t.v1),yb=Y(t.v0),mid=(yt+yb)/2,fits=x1-x0>=tw+8*k;
  const free=(cx:number,cy:number)=>cx-tw/2>=box.x+2*k&&cx+tw/2<=box.x+box.w-2*k&&cy-bh/2>=box.y+2*k&&cy+bh/2<=box.y+box.h-2*k&&
   !taken.some(q=>cx-tw/2<q.x1+1.5*k&&q.x0<cx+tw/2+1.5*k&&cy-bh/2<q.y1+k&&q.y0<cy+bh/2+k);
  const steps=Array.from({length:20},(_,n)=>mid+Math.ceil(n/2)*bh*.75*(n%2?-1:1)),inBand=steps.filter(cy=>cy-bh/2>=yt-1e-6&&cy+bh/2<=yb+1e-6);
  const across=fits?[.5,.25,.75,.15,.85,.35,.65].map(f=>Math.min(x1-tw/2-4*k,Math.max(x0+tw/2+4*k,x0+(x1-x0)*f))):[];
  const cands:[number,number][]=[...inBand.flatMap(cy=>across.map(cx=>[cx,cy] as [number,number])),...steps.flatMap(cy=>[[x0-tw/2-12*k,cy],[x1+tw/2+12*k,cy]] as [number,number][])];
  const [cx,cy]=cands.find(([x,y])=>free(x,y))??(inBand.length&&across.length?[across[0],inBand[0]]:[(x0+x1)/2,mid]);
  if(cx+tw/2<=x0||cx-tw/2>=x1)put('text',{t:'line',x1:cx+(cx<x0?tw/2:-tw/2),y1:cy,x2:(x0+x1)/2,y2:mid,stroke:'#8a4a3f',width:.5*k});
  put('text',{t:'rect',x:cx-tw/2,y:cy-bh/2,w:tw,h:bh,stroke:'#8a4a3f',width:.5*k,dash:[3*k,2*k]},{t:'text',x:cx,y:cy+ss*.35,text:t.text,size:ss,color:'#8a4a3f',anchor:'middle',halo:true});
  taken.push({x0:cx-tw/2,x1:cx+tw/2,y0:cy-bh/2,y1:cy+bh/2});
 }
 // walls on the footing (reference): outline again over the bars so the wall lines stay visible
 v.rects.filter(r=>r.kind==='wall').forEach(r=>put('concrete',{t:'rect',x:X(r.u0),y:Y(r.v1),w:(r.u1-r.u0)*s,h:(r.v1-r.v0)*s,stroke:'#22393f',width:1.6*k}));
 // Detail marks (parent view): dashed circle / square around the region, bubble with the detail label and its sheet
 for(const d of opts.detailMarks||[]){const cx=X(d.u),cy=Y(d.v),rr=d.r*s,ds={stroke:'#3f5459',width:.7*k,dash:[6*k,3*k]},br=5*k;
  put('symbol',d.circle===false?{t:'rect',x:cx-rr,y:cy-rr,w:2*rr,h:2*rr,...ds}:{t:'circle',cx,cy,r:rr,...ds});
  const bx=cx+rr*.72+br*1.6,by=cy-rr*.72-br*1.6;put('symbol',{t:'line',x1:cx+rr*.72,y1:cy-rr*.72,x2:bx-br*.7,y2:by+br*.7,stroke:'#3f5459',width:.5*k},{t:'circle',cx:bx,cy:by,r:br,stroke:'#3f5459',width:.6*k,fill:'#ffffff'},{t:'line',x1:bx-br,x2:bx+br,y1:by,y2:by,stroke:'#3f5459',width:.4*k});
  put('text',{t:'text',x:bx,y:by-1.2*k,text:d.label,size:5*k*fs,color:'#22393f',anchor:'middle',bold:true},{t:'text',x:bx,y:by+4.3*k,text:d.ref||'—',size:4.2*k*fs,color:'#4b6166',anchor:'middle'});}
 // Detail view: everything drawn so far is cut to the window (circle / square) + its boundary
 if(win){const sh=win.circle!==false?{kind:'circle' as const,cx:X(win.u),cy:Y(win.v),r:win.r*s}:{kind:'rect' as const,x0:X(win.u-win.r),y0:Y(win.v+win.r),x1:X(win.u+win.r),y1:Y(win.v-win.r)};
  const kept=clipPrims(out.splice(0),sh);out.push(...kept);
  // slab floor opening detail: cut bars / trimmers / diagonals / extension under the window
  (v.floorNote||[]).forEach((t,i)=>put('text',{t:'text',x:box.x+3*k,y:box.y+box.h-4*k-((v.floorNote!.length-1-i)*9.5*k),text:t,size:8*k*fs,color:i?'#4b6166':'#22393f',bold:!i,halo:true}));
  put('symbol',sh.kind==='circle'?{t:'circle',cx:sh.cx,cy:sh.cy,r:sh.r,stroke:'#3f5459',width:.7*k,dash:[6*k,3*k]}:{t:'rect',x:sh.x0,y:sh.y0,w:sh.x1-sh.x0,h:sh.y1-sh.y0,stroke:'#3f5459',width:.7*k,dash:[6*k,3*k]});}
 // Drawing Edit user objects: text (MTEXT) at a view point; leaders (text offset in paper mm, phase 2: Mark text from the bar);
 // dimension chains and level marks at anchors (`anchorPoint`: concrete edge / bar / point). Lost bar anchors are drawn red.
 const cbox=concreteBox(v),barIds=new Set(v.bars.map(b=>b.row.id)),lost='#c0262d';
 const AP=(a:Anchor)=>anchorPoint(a,cbox,v.bars),gone=(a:{bar?:string})=>!!a.bar&&!barIds.has(a.bar);
 for(const o of opts.edits?.objs||[]){const key=`user:${o.id}`,ink='#22393f';
  if(o.kind==='cloud'){const P=o.pts.map(q=>[X(q[0]),Y(q[1])] as [number,number]),arc=3*pu,pts:[number,number][]=[],red='#b03a2e';
   // scallops: each edge split into arcs of about 3 mm bulging outwards (polygon drawn counter-clockwise on paper → left normal)
   const area=P.reduce((a,p,i)=>{const q=P[(i+1)%P.length];return a+p[0]*q[1]-q[0]*p[1];},0),sg=area>0?-1:1;
   P.forEach((a,i)=>{const b=P[(i+1)%P.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.round(len/arc)),ux=(b[0]-a[0])/len,uy=(b[1]-a[1])/len,nx=-uy*sg,ny=ux*sg;
    for(let j=0;j<n;j++)for(let t=0;t<6;t++){const f=(j+t/6)/n,h=Math.sin(Math.PI*t/6)*len/n*.45;pts.push([a[0]+(b[0]-a[0])*f+nx*h,a[1]+(b[1]-a[1])*f+ny*h]);}});
   put('symbol',{t:'poly',pts,closed:true,stroke:red,width:.5*k,key});
   const [tx,ty]=P.reduce((m2,p)=>p[1]<m2[1]?p:m2,P[0]),tr=2.6*pu;put('symbol',{t:'poly',pts:[[tx,ty-tr*1.6],[tx-tr,ty+tr*.2-tr*1.6+tr*1.4],[tx+tr,ty+tr*.2-tr*1.6+tr*1.4]],closed:true,stroke:red,width:.5*k,fill:'#ffffff',key},{t:'text',x:tx,y:ty-tr*.25,text:o.rev,size:2.4*pu,color:red,anchor:'middle',bold:true,key});
   continue;}
  if(o.kind==='dim'){const pts=o.pts.map(AP),h=o.dir==='h',bad=o.pts.some(gone),col=bad?lost:'#3f5459',st={stroke:bad?lost:'#5f7378',width:.7*k},dsz=(o.size??2.6)*pu;
   const order=pts.map((p,i)=>({p,i})).sort((a,b)=>h?a.p[0]-b.p[0]:a.p[1]-b.p[1]).map(x=>x.p).filter((p,i,a)=>!i||Math.abs(h?p[0]-a[i-1][0]:p[1]-a[i-1][1])>.5);if(order.length<2)continue;
   const pos=h?Y(pts[0][1])+o.off*pu:X(pts[0][0])+o.off*pu,lab=(x:number)=>o.text!==undefined?o.text.replace('<>',fmt(x)):fmt(x),draw:PlainPrim[]=[],g=1.5*pu,t=1.1*pu;
   for(const p of order){const px=X(p[0]),py=Y(p[1]);
    if(h){const sg=pos>py?1:-1;draw.push({t:'line',x1:px,y1:py+sg*g,x2:px,y2:pos+sg*g,...st},{t:'line',x1:px-t,y1:pos+t,x2:px+t,y2:pos-t,...st,width:1.1*k});}
    else{const sg=pos>px?1:-1;draw.push({t:'line',x1:px+sg*g,y1:py,x2:pos+sg*g,y2:py,...st},{t:'line',x1:pos-t,y1:py+t,x2:pos+t,y2:py-t,...st,width:1.1*k});}}
   const f0=order[0],f1=order.at(-1)!;
   draw.push(h?{t:'line',x1:X(f0[0])-g,x2:X(f1[0])+g,y1:pos,y2:pos,...st}:{t:'line',x1:pos,x2:pos,y1:Y(f0[1])+g,y2:Y(f1[1])-g,...st});
   order.slice(1).forEach((p,i)=>{const q=order[i],val=Math.abs(h?p[0]-q[0]:p[1]-q[1]),txt=lab(val);
    draw.push(h?{t:'text',x:(X(p[0])+X(q[0]))/2,y:pos-.9*pu,text:txt,size:dsz,color:col,anchor:'middle',halo:true}:{t:'text',x:pos-.9*pu,y:(Y(p[1])+Y(q[1]))/2+dsz*.35,text:txt,size:dsz,color:col,anchor:'end',halo:true});});
   chain(order.slice(1).map((p,i)=>{const q=order[i];return {a:[X(q[0]),Y(q[1])] as [number,number],b:[X(p[0]),Y(p[1])] as [number,number],line:(h?[X(q[0]),pos]:[pos,Y(q[1])]) as [number,number],dir:o.dir,value:Math.abs(h?p[0]-q[0]:p[1]-q[1]),key,...(o.text!==undefined?{text:o.text}:{})};}),dsz,draw,col);continue;}
  if(o.kind==='level'){const [lu,lv]=AP(o.at),bad=gone(o.at),col=bad?lost:'#3f5459',x0=X(lu),y=Y(lv),x=x0+o.dx*pu,hh=5*k,sz=9*k*fs,dir=o.dx>=0?1:-1;
   const sg=(z:number)=>`${z>0?'+':z<0?'−':'±'}${Math.abs(z).toFixed(3)}`,text=`${o.label?o.label+' ':''}${sg((v.datum??0)+lv/1000)}`,tw2=textWidth(text,sz);
   const tx=dir>0?x+hh:x-hh;put('dim',{t:'line',x1:x0,x2:dir>0?tx+tw2+2*k:tx-tw2-2*k,y1:y,y2:y,stroke:col,width:.6*k,key},{t:'poly',pts:[[x,y],[x-hh*.6,y-hh],[x+hh*.6,y-hh]],closed:true,stroke:col,width:.6*k,key},
    {t:'text',x:tx,y:y-2*k,text,size:sz,color:col,halo:true,anchor:dir>0?'start':'end',key});continue;}
  const at0=o.kind==='leader'&&o.pos&&o.bar?AP({u:o.at[0],v:o.at[1],bar:o.bar,pos:o.pos,...(o.t!==undefined?{t:o.t}:{})}):o.at,sz=(o.size??2.6)*pu,st2=sz*1.35,ax=X(at0[0]),ay=Y(at0[1]);
  if(o.kind==='text'){const draw:PlainPrim[]=o.lines.map((t,i)=>({t:'text',x:ax,y:ay+i*st2,text:t,size:sz,color:ink,anchor:o.anchor,bold:o.bold,halo:true}));
   put('text',{t:'mtext',x:ax,y:ay,lines:o.lines,size:sz,step:st2,anchor:o.anchor,color:ink,bold:o.bold,key,draw});continue;}
  const bad=gone(o),row=o.bar&&!bad?v.bars.find(b=>b.row.id===o.bar):undefined,col=bad?lost:row?colorOf(row.row.id):ink;
  const lines=o.fromMark&&row?[row.dist?`${row.row.mark} ${row.dist.n}-${barName(row.row.diameter)}@${Math.round(row.dist.spacing/5)*5}`:row.row.mark]:o.lines;
  const ex=ax+o.dx*pu,ey=ay+o.dy*pu,dir=o.dx>=0?1:-1,sx=ex+dir*3*pu,tx=sx+dir*pu,ty=ey+sz*.35,anchor=dir>0?'start' as const:'end' as const,draw:PlainPrim[]=[{t:'poly',pts:[[ax,ay],[ex,ey],[sx,ey]],closed:false,stroke:col,width:.45*k}];
  if(o.arrow==='dot')draw.push({t:'circle',cx:ax,cy:ay,r:.6*pu,fill:col});
  else if(o.arrow==='closed'){const l=Math.hypot(ex-ax,ey-ay)||1,ux=(ex-ax)/l,uy=(ey-ay)/l,a=2*pu,b=.6*pu;draw.push({t:'poly',pts:[[ax,ay],[ax+ux*a-uy*b,ay+uy*a+ux*b],[ax+ux*a+uy*b,ay+uy*a-ux*b]],closed:true,fill:col,stroke:col,width:.2*k});}
  lines.forEach((t,i)=>draw.push({t:'text',x:tx,y:ty+i*st2,text:t,size:sz,color:col,anchor,halo:true,bold:!!(o.fromMark&&row)}));
  const mk=o.fromMark&&row?{mark:{mark:row.row.mark,size:barName(row.row.diameter),...(row.dist?{n:row.dist.n,spacing:Math.round(row.dist.spacing/5)*5}:{})}}:{};
  put('mark',{t:'leader',pts:[[ax,ay],[ex,ey],[sx,ey]],text:lines,at:[tx,ty],anchor,arrow:o.arrow,color:col,size:sz,bold:!!(o.fromMark&&row),key,...mk,draw});}
 const axisName=['X','Y','Z'];
 put('text',{t:'text',x:box.x+box.w-6*k,y:box.y+box.h-6*k,text:`${axisName[v.axes[0]]} ${v.flip?'←':'→'} · ${axisName[v.axes[1]]} ↑`,size:9*k*fs,color:'#9aa8a6',anchor:'end'});
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

/** Bounding box of the concrete of a view (rects + polygons, view mm); the whole view range when there is none. */
export function concreteBox(v:ViewData){let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
 for(const r of v.rects)if(r.kind==='concrete'){u0=Math.min(u0,r.u0);u1=Math.max(u1,r.u1);v0=Math.min(v0,r.v0);v1=Math.max(v1,r.v1);}
 for(const p of v.polys)for(const q of p){u0=Math.min(u0,q[0]);u1=Math.max(u1,q[0]);v0=Math.min(v0,q[1]);v1=Math.max(v1,q[1]);}
 return Number.isFinite(u0)?{u0,u1,v0,v1}:{u0:v.u[0],u1:v.u[1],v0:v.v[0],v1:v.v[1]};}
type BarItem={kind:'dot';p:[number,number]}|{kind:'line';a:[number,number];b:[number,number]};
/** First / last bar of a Mark in a view (Drawing Edit anchors `pos`): bar dots ordered along their wider spread; bar lines =
 * the segments parallel to the longest one, ordered across it (the longest at an equal offset), ends ordered along it.
 * Undefined when the Mark shows fewer than 2 bars there. */
export function barExtremes(b:{dots:[number,number][];lines:Line[]}):{first:BarItem;last:BarItem}|undefined{
 if(b.dots.length>=2){const us=b.dots.map(d=>d[0]),vs=b.dots.map(d=>d[1]),ax=Math.max(...us)-Math.min(...us)>=Math.max(...vs)-Math.min(...vs)?0:1;
  const s=[...b.dots].sort((p,q)=>p[ax]-q[ax]||p[1-ax]-q[1-ax]);return {first:{kind:'dot',p:s[0]},last:{kind:'dot',p:s.at(-1)!}};}
 if(b.dots.length||b.lines.length<2)return;
 const len=(l:Line)=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),ref=b.lines.reduce((m,l)=>len(l)>len(m)?l:m),L=len(ref);if(L<1)return;
 const dx=(ref.b[0]-ref.a[0])/L,dy=(ref.b[1]-ref.a[1])/L,along=(p:[number,number])=>p[0]*dx+p[1]*dy,across=(p:[number,number])=>-p[0]*dy+p[1]*dx;
 const par=b.lines.filter(l=>len(l)>=1&&Math.abs((l.b[0]-l.a[0])*dy-(l.b[1]-l.a[1])*dx)/len(l)<.02).map(l=>{const [a,c]=along(l.a)<=along(l.b)?[l.a,l.b]:[l.b,l.a];return {kind:'line' as const,a,b:c,o:across(l.a),n:len(l)};});
 const os=par.map(l=>l.o),lo=Math.min(...os),hi=Math.max(...os);if(hi-lo<1)return;
 const pick=(o:number)=>par.filter(l=>Math.abs(l.o-o)<.5).reduce((m,l)=>l.n>m.n?l:m);const f=pick(lo),l=pick(hi);
 return {first:{kind:'line',a:f.a,b:f.b},last:{kind:'line',a:l.a,b:l.b}};}
const itemPoint=(i:BarItem,t=0):[number,number]=>i.kind==='dot'?i.p:[i.a[0]+(i.b[0]-i.a[0])*t,i.a[1]+(i.b[1]-i.a[1])*t];
/** View point of a Drawing Edit anchor: on the first / last bar of its Mark (`pos`, needs the view `bars`), else `eu` / `ev`
 * follow the concrete edge (min / max), else the stored point. */
export function anchorPoint(a:Anchor,cb:ReturnType<typeof concreteBox>,bars?:{row:{id:string};dots:[number,number][];lines:Line[]}[]):[number,number]{
 if(a.pos&&a.bar&&bars){const b=bars.find(x=>x.row.id===a.bar),e=b&&barExtremes(b);if(e)return itemPoint(e[a.pos],a.t);}
 return [a.eu?a.eu==='min'?cb.u0:cb.u1:a.u,a.ev?a.ev==='min'?cb.v0:cb.v1:a.v];}
export type ViewSnap={u:number;v:number;kind:'corner'|'mid'|'bar';label:string;bar?:string;eu?:'min'|'max';ev?:'min'|'max';pos?:'first'|'last';t?:number};
/** Snap points of a drawn view (Drawing Edit tools): concrete corners / edge midpoints (flagged when on the concrete box edge),
 * bar dots, bar line ends and midpoints (with the Mark row id). At most `max` points. */
export function viewSnapPoints(v:ViewData,max=1500):ViewSnap[]{
 const cb=concreteBox(v),out:ViewSnap[]=[],seen=new Set<string>(),near=(a:number,b:number)=>Math.abs(a-b)<.5;
 const add=(s:ViewSnap)=>{const id=`${Math.round(s.u)}:${Math.round(s.v)}:${s.kind}:${s.bar||''}`;if(seen.has(id)||out.length>=max)return;seen.add(id);
  out.push({...s,...(near(s.u,cb.u0)?{eu:'min' as const}:near(s.u,cb.u1)?{eu:'max' as const}:{}),...(s.kind!=='bar'&&near(s.v,cb.v0)?{ev:'min' as const}:s.kind!=='bar'&&near(s.v,cb.v1)?{ev:'max' as const}:{})});};
 for(const r of v.rects)if(r.kind==='concrete'){for(const [u,w] of [[r.u0,r.v0],[r.u1,r.v0],[r.u1,r.v1],[r.u0,r.v1]])add({u,v:w,kind:'corner',label:'มุมคอนกรีต'});
  for(const [u,w] of [[(r.u0+r.u1)/2,r.v0],[(r.u0+r.u1)/2,r.v1],[r.u0,(r.v0+r.v1)/2],[r.u1,(r.v0+r.v1)/2]])add({u,v:w,kind:'mid',label:'กึ่งกลางขอบ'});}
 for(const p of v.polys)for(const q of p)add({u:q[0],v:q[1],kind:'corner',label:'มุมคอนกรีต'});
 for(const b of v.bars){const l=`เหล็ก ${b.row.mark}`,bar=b.row.id;let n=0;
  // first / last bar of the Mark first: those snaps keep `pos` (the anchor follows the edge bar when the count changes)
  const e=barExtremes(b),PN={first:'เส้นแรก',last:'เส้นสุดท้าย'};
  if(e)for(const pos of ['first','last'] as const){const it=e[pos];
   if(it.kind==='dot')add({u:it.p[0],v:it.p[1],kind:'bar',label:`${l} (${PN[pos]})`,bar,pos});
   else for(const t of [0,.5,1]){const [u,w]=itemPoint(it,t);add({u,v:w,kind:'bar',label:`${l} (${PN[pos]}${t===.5?' กลาง':''})`,bar,pos,t});}}
  for(const d of b.dots){if(n++>200)break;add({u:d[0],v:d[1],kind:'bar',label:l,bar});}
  for(const ln of b.lines){if(n++>200)break;add({u:ln.a[0],v:ln.a[1],kind:'bar',label:l,bar});add({u:ln.b[0],v:ln.b[1],kind:'bar',label:l,bar});add({u:(ln.a[0]+ln.b[0])/2,v:(ln.a[1]+ln.b[1])/2,kind:'bar',label:`${l} (กลาง)`,bar});}}
 return out;}
/** Ids of the user objects of a view whose bar anchor is gone (the bar Mark is no longer drawn in that view). */
export function lostAnchors(v:ViewData,edits:ViewEdits|undefined):string[]{const ids=new Set(v.bars.map(b=>b.row.id));
 return (edits?.objs||[]).filter(o=>o.kind==='dim'?o.pts.some(a=>a.bar&&!ids.has(a.bar)):o.kind==='level'?!!o.at.bar&&!ids.has(o.at.bar):o.kind==='leader'?!!o.bar&&!ids.has(o.bar):false).map(o=>o.id);}
