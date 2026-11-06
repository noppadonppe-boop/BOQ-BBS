import {blankBar,type Bar,type Member,type Spec,type Vec3} from './model';
import {DEFAULT_DETAILING,bendRadius,boxColumnTieLayout,closedLink,gradeFor,innerTieBars,lapLength,hookDevLength,tiePatterns,type Detailing,type TiePattern} from './elementInput';
import {detailingFromSpec} from './specDetailing';
import {inMulti,partPolygon,shapeGeometry} from './shapeGeometry';
import {faceKeys,type FaceKey,type PartPurpose,type PartRebar,type ShapeModel,type ShapePart} from './shapeModelSchema';
import {coverRings,layoutOf,loopBars,meshBars,sketchRadius,verticalFaceBars,type P2} from './rebarSketch';
import {editablePlacementContext,REGION_LIMIT} from './placementContext';
import {schedule} from './engine';
import {barOwner,markFor,tagMarks} from './partTags';

// Reinforcement per shape-model part (custom elements): a part's purpose (column / beam / slab / wall / footing)
// picks preset bar sets built from the part geometry. Preset bars have ids `pp-<part id>-<key>` and are rebuilt
// from `part.rebar` whenever the shape changes; bars drawn while a part is in focus have ids `sk-<part id>-…`
// and move with their part. Bar portions past the concrete (laps, starters, dowels) get reference regions `genext-<k>`.
export const PRESET_PREFIX='pp-';
export type Box3={x0:number;x1:number;y0:number;y1:number;z0:number;z1:number};
export function partBox(p:ShapePart):Box3{const r=partPolygon(p)[0],xs=r.map(q=>q[0]),ys=r.map(q=>q[1]);return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys),z0:p.z0,z1:p.z0+p.height};}
/** Part a bar belongs to (longest matching part id, so `a` never claims `a-b`'s bars). */
export function barPart(sm:ShapeModel|undefined,b:Bar):string|undefined{
 if(!sm)return;let best:string|undefined;
 for(const p of sm.parts)if((b.id.startsWith(`${PRESET_PREFIX}${p.id}-`)||b.id.startsWith(`sk-${p.id}-`))&&(!best||p.id.length>best.length))best=p.id;
 return best;
}
export const isPresetBar=(b:Bar)=>b.id.startsWith(PRESET_PREFIX);
/** Cover set for one face of a part (face value, else side for vertical faces, else the part cover); undefined = not set. */
export function setCover(p:ShapePart,face:FaceKey):number|undefined{const c=p.covers;return c?.[face]??(face!=='top'&&face!=='bottom'?c?.side:undefined)??p.rebar?.cover;}
/** Cover of every face of a part, never below the member cover (placement checks use the member cover). */
export function faceCovers(m:Member,p:ShapePart):Record<FaceKey,number>{
 return Object.fromEntries(faceKeys.map(k=>[k,Math.max(m.cover,setCover(p,k)??m.cover)])) as Record<FaceKey,number>;
}
const viewAx={plan:[0,1],sx:[0,2],sy:[1,2]} as const;
const faceOf=(axis:number,positive:boolean):FaceKey=>axis===0?(positive?'x1':'x0'):axis===1?(positive?'y1':'y0'):(positive?'top':'bottom');
/** Part face a view edge lies on (a → b with the concrete on its left, as region rings run): box faces of solid parts by their
 * extents, round / polygon outlines in plan = side; only parts the view plane cuts (`at` along its normal). Several parts on one
 * edge: all of them. */
export function edgeFaces(m:Member,kind:'plan'|'sx'|'sy',a:P2,b:P2,at?:number):{part:ShapePart;face:FaceKey|'side'}[]{
 const sm=m.shapeModel,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(!sm||l<1e-6)return [];
 const out:P2=[dy/l,-dx/l],mid:P2=[(a[0]+b[0])/2,(a[1]+b[1])/2],[au,av]=viewAx[kind],t=1,hits:{part:ShapePart;face:FaceKey|'side'}[]=[];
 const an=kind==='plan'?2:kind==='sx'?1:0;
 for(const p of sm.parts){if(p.role!=='solid')continue;const bx=partBox(p),lo=[bx.x0,bx.y0,bx.z0],hi=[bx.x1,bx.y1,bx.z1];if(at!==undefined&&(at<lo[an]-t||at>hi[an]+t))continue;const inU=mid[0]>=lo[au]-t&&mid[0]<=hi[au]+t,inV=mid[1]>=lo[av]-t&&mid[1]<=hi[av]+t;
  if(Math.abs(out[0])>.99&&inV){const pos=out[0]>0,u=pos?hi[au]:lo[au];if(Math.abs(mid[0]-u)<t){hits.push({part:p,face:p.shape==='box'?faceOf(au,pos):'side'});continue;}}
  if(Math.abs(out[1])>.99&&inU){const pos=out[1]>0,v=pos?hi[av]:lo[av];if(Math.abs(mid[1]-v)<t){hits.push({part:p,face:p.shape==='box'||av===2?faceOf(av,pos):'side'});continue;}}
  // round / polygon outlines in plan
  if(kind==='plan'&&p.shape!=='box'&&mid[0]>=bx.x0-t&&mid[0]<=bx.x1+t&&mid[1]>=bx.y0-t&&mid[1]<=bx.y1+t&&partPolygon(p).some(ring=>ring.some((q,i)=>{const w=ring[(i+1)%ring.length],ex=w[0]-q[0],ey=w[1]-q[1],L=ex*ex+ey*ey;if(L<1e-9)return false;const k=Math.max(0,Math.min(1,((mid[0]-q[0])*ex+(mid[1]-q[1])*ey)/L));return Math.hypot(mid[0]-q[0]-k*ex,mid[1]-q[1]-k*ey)<t;})))hits.push({part:p,face:'side'});
 }
 return hits;
}
/** Cover set on the faces under a view edge (largest), undefined when none is set there. */
export function edgeCover(m:Member,kind:'plan'|'sx'|'sy',a:P2,b:P2,at?:number):number|undefined{
 let c:number|undefined;for(const h of edgeFaces(m,kind,a,b,at)){const v=h.face==='side'?h.part.covers?.side??h.part.rebar?.cover:setCover(h.part,h.face);if(v!==undefined)c=Math.max(c??0,v);}return c;
}
export const partSketchId=(partId:string)=>`sk-${partId}-${crypto.randomUUID().replace(/-/g,'').slice(0,10)}`;

/** Purpose guessed from the part's proportions (thin & wide = slab / wall, tall & small = column, long = beam);
 * with the model: a block cast on a footing (not a column / thin wall) is footing too (upper pour, step). */
export function guessPurpose(p:ShapePart,sm?:ShapeModel):PartPurpose{
 if(p.role==='void')return 'other';
 const b=partBox(p),w=b.x1-b.x0,d=b.y1-b.y0,h=p.height,small=Math.min(w,d),big=Math.max(w,d);
 if(p.shape==='circle'&&p.inner>0||p.shape==='shaft')return 'wall';
 if(h<=Math.min(400,small/3))return 'slab';
 if(small<=400&&big>=3*small&&h>=big/3)return 'wall';
 if(h>=2*small&&big<=1.5*small)return 'column';
 const s=sm&&supportOf(sm,p);if(s&&(s.q.rebar?.purpose??guessPurpose(s.q))==='footing')return 'footing';
 if(big>=3*small&&h<big/3)return 'beam';
 return small>=1000&&h<=small?'footing':'other';
}
/** Preset values for a purpose (sized from the part): the user edits them in the rebar workspace. With the model,
 * slabs / footings cast on lower concrete get no bottom mesh (the joint is covered by the lower part's top mesh). */
export function defaultPartRebar(purpose:PartPurpose,p:ShapePart,det:Detailing,sm?:ShapeModel):PartRebar{
 const r=presetFor(purpose,p,det);
 // reference wall / column: dowels / starters lap into it
 if(p.role==='reference')return {...r,anchor:true,ext:lapLength(det,r.main?.d||r.vert?.d||16)};
 // footing on a footing (upper pour / step): loops joined with the touching parts at the same level
 return sm&&(purpose==='slab'||purpose==='footing')&&restsOn(sm,p)&&r.meshB?{...r,meshB:{...r.meshB,s:0},meshT:{d:r.meshT?.d||12,s:r.meshT?.s||200},...(purpose==='footing'?{loopsJoined:true}:{})}:r;
}
function presetFor(purpose:PartPurpose,p:ShapePart,det:Detailing):PartRebar{
 const b=partBox(p),small=Math.min(b.x1-b.x0,b.y1-b.y0);
 switch(purpose){
  case 'column':{const n=(len:number)=>Math.max(2,Math.min(8,Math.round(len/200)+1));return {purpose,main:{d:16,nx:n(b.x1-b.x0),ny:n(b.y1-b.y0)},tie:{d:9,s:150},ext:lapLength(det,16),anchor:true};}
  case 'beam':return {purpose,top:{d:16,n:Math.max(2,Math.round(small/100))},bottom:{d:16,n:Math.max(2,Math.round(small/100))},stirrup:{d:9,s:150},ext:0};
  case 'slab':return {purpose,meshB:{d:12,s:200},meshT:{d:12,s:0}};
  case 'wall':return {purpose,vert:{d:12,s:200},horz:{d:12,s:200},layers:small>=200?2:1,ext:0,anchor:true};
  case 'footing':return {purpose,meshB:{d:16,s:200},meshT:{d:12,s:p.height>=600?200:0},legs:false,loops:{d:12,s:p.height>600?200:0}};
  default:return {purpose};
 }
}
export const detailingFor=(spec:Spec)=>detailingFromSpec(spec,{...DEFAULT_DETAILING},{category:'Custom'});
/** The member reduced to one part (+ the openings) so area / loop generators work on that part alone. */
const partMember=(m:Member,p:ShapePart):Member=>({...m,shapeModel:{...m.shapeModel!,parts:[p,...m.shapeModel!.parts.filter(q=>q.role==='void'&&q.id!==p.id)],piles:undefined}});
/** Solid part this one stands on (top at its z0, overlapping in plan); the largest wins. */
function supportOf(sm:ShapeModel,p:ShapePart){
 const b=partBox(p);return sm.parts.filter(q=>q.id!==p.id&&q.role==='solid'&&Math.abs(q.z0+q.height-p.z0)<1).map(q=>({q,c:partBox(q)}))
  .filter(({c})=>c.x0<b.x1&&b.x0<c.x1&&c.y0<b.y1&&b.y0<c.y1).sort((s,t)=>(t.c.x1-t.c.x0)*(t.c.y1-t.c.y0)-(s.c.x1-s.c.x0)*(s.c.y1-s.c.y0))[0];
}
const holds=(c:Box3,b:Box3)=>c.x0<=b.x0+1e-6&&c.x1>=b.x1-1e-6&&c.y0<=b.y0+1e-6&&c.y1>=b.y1-1e-6;
/** Cast on lower concrete over its whole footprint (an upper pour / step): no bottom mesh needed. */
function restsOn(sm:ShapeModel,p:ShapePart){const b=partBox(p);return sm.parts.some(q=>q.id!==p.id&&q.role==='solid'&&Math.abs(q.z0+q.height-p.z0)<1&&holds(partBox(q),b));}
/** Covered by a part cast on its whole top (a pit box under a mat): no top mesh needed. */
function coveredAbove(sm:ShapeModel,p:ShapePart){const b=partBox(p);return sm.parts.some(q=>q.id!==p.id&&q.role==='solid'&&Math.abs(q.z0-b.z1)<1&&holds(partBox(q),b));}
/** Part to anchor in: the support, else a solid part holding this part's base (a starter cast inside a mat). */
function hostOf(sm:ShapeModel,p:ShapePart){
 const b=partBox(p);let s=supportOf(sm,p);
 // a support standing on a part that holds the whole footprint: anchor in the lowest (starters through an upper pour into the mat)
 while(s){const d=supportOf(sm,s.q);if(!d||!(d.c.x0<=b.x0+1e-6&&d.c.x1>=b.x1-1e-6&&d.c.y0<=b.y0+1e-6&&d.c.y1>=b.y1-1e-6))break;s=d;}
 if(s)return s;const corners:P2[]=[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]];
 return sm.parts.filter(q=>q.id!==p.id&&q.role==='solid'&&q.z0<=p.z0+1e-6&&p.z0<q.z0+q.height-1e-6).map(q=>({q,c:partBox(q)}))
  .filter(({q})=>corners.every(k=>inMulti(k,[partPolygon(q) as P2[][]],1))).sort((s,t)=>(t.c.x1-t.c.x0)*(t.c.y1-t.c.y0)-(s.c.x1-s.c.x0)*(s.c.y1-s.c.y0))[0];
}
/** Footing parts with joined loops touching this one (directly or through each other) at the same base level, model order. */
export function joinedGroup(sm:ShapeModel,p:ShapePart):ShapePart[]{
 const ok=(q:ShapePart)=>q.role==='solid'&&q.rebar?.purpose==='footing'&&!!q.rebar.loopsJoined&&Math.abs(q.z0-p.z0)<1;
 const touch=(a:ShapePart,b:ShapePart)=>{const s=partBox(a),t=partBox(b);return s.x0<=t.x1+1&&t.x0<=s.x1+1&&s.y0<=t.y1+1&&t.y0<=s.y1+1;};
 if(!ok(p))return [p];const seen=new Set([p.id]),queue=[p];
 while(queue.length){const a=queue.shift()!;for(const q of sm.parts)if(!seen.has(q.id)&&ok(q)&&touch(a,q)){seen.add(q.id);queue.push(q);}}
 return sm.parts.filter(q=>seen.has(q.id));
}
/** Loops round the joined outline of a group, band by band between the parts' top levels: above a lower top only the
 * taller parts are looped; each band stops under the top mesh of the parts ending there. */
function joinedLoops(m:Member,group:ShapePart[],L:{d:number;s:number},c:number,det:Detailing,grade:string):Bar[]{
 const tops=[...new Set(group.map(q=>q.z0+q.height))].sort((a,b)=>a-b),voids=m.shapeModel!.parts.filter(q=>q.role==='void'),out:Bar[]=[];let from=group[0].z0;
 for(const t of tops){const parts=group.filter(q=>q.z0+q.height>=t-1e-6);
  const Td=Math.max(0,...group.filter(q=>Math.abs(q.z0+q.height-t)<1e-6).map(q=>q.rebar?.meshT&&q.rebar.meshT.s>0?q.rebar.meshT.d:0));
  const zs=from+L.s/2,ze=t-c-2*Td-L.d/2-5;
  if(ze>zs)out.push(...loopBars({...m,shapeModel:{...m.shapeModel!,parts:[...parts,...voids],piles:undefined}},{z:zs,zTop:ze,diameter:L.d,grade,spacing:L.s,cover:c,lap:lapLength(det,L.d),mark:'P',note:`ลูปรอบแปลนรวม ${parts.length} ชิ้น · Z ${Math.round(zs)}–${Math.round(ze)}`}));
  from=t;}
 return out;
}
const r3=(p:Vec3)=>p.map(v=>Number(v.toFixed(3))) as Vec3;
/** Inset (each axis) of a corner bar Ø d so it bears on the bend of a link Ø dt with centreline radius rad. */
const cornerInset=(rad:number,dt:number,d:number)=>Math.max(0,rad-dt/2-d/2)*(1-Math.SQRT1_2);
const axisOf=(k:number)=>(['X','Y','Z'] as const)[k];

/** Pit / opening walls (void part with purpose wall): horizontal loops and vertical bars round the opening, `c + d/2`
 * outside its faces in the surrounding concrete; verticals run from the concrete under the opening floor to its top. */
function voidFaceBars(m:Member,p:ShapePart,spec:Spec):{bars:Bar[];notes:string[]}{
 const r=p.rebar!,det=detailingFor(spec),c=Math.max(m.cover,r.cover??m.cover),V=r.vert,H=r.horz,b=partBox(p),g=shapeGeometry(m.shapeModel!),out:Bar[]=[];
 const inside=(q:P2,z:number)=>g.slabs.some(s=>z>=s.z0-.5&&z<=s.z1+.5&&inMulti(q,s.region,.5));
 const hole=partPolygon(p)[0],pad=1e5,big:P2[]=[[b.x0-pad,b.y0-pad],[b.x1+pad,b.y0-pad],[b.x1+pad,b.y1+pad],[b.x0-pad,b.y1+pad]];
 // horizontal layer outside the hole faces, vertical layer outside that (as walls: horizontal bars next to the face)
 const ringAt=(off:number)=>coverRings([[big,[...hole].reverse()]] as P2[][][],off).find(q=>Math.abs(q[0][0]-b.x0)<pad/2);
 const id=(k:string)=>`${PRESET_PREFIX}${p.id}-${k}`,grade=(d:number)=>gradeFor(det,d,d<=9?'SR24':det.mainGrade);
 const dh=H&&H.s>0?H.d:0,ringH=dh?ringAt(c+dh/2):undefined,ringV=V&&V.s>0?ringAt(c+dh+V.d/2):undefined;
 const z1=b.z1-c-Math.max(dh,V?.d||0)/2;
 if(ringH&&H){const lap=lapLength(det,H.d),f=ringH[0],s=ringH[1],l=Math.hypot(s[0]-f[0],s[1]-f[1]),k=Math.min(1,lap/(l||1)),z0=b.z0+c+H.d/2;
  const lay=layoutOf({rule:'spacing',spacing:H.s,count:0,from:z0,to:Math.max(z0,z1)});
  out.push({...blankBar('P'),id:id('horz'),diameter:H.d,grade:grade(H.d),count:lay.count,shape:'polyline',shapeCode:'99',axis:'X',face:'side',radius:Number(sketchRadius(H.d).toFixed(3)),
   points:[...ringH,f,[f[0]+(s[0]-f[0])*k,f[1]+(s[1]-f[1])*k]].map(q=>r3([q[0],q[1],z0])),distributionAxis:'Z',distributionStart:lay.from,distributionEnd:lay.to,note:`${p.label} · เหล็กนอนรอบผิวบ่อ DB${H.d} @${H.s} ทาบ ${Math.round(lap)}`});}
 if(ringV&&V){const pos:P2[]=[];ringV.forEach((a,k)=>{const e=ringV[(k+1)%ringV.length],len=Math.hypot(e[0]-a[0],e[1]-a[1]),n=Math.max(1,Math.ceil(len/V.s));for(let j=0;j<n;j++)pos.push([a[0]+(e[0]-a[0])*j/n,a[1]+(e[1]-a[1])*j/n]);});
  // bottom: down through the concrete under the opening floor to its cover
  let zb=b.z0;while(zb>b.z0-5000&&pos.every(q=>inside(q,zb-10)))zb-=10;zb+=c+V.d/2;
  if(z1-zb>2*V.d)out.push({...blankBar('P'),id:id('vert'),diameter:V.d,grade:grade(V.d),count:pos.length,shape:'polyline',shapeCode:'00',axis:'Z',face:'side',radius:0,lengthMethod:'bs8666',
   points:[[pos[0][0],pos[0][1],zb],[pos[0][0],pos[0][1],z1]].map(q=>r3(q as Vec3)),offsets:pos.map(q=>r3([q[0]-pos[0][0],q[1]-pos[0][1],0])),note:`${p.label} · เหล็กตั้งรอบผิวบ่อ DB${V.d} @${V.s} · ${pos.length} ตำแหน่ง`});}
 return {bars:out,notes:out.length?[]:[`${p.label}: ช่องเปิดนี้ไม่มีคอนกรีตล้อมรอบพอสำหรับเหล็กรอบผิว`]};
}
/** Preset bars of one part (ids `pp-<part>-<key>`, marks filled in by `applyPartPresets`). */
export function partPresetBars(m:Member,p:ShapePart,spec:Spec):{bars:Bar[];notes:string[]}{
 const r=p.rebar,sm=m.shapeModel;if(!r||!sm||r.purpose==='other'||p.role==='void'&&r.purpose!=='wall')return {bars:[],notes:[]};
 if(p.role==='void')return voidFaceBars(m,p,spec);
 // reference part (column / wall cast later): only its starters / dowels belong to this element
 const ref=p.role==='reference';
 if(ref&&r.purpose!=='column'&&r.purpose!=='wall')return {bars:[],notes:[`${p.label}: ชิ้นอ้างอิงใช้ Preset ได้เฉพาะเสา (เหล็กเริ่ม) / ผนัง (เหล็กเดือย)`]};
 // part cover can only add to the member cover (placement checks use the member cover)
 const det=detailingFor(spec),c=Math.max(m.cover,r.cover??m.cover),fc=faceCovers(m,p),b=partBox(p),notes:string[]=[],out:Bar[]=[];
 const grade=(d:number,tie=false)=>gradeFor(det,d,tie?det.tieGrade:d<=9?'SR24':det.mainGrade);
 const bar=(key:string,o:{d:number;tie?:boolean;points:Vec3[];code:string;axis:Bar['axis'];face?:Bar['face'];dist?:{axis:number;from:number;to:number;spacing?:number;count?:number};offsets?:Vec3[];turns?:number[];radius?:number;note:string}):Bar=>{
  const lay=o.dist?layoutOf(o.dist.count?{rule:'count',count:o.dist.count,spacing:0,from:o.dist.from,to:o.dist.to}:{rule:'spacing',spacing:o.dist.spacing||200,count:0,from:o.dist.from,to:o.dist.to}):undefined;
  return {...blankBar('P'),id:`${PRESET_PREFIX}${p.id}-${key}`,diameter:o.d,grade:grade(o.d,o.tie),count:o.offsets?o.offsets.length:lay?.count??1,shape:'polyline',shapeCode:o.code,axis:o.axis,face:o.face||'side',
   radius:Number((o.radius??(o.points.length>2?sketchRadius(o.d):0)).toFixed(3)),points:o.points.map(r3),
   ...(lay?{distributionAxis:axisOf(o.dist!.axis),distributionStart:lay.from,distributionEnd:lay.to}:{}),...(o.offsets?{offsets:o.offsets.map(r3),...(o.turns?{offsetTurns:o.turns}:{})}:{}),
   ...(['00','11','21'].includes(o.code)?{lengthMethod:'bs8666' as const}:{}),note:`${p.label} · ${o.note}`.slice(0,500)};
 };
 // area / loop generators (any plan shape) on the part alone, re-keyed
 const take=(key:string,bars:Bar[])=>bars.forEach((x,k)=>out.push({...x,id:`${PRESET_PREFIX}${p.id}-${key}${bars.length>1?k+1:''}`,note:`${p.label} · ${x.note}`.slice(0,500)}));
 const pm=partMember(m,p),boxy=p.shape==='box',geo=shapeGeometry(sm);
 const inConcrete=(w:Vec3)=>geo.slabs.some(s=>w[2]>=s.z0-.5&&w[2]<=s.z1+.5&&inMulti([w[0],w[1]],s.region,.5));
 if(r.purpose==='slab'||r.purpose==='footing'){
  const B=r.meshB,T=r.meshT;const zt=b.z1-fc.top,zb0=b.z0+fc.bottom;
  const legUp=r.purpose==='footing'&&r.legs&&B?Math.max(0,zt-(T&&T.s>0?2*T.d:0)-(zb0+B.d/2)-B.d):0;
  if(B&&B.s>0){take('bx',meshBars(pm,{z:zb0+B.d/2,diameter:B.d,grade:grade(B.d),spacing:B.s,cover:c,sides:fc,dirs:['X'],leg:legUp,note:'ตะแกรงล่าง'}));
   take('by',meshBars(pm,{z:zb0+1.5*B.d,diameter:B.d,grade:grade(B.d),spacing:B.s,cover:c,sides:fc,dirs:['Y'],leg:legUp?legUp-B.d:0,note:'ตะแกรงล่าง ชั้น 2'}));}
  if(T&&T.s>0){take('tx',meshBars(pm,{z:zt-T.d/2,diameter:T.d,grade:grade(T.d),spacing:T.s,cover:c,sides:fc,dirs:['X'],leg:0,note:'ตะแกรงบน'}));
   take('ty',meshBars(pm,{z:zt-1.5*T.d,diameter:T.d,grade:grade(T.d),spacing:T.s,cover:c,sides:fc,dirs:['Y'],leg:0,note:'ตะแกรงบน ชั้น 2'}));}
  const L=r.loops,group=r.purpose==='footing'&&r.loopsJoined?joinedGroup(sm,p):[p];
  // joined: the first part of the group builds loops round the group's outline, the others none
  if(r.purpose==='footing'&&L&&L.s>0&&group.length>1){if(group[0].id===p.id)take('gloop',joinedLoops(m,group,L,c,det,grade(L.d)));}
  else if(r.purpose==='footing'&&L&&L.s>0){const z0=zb0+2*(B?.d||16)+L.s/2,z1=zt-2*(T&&T.s>0?T.d:0)-L.d;
   if(z1>z0)take('loop',loopBars(pm,{z:z0,zTop:z1,diameter:L.d,grade:grade(L.d),spacing:L.s,cover:c,sides:fc,lap:lapLength(det,L.d),mark:'P',note:'ลูปรอบผิวข้าง'}));}
  if(!out.length)notes.push(`${p.label}: ไม่มีชั้นเหล็กที่ใช้ (ระยะ @ = 0)`);
 }
 if(r.purpose==='column'&&r.main){
  // reference column (cast later): starter bars only, from the host up to its base + lap, ties in the host
  const M=r.main,T=r.tie,stdIn=!!det.embedTie&&!!r.anchor&&(r.tieIn?r.tieIn.std===true:det.embedTie.enabled),dt=T?.d||(stdIn?det.embedTie!.diameter||r.tieIn?.d||12:r.tieIn&&r.tieIn.s>0?r.tieIn.d:0),a=c+dt+M.d/2,A=(k:'x0'|'x1'|'y0'|'y1')=>fc[k]+dt+M.d/2,top=ref?b.z0+(r.ext||lapLength(det,M.d)):r.ext?b.z1+r.ext:b.z1-fc.top-M.d/2,tieTop=b.z1-Math.max(50,fc.top+dt/2);
  // set-2 pattern of the section (column type) and which ties go into the support: outer only / all (tieIn.ties, else the standard)
  const tp:TiePattern=boxy&&r.tiePattern&&(tiePatterns as readonly string[]).includes(r.tiePattern)?r.tiePattern as TiePattern:'none';
  const tiesIn=(stdIn?det.embedTie?.ties:undefined)??r.tieIn?.ties??det.embedTie?.ties??'all';
  // pieces of the pattern (inner face on the bars: cover + column tie − own tie) at the given levels
  const inner=(key:string,dCol:number,d:number,levels:number[],s:number,label:string)=>{
   const {lay,ox,oy}=boxColumnTieLayout({x0:b.x0,x1:b.x1,y0:b.y0,y1:b.y1,cx0:fc.x0+dCol-d,cx1:fc.x1+dCol-d,cy0:fc.y0+dCol-d,cy1:fc.y1+dCol-d,tieD:d,mainD:M.d,nx:M.nx,ny:M.ny},tp,det);
   innerTieBars(lay,levels,ox,oy,d,det,key,label,s,t=>notes.push(`${p.label}: ${t}`)).forEach(g=>out.push(bar(g.role,{d,tie:true,points:g.points as Vec3[],code:'99',axis:'Z',radius:g.radius,offsets:g.offsets as Vec3[],note:g.note})));};
  const sup=r.anchor?hostOf(sm,p):undefined,sc=sup?.q.rebar?.cover??m.cover,base=sup?Math.max(b.z0,sup.c.z1):b.z0;
  const zb=sup?sup.c.z0+sc+2*(sup.q.rebar?.meshB?.d||16)+M.d/2:b.z0+fc.bottom+M.d/2;
  const foot=sup?Math.min(hookDevLength(det,M.d),det.hook90*M.d+sketchRadius(M.d)):0;
  const pos:{p:P2;n:P2}[]=[];
  if(p.shape==='circle'&&p.inner===0){const R=p.diameter/2-a,n=Math.max(4,M.nx);for(let k=0;k<n;k++){const t=2*Math.PI*k/n,u:P2=[Math.cos(t),Math.sin(t)];pos.push({p:[p.cx+u[0]*R,p.cy+u[1]*R],n:u});}}
  else if(boxy){const xs=Array.from({length:M.nx},(_,k)=>b.x0+A('x0')+(b.x1-A('x1')-b.x0-A('x0'))*k/(M.nx-1)),ys=Array.from({length:M.ny},(_,k)=>b.y0+A('y0')+(b.y1-A('y1')-b.y0-A('y0'))*k/(M.ny-1));
   // corner bars sit in the tie bend (its inner radius exceeds the bar radius): moved in along the diagonal
   const k=T&&T.s>0?cornerInset(bendRadius(dt,det,true),dt,M.d):0;
   xs.forEach((x,i)=>{const e=i===0?k:i===xs.length-1?-k:0,f=e?k:0;pos.push({p:[x+e,b.y0+A('y0')+f],n:[0,-1]});pos.push({p:[x+e,b.y1-A('y1')-f],n:[0,1]});});
   ys.slice(1,-1).forEach(y=>{pos.push({p:[b.x0+A('x0'),y],n:[-1,0]});pos.push({p:[b.x1-A('x1'),y],n:[1,0]});});}
  else notes.push(`${p.label}: Preset เสาใช้กับกล่องหรือทรงกระบอกตัน · รูปทรงนี้ให้วาดเหล็กเอง`);
  if(pos.length){
   // one Mark: template at the first bar, turned about its top point to each position (outward feet into the support)
   const room=sup?Math.max(0,Math.min(foot,...pos.map(q=>(q.n[0]>0?sup.c.x1-q.p[0]:q.n[0]<0?q.p[0]-sup.c.x0:q.n[1]>0?sup.c.y1-q.p[1]:q.p[1]-sup.c.y0)-sc-M.d/2))):0;
   const tpl=(q:{p:P2;n:P2}):Vec3[]=>[...(room>2*M.d?[[q.p[0]+q.n[0]*room,q.p[1]+q.n[1]*room,zb] as Vec3]:[]),[q.p[0],q.p[1],zb],[q.p[0],q.p[1],top]];
   const first=pos[0],pts=tpl(first),pivot=pts.at(-1)!,ang=(n:P2)=>Math.atan2(n[1],n[0]);
   const turns=pos.map(q=>{let t=(ang(q.n)-ang(first.n))*180/Math.PI;if(t>180)t-=360;if(t<-180)t+=360;return Math.round(t*1000)/1000;});
   out.push(bar('main',{d:M.d,points:pts,code:pts.length>2?'11':'00',axis:'Z',offsets:pos.map(q=>[q.p[0]-pivot[0],q.p[1]-pivot[1],0] as Vec3),turns,
    note:`เหล็กยืน ${pos.length}-DB${M.d}${room>2*M.d?` · ขา 90° ${Math.round(room)} ในฐาน`:''}${r.ext?` · ยื่นพ้นหัว ${Math.round(r.ext)} (ต่อทาบ)`:''}`}));
   if(T&&T.s>0&&boxy){const rad=bendRadius(dt,det,true),z0=base+(sup?50:Math.max(50,fc.bottom+dt/2)),z1=tieTop,lk=(z:number)=>closedLink(0,1,2,b.x0+fc.x0+dt/2,b.x1-fc.x1-dt/2,b.y0+fc.y0+dt/2,b.y1-fc.y1-dt/2,z,det,rad,dt);
    if(!ref)out.push(bar('tie',{d:dt,tie:true,points:lk(z0),code:'99',axis:'Z',radius:rad,dist:{axis:2,from:z0,to:z1,spacing:T.s},note:`ปลอก RB/DB${dt} @${T.s}`}));
    // set 2 of the section pattern (from a column type): just above each hoop, below it at the top level
    if(!ref&&tp!=='none'){const L=layoutOf({rule:'spacing',spacing:T.s,count:0,from:z0,to:z1}),lv=Array.from({length:L.count},(_,k)=>L.count===1?L.from:L.from+(L.to-L.from)*k/(L.count-1)).map(z=>z+dt<=z1+1e-6?z+dt:z-dt);
     inner('tie2-',dt,dt,lv,T.s,'ปลอกชุดที่ 2');}}
   // ties in the support stay under its top mesh
   // (`r.tieIn`: own size / spacing, s 0 = none, std = the General Spec standard `det.embedTie`; absent = the standard when it is
   // on, else the column tie @300); inner face on the bars
   const ES=det.embedTie,fromStd=!!ES&&(r.tieIn?r.tieIn.std===true:ES.enabled);
   const TI=fromStd?{d:ES!.diameter||dt||r.tieIn?.d||12,s:ES!.spacing}:r.tieIn&&!r.tieIn.std?r.tieIn:r.tieIn?.std?{d:r.tieIn.d||dt,s:r.tieIn.s}:(T&&T.s>0?{d:dt,s:300}:{d:0,s:0});
   if(boxy&&sup&&TI.s>0&&TI.d>0){const di=TI.d,ri=bendRadius(di,det,true),T2=sup.q.rebar?.meshT,zs0=zb+150,zs1=Math.min(base-(fromStd?Math.max(75,ES!.top):75),sup.c.z1-sc-(T2&&T2.s>0?2*T2.d:0)-di-10);
     const lki=(z:number)=>closedLink(0,1,2,b.x0+fc.x0+dt-di/2,b.x1-fc.x1-dt+di/2,b.y0+fc.y0+dt-di/2,b.y1-fc.y1-dt+di/2,z,det,ri,di);
     if(zs1>zs0&&tp!=='none'&&tiesIn==='all'){const L=layoutOf({rule:'spacing',spacing:TI.s,count:0,from:zs0,to:zs1}),lv=Array.from({length:L.count},(_,k)=>(L.count===1?L.from:L.from+(L.to-L.from)*k/(L.count-1))+di);inner('tie-in2-',dt,di,lv,TI.s,'ปลอกในฐาน ชุดที่ 2');}
     if(zs1>zs0)out.push(bar('tie-in',{d:di,tie:true,points:lki(zs0),code:'99',axis:'Z',radius:ri,dist:{axis:2,from:zs0,to:zs1,spacing:TI.s},note:fromStd||r.tieIn?`ปลอกยึดเหล็กยืนในฐาน ${di<=9?'RB':'DB'}${di} @ ≤ ${TI.s}${fromStd?' (มาตรฐาน Spec)':''}`:'ปลอกยึดเหล็กยืนในฐาน @300'}));
     else notes.push(`${p.label}: ชิ้นด้านล่างตื้นเกินไปสำหรับปลอกในฐาน`);}
   else if(!boxy&&r.tieIn&&r.tieIn.s>0)notes.push(`${p.label}: ปลอกในฐานใช้กับเสาหน้าตัดกล่องเท่านั้น`);
   if(T&&T.s>0&&p.shape==='circle'&&!ref){const R=p.diameter/2-c-dt/2,n=24,lap=lapLength(det,dt),ring:Vec3[]=Array.from({length:n+1},(_,k)=>{const t=2*Math.PI*k/n;return [p.cx+R*Math.cos(t),p.cy+R*Math.sin(t),b.z0+50] as Vec3;});
    const t1=lap/R;ring.push([p.cx+R*Math.cos(t1),p.cy+R*Math.sin(t1),b.z0+50]);
    out.push(bar('tie',{d:dt,tie:true,points:ring,code:'99',axis:'Z',radius:0,dist:{axis:2,from:b.z0+50,to:tieTop,spacing:T.s},note:`ปลอกวงกลม DB${dt} @${T.s} ทาบ ${Math.round(lap)}`}));}
  }
 }
 if(r.purpose==='beam'){
  if(!boxy)notes.push(`${p.label}: Preset คานใช้กับกล่องเท่านั้น`);
  else{const alongX=b.x1-b.x0>=b.y1-b.y0,s=alongX?0:1,t=1-s,S=r.stirrup,ds=S?.d||0,ext=r.ext||0;
   const t0=(t?b.y0:b.x0),t1=(t?b.y1:b.x1),ct0=t?fc.y0:fc.x0,ct1=t?fc.y1:fc.x1,cs0=s?fc.y0:fc.x0,cs1=s?fc.y1:fc.x1;
   const pt=(u:number,w:number,z:number):Vec3=>s===0?[u,w,z]:[w,u,z];
   for(const [key,L,z,label] of [['top',r.top,b.z1-fc.top-ds,'บน'],['bot',r.bottom,b.z0+fc.bottom+ds,'ล่าง']] as const){if(!L||L.n<1)continue;
    const s0=(s?b.y0:b.x0)+(ext?-ext:cs0+L.d/2),s1=(s?b.y1:b.x1)+(ext?ext:-cs1-L.d/2);
    const k=S&&S.s>0?cornerInset(bendRadius(ds,det,true),ds,L.d):0,zz=key==='top'?z-L.d/2-k:z+L.d/2+k,w0=t0+ct0+ds+L.d/2+k,w1=t1-ct1-ds-L.d/2-k;
    out.push(bar(key,{d:L.d,points:[pt(s0,w0,zz),pt(s1,w0,zz)],code:'00',axis:axisOf(s),face:key==='top'?'top':'bottom',dist:{axis:t,from:w0,to:L.n>1?w1:w0,count:L.n},note:`เหล็ก${label} ${L.n}-DB${L.d}${ext?` · ยื่นพ้นปลาย ${Math.round(ext)}`:''}`}));}
   if(S&&S.s>0){const rad=bendRadius(ds,det,true),a0=(s?b.y0:b.x0)+Math.max(50,cs0+ds/2),a1=(s?b.y1:b.x1)-Math.max(50,cs1+ds/2);
    out.push(bar('stirrup',{d:ds,tie:true,points:closedLink(t,2,s,t0+ct0+ds/2,t1-ct1-ds/2,b.z0+fc.bottom+ds/2,b.z1-fc.top-ds/2,a0,det,rad,ds),code:'99',axis:'Z',radius:rad,dist:{axis:s,from:a0,to:a1,spacing:S.s},note:`ปลอก DB/RB${ds} @${S.s}`}));}}
 }
 if(r.purpose==='wall'){
  const V=r.vert,H=r.horz,ext=r.ext||0;
  if(!boxy){if(V&&V.s>0)take('vert',verticalFaceBars(pm,{z0:b.z0+c,z1:b.z1-c,diameter:V.d,grade:grade(V.d),spacing:V.s,cover:c+(H?.d||0),leg:0,mark:'P',note:'เหล็กตั้งผิวนอก'}));
   if(H&&H.s>0)take('horz',loopBars(pm,{z:b.z0+c+H.d,zTop:b.z1-c-H.d,diameter:H.d,grade:grade(H.d),spacing:H.s,cover:c,lap:lapLength(det,H.d),mark:'P',note:'เหล็กนอนผิวนอก'}));
   notes.push(`${p.label}: ผนังที่ไม่ใช่กล่อง ใช้เหล็กรอบผิวนอก (ผิวในให้วาดเพิ่ม)`);}
  else{const alongX=b.x1-b.x0>=b.y1-b.y0,s=alongX?0:1,t=1-s,pt=(u:number,w:number,z:number):Vec3=>s===0?[u,w,z]:[w,u,z];
   const L0=(s?b.y0:b.x0),L1=(s?b.y1:b.x1),T0=(t?b.y0:b.x0),T1=(t?b.y1:b.x1),dh=H?.d||0,dv=V?.d||0,cL0=s?fc.y0:fc.x0,cL1=s?fc.y1:fc.x1,cT0=t?fc.y0:fc.x0,cT1=t?fc.y1:fc.x1;
   const faces=(r.layers??2)===2?[{k:'a',h:T0+cT0+dh/2,v:T0+cT0+dh+dv/2},{k:'b',h:T1-cT1-dh/2,v:T1-cT1-dh-dv/2}]:[{k:'',h:(T0+T1)/2-dv/2-dh/2,v:(T0+T1)/2}];
   // anchor: vertical bars start on the bottom mesh of the part below with a 90° foot turned outward
   const sup=r.anchor&&V?hostOf(sm,p):undefined,sc=sup?.q.rebar?.cover??m.cover;
   for(const f of faces){
    if(V&&V.s>0){const u0=L0+cL0+dh+dv/2,u1=L1-cL1-dh-dv/2,top=ref?b.z0+(ext||lapLength(det,V.d)):b.z1+(ext||-fc.top-V.d/2);
     let base:Vec3[]=[pt(u0,f.v,b.z0+fc.bottom+V.d/2)],anchored=0;
     // feet of walls along Y lie one bar higher, on top of the feet of walls along X (perpendicular feet would cross)
     if(sup){const zb=sup.c.z0+sc+2*(sup.q.rebar?.meshB?.d||16)+V.d/2+(s?V.d+2:0),dir=f.k==='b'?1:-1,edge=t?(dir>0?sup.c.y1:sup.c.y0):(dir>0?sup.c.x1:sup.c.x0);
      anchored=Math.max(0,Math.min(det.hook90*V.d+sketchRadius(V.d),Math.abs(edge-f.v)-sc-V.d/2));
      base=anchored>2*V.d?[pt(u0,f.v+dir*anchored,zb),pt(u0,f.v,zb)]:[pt(u0,f.v,zb)];}
     const pts=[...base,pt(u0,f.v,top)];
     // positions whose embedded length (foot … wall base, or the whole bar) leaves the concrete — over a pit / opening — are cut
     const vb=bar(`vert${f.k}`,{d:V.d,points:pts,code:'00',axis:'Z',dist:{axis:s,from:u0,to:u1,spacing:V.s},note:''}),all=positionsOf(vb,s)||[u0];
     // with cover: the point and the four plan points cover + d/2 away stay in the concrete
     const cl=c+V.d/2-1,clearIn=(w:Vec3)=>inConcrete(w)&&[[cl,0],[-cl,0],[0,cl],[0,-cl]].every(([dx,dy])=>inConcrete([w[0]+dx,w[1]+dy,w[2]]));
     const zTo=ref?b.z0-1:top,embedded=(u:number)=>pts.every(q=>{const w=[...q] as Vec3;w[s]=u;return w[2]>zTo||clearIn(w);})&&Array.from({length:9},(_,i)=>pts[pts.length-2][2]+(zTo-pts[pts.length-2][2])*i/8).every(z=>{const w=[...pts[pts.length-2]] as Vec3;w[s]=u;w[2]=z;return clearIn(w);});
     const kept=all.filter(embedded);if(!kept.length){notes.push(`${p.label}: เหล็กตั้งผิว ${f.k||'กลาง'} ไม่มีตำแหน่งที่ฝังในคอนกรีตได้`);continue;}
     if(kept.length<all.length){out.push(withPositions(bar(`vert${f.k}`,{d:V.d,points:pts,code:pts.length>2?'11':'00',axis:'Z',dist:{axis:s,from:u0,to:u1,spacing:V.s},note:`เหล็กตั้ง${f.k?` ผิว ${f.k==='a'?'1':'2'}`:''} DB${V.d} @${V.s}`}),s,all,kept,`ตัด ${all.length-kept.length} ตำแหน่งที่อยู่เหนือช่องเปิด`));continue;}
     out.push(bar(`vert${f.k}`,{d:V.d,points:pts,code:pts.length>2?'11':'00',axis:'Z',dist:{axis:s,from:u0,to:u1,spacing:V.s},note:`เหล็กตั้ง${f.k?` ผิว ${f.k==='a'?'1':'2'}`:''} DB${V.d} @${V.s}${sup?` · ยึดลง${sup.q.label}${anchored>2*V.d?` ขา 90° ${Math.round(anchored)}`:''}`:''}${ext?` · ยื่นพ้นหัว ${Math.round(ext)}`:''}`}));}
    if(H&&H.s>0&&!ref){const z0=b.z0+fc.bottom+H.d/2,z1=b.z1-fc.top-H.d/2;out.push(bar(`horz${f.k}`,{d:H.d,points:[pt(L0+cL0+H.d/2,f.h,z0),pt(L1-cL1-H.d/2,f.h,z0)],code:'00',axis:axisOf(s),dist:{axis:2,from:z0,to:z1,spacing:H.s},note:`เหล็กนอน${f.k?` ผิว ${f.k==='a'?'1':'2'}`:''} DB${H.d} @${H.s}`}));}}}
 }
 const off=new Set(r.off||[]);
 return {bars:off.size?out.filter(b=>!off.has(b.id.slice(`${PRESET_PREFIX}${p.id}-`.length))):out,notes};
}
/** Takes a preset bar over as a drawn bar of its part (same Mark / geometry, id `sk-<part>-…`): its preset key is
 * switched off so the preset no longer rebuilds it. */
export function detachPreset(m:Member,id:string):{member:Member;id:string}|undefined{
 const sm=m.shapeModel,b=m.bars.find(x=>x.id===id),pid=b&&barPart(sm,b),p=sm?.parts.find(q=>q.id===pid);if(!sm||!b||!p?.rebar||!isPresetBar(b))return;
 const key=b.id.slice(`${PRESET_PREFIX}${p.id}-`.length),nid=partSketchId(p.id);
 return {id:nid,member:{...m,bars:m.bars.map(x=>x.id===id?{...x,id:nid,note:`${x.note} · แยกจาก Preset`.slice(0,500)}:x),shapeModel:{...sm,parts:sm.parts.map(q=>q.id===p.id?{...q,rebar:{...q.rebar!,off:[...new Set([...(q.rebar!.off||[]),key])]}}:q)}}};
}

/** Rebuilds every part's preset bars (marks kept per bar id), drops presets of removed parts, then reference regions. */
export function applyPartPresets(m:Member,spec:Spec):{member:Member;notes:string[]}{
 const sm=m.shapeModel;if(!sm)return {member:m,notes:[]};
 const old=new Map(m.bars.filter(isPresetBar).map(b=>[b.id,b])),notes:string[]=[];
 const kept=m.bars.filter(b=>!isPresetBar(b)),built:Bar[]=[];
 for(const p of sm.parts){if(!p.rebar)continue;let res;try{res=partPresetBars(m,p,spec);}catch(e){notes.push(`${p.label}: ${e instanceof Error?e.message:String(e)}`);continue;}notes.push(...res.notes);built.push(...res.bars);}
 // bars that existed keep their Mark; new ones take the next free Mark after all kept ones
 const made:Bar[]=built.map(b=>({...b,mark:old.get(b.id)?.mark||'',placementConfirmed:false}));
 for(const b of made)if(!b.mark)b.mark=markFor({...m,bars:[...kept,...made.filter(x=>x.mark)]},barPart(sm,b));
 const work:Member=coordinateBars(tagMarks({...m,bars:[...kept,...made].slice(0,300)}),spec);
 if(made.length+m.bars.filter(b=>!isPresetBar(b)).length>300)notes.push('จำนวนชุดเหล็กเกิน 300 ชุด · ตัดชุดท้าย ๆ ออก');
 return {member:withOutsideRegions(work,spec),notes};
}

const CLEAR=10;
/** Plan distance from point p to segment a–b (z ignored). */
const planDist=(p:P2,a:Vec3,b:Vec3)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
type VSeg={x:number;y:number;z0:number;z1:number;r:number;id:string};type HSeg={a:Vec3;b:Vec3;r:number;id:string};
/** Bar centreline pieces of the whole member: vertical runs (starters, dowels) and horizontal runs (meshes). */
function barRuns(m:Member,spec:Spec){
 const v:VSeg[]=[],h:HSeg[]=[];let rows;try{rows=schedule({...m,placementContext:undefined},spec);}catch{return {v,h,ok:false};}
 for(const row of rows)for(const path of row.paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
  if(Math.abs(dx)<1&&Math.abs(dy)<1&&Math.abs(dz)>50)v.push({x:a[0],y:a[1],z0:Math.min(a[2],b[2]),z1:Math.max(a[2],b[2]),r:row.diameter/2,id:row.id});
  else if(Math.abs(dz)<1&&Math.hypot(dx,dy)>100)h.push({a,b,r:row.diameter/2,id:row.id});}
 return {v,h,ok:true};
}
/** Nearest position to `p` inside [lo, hi] clear of every blocked interval and at least `gap` from the fixed positions. */
function freeSpot(p:number,lo:number,hi:number,blocked:[number,number][],fixed:number[],gap:number){
 const bad=(q:number)=>q<lo-1e-6||q>hi+1e-6||blocked.some(([a,b])=>q>a+1e-6&&q<b-1e-6)||fixed.some(f=>Math.abs(f-q)<gap-1e-6);
 if(!bad(p))return p;const cands=[...blocked.flatMap(([a,b])=>[a,b]),...fixed.flatMap(f=>[f-gap,f+gap])].filter(q=>!bad(q)).sort((x,y)=>Math.abs(x-p)-Math.abs(y-p));
 return cands[0];
}
/** Positions → bar with explicit offsets along axis k (template at the first position). */
function withPositions(b:Bar,k:number,from:number[],to:number[],note:string):Bar{
 const d=to[0]-from[0],pts=b.points.map(p=>{const q=[...p] as Vec3;q[k]+=d;return r3(q);});
 return {...b,points:pts,offsets:to.map(t=>{const o:Vec3=[0,0,0];o[k]=t-to[0];return r3(o);}),offsetTurns:undefined,distributionAxis:undefined,distributionStart:0,distributionEnd:0,count:to.length,note:`${b.note} · ${note}`.slice(0,500)};
}
/** Layout positions of a distributed / offset bar along axis k (template coordinate + offsets, or the even layout). */
function positionsOf(b:Bar,k:number):number[]|undefined{
 if(b.offsets?.length&&!b.offsetTurns?.some(t=>t))return b.offsets.map(o=>b.points[0][k]+o[k]);
 if(b.distributionAxis&&'XYZ'.indexOf(b.distributionAxis)===k){const n=Math.max(1,b.count),s=b.distributionStart,e=b.distributionEnd;return Array.from({length:n},(_,i)=>n===1?s:s+(e-s)*i/(n-1));}
}
/** Coordination of preset bars between parts: mesh bars step aside from vertical bars running through their layer
 * (column starters, wall dowels, drawn bars), then ties and horizontal rings (pit walls) step off the mesh levels they would hit. */
export function coordinateBars(m:Member,spec:Spec):Member{
 let runs=barRuns(m,spec);if(!runs.ok||!runs.v.length)return m;
 const sm=m.shapeModel,owner=(id:string)=>{const b=m.bars.find(x=>x.id===id);return b&&barPart(sm,b);},wallKey=/-vert[ab]?$/,ringKey=/-g?loop\d*$/;
 let bars=m.bars;
 // 1 · walls meeting at a junction: dowels of a later wall where an earlier wall already has one are dropped
 const placed:VSeg[]=[],feet:HSeg[]=[],footprints:{id:string;b:Box3}[]=[];
 bars=bars.map(b=>{
  if(!isPresetBar(b)||!wallKey.test(b.id))return b;const own=runs.v.filter(v=>v.id===b.id);
  const k=b.distributionAxis?'XYZ'.indexOf(b.distributionAxis):b.offsets?.length?(Math.abs(b.offsets.at(-1)![0])>=Math.abs(b.offsets.at(-1)![1])?0:1):-1,pos=k>=0?positionsOf(b,k):undefined;
  if(!pos||k>1){placed.push(...own);return b;}
  // the junction belongs to the earlier wall: positions inside its footprint (or next to its dowels) are dropped
  const r=b.diameter/2,top=b.points.at(-1)!,me=owner(b.id),foot=b.points.length>2?[b.points[0],b.points[1]]:undefined;
  const keep=pos.filter(u=>{const xy:P2=[top[0],top[1]];xy[k]=u;
   // inside an earlier wall's footprint, next to its dowels, on its feet, or this foot through its dowels
   if(footprints.some(f=>f.id!==me&&xy[0]>f.b.x0-r-CLEAR&&xy[0]<f.b.x1+r+CLEAR&&xy[1]>f.b.y0-r-CLEAR&&xy[1]<f.b.y1+r+CLEAR))return false;
   if(placed.some(v=>owner(v.id)!==me&&Math.hypot(v.x-xy[0],v.y-xy[1])<r+v.r+CLEAR))return false;
   if(feet.some(h=>owner(h.id)!==me&&planDist(xy,h.a,h.b)<r+h.r+CLEAR))return false;
   if(foot){const a=[...foot[0]] as Vec3,c=[...foot[1]] as Vec3;a[k]=u;c[k]=u;if(placed.some(v=>owner(v.id)!==me&&v.z0<=a[2]+r+v.r&&planDist([v.x,v.y],a,c)<r+v.r+CLEAR))return false;}
   return true;});
  placed.push(...own.filter(v=>keep.some(u=>Math.abs([v.x,v.y][k]-u)<1)));
  feet.push(...runs.h.filter(h=>h.id===b.id&&keep.some(u=>Math.abs(h.a[k]-u)<1)));
  const part=sm?.parts.find(q=>q.id===me);if(part&&!footprints.some(f=>f.id===me))footprints.push({id:me!,b:partBox(part)});
  return keep.length===pos.length||!keep.length?b:withPositions(b,k,pos,keep,`ตัด ${pos.length-keep.length} ตำแหน่งที่รอยต่อผนัง`);});
 // 2 · a dowel line on a loop ring running along it (wall face flush with a looped face): the dowels go inside the ring
 bars=bars.map(b=>{
  if(!isPresetBar(b)||!wallKey.test(b.id))return b;const own=runs.v.filter(v=>v.id===b.id);if(!own.length)return b;
  const p=sm?.parts.find(q=>q.id===barPart(sm,b));if(!p)return b;const pb=partBox(p),alongX=pb.x1-pb.x0>=pb.y1-pb.y0,t=alongX?1:0,mid=t?(pb.y0+pb.y1)/2:(pb.x0+pb.x1)/2,line=[own[0].x,own[0].y][t],dir=Math.sign(mid-line)||1,r=b.diameter/2;
  let need=0;for(const h of runs.h){if(!ringKey.test(h.id)||owner(h.id)===owner(b.id)||Math.abs(h.a[t]-h.b[t])>1)continue;const lo=Math.min(h.a[1-t],h.b[1-t]),hi=Math.max(h.a[1-t],h.b[1-t]);
   if(!own.some(v=>h.a[2]>=v.z0-r-h.r&&h.a[2]<=v.z1+r+h.r&&[v.x,v.y][1-t]>=lo-r&&[v.x,v.y][1-t]<=hi+r))continue;
   const gap=Math.abs(h.a[t]-line),req=r+h.r+CLEAR;if(gap<req)need=Math.max(need,(h.a[t]-line)*dir>=0?gap+req:req-gap);}
  if(!need)return b;const pts=b.points.map(q=>{const w=[...q] as Vec3;w[t]+=dir*need;return r3(w);});
  return {...b,points:pts,...(b.distributionAxis==='XYZ'[t]?{distributionStart:b.distributionStart+dir*need,distributionEnd:b.distributionEnd+dir*need}:{}),note:`${b.note} · เลื่อนเข้าใน ${Math.round(need)} mm หลบลูป`.slice(0,500)};});
 runs=barRuns({...m,bars},spec);
 const meshKey=/-(bx|by|tx|ty)\d*$/,tieKey=/-(tie|tie-in|horz[ab]?)$/;
 bars=bars.map(b=>{
  if(!isPresetBar(b)||!meshKey.test(b.id))return b;
  // the long horizontal run of the template: along axis a at level z; bars are laid out across it (axis k)
  const seg=b.points.slice(1).map((p,i)=>({a:b.points[i],b:p})).filter(s=>Math.abs(s.a[2]-s.b[2])<1).sort((x,y)=>Math.hypot(y.b[0]-y.a[0],y.b[1]-y.a[1])-Math.hypot(x.b[0]-x.a[0],x.b[1]-x.a[1]))[0];if(!seg)return b;
  const a=Math.abs(seg.b[0]-seg.a[0])>=Math.abs(seg.b[1]-seg.a[1])?0:1,k=1-a,z=seg.a[2],r=b.diameter/2,pos=positionsOf(b,k);if(!pos||pos.length<2)return b;
  const u0=Math.min(seg.a[a],seg.b[a]),u1=Math.max(seg.a[a],seg.b[a]);
  const vs=runs.v.filter(v=>z>=v.z0-r-v.r&&z<=v.z1+r+v.r&&[v.x,v.y][a]>=u0-v.r-r&&[v.x,v.y][a]<=u1+v.r+r);if(!vs.length)return b;
  const blocked=vs.map(v=>{const c=[v.x,v.y][k],q=r+v.r+CLEAR;return [c-q,c+q] as [number,number];}),lo=Math.min(...pos),hi=Math.max(...pos),gap=2*r+CLEAR;
  const to:number[]=[];let moved=0;for(const p of pos){const q=freeSpot(p,lo,hi,blocked,to,gap)??p;if(Math.abs(q-p)>1e-6)moved++;to.push(q);}
  return moved?withPositions(b,k,pos,to,`ขยับ ${moved} เส้นหลบเหล็กแนวตั้ง`):b;});
 runs=barRuns({...m,bars},spec);
 bars=bars.map(b=>{
  if(!isPresetBar(b)||!tieKey.test(b.id))return b;const zs=positionsOf(b,2);if(!zs||!zs.length)return b;
  const xs=b.points.map(p=>p[0]),ys=b.points.map(p=>p[1]),bx=[Math.min(...xs),Math.max(...xs)],by=[Math.min(...ys),Math.max(...ys)],r=b.diameter/2;
  const hs=runs.h.filter(h=>Math.max(Math.min(h.a[0],h.b[0]),bx[0])<=Math.min(Math.max(h.a[0],h.b[0]),bx[1])+h.r&&Math.max(Math.min(h.a[1],h.b[1]),by[0])<=Math.min(Math.max(h.a[1],h.b[1]),by[1])+h.r&&!zs.some(z=>Math.abs(h.a[2]-z)<1e-6));
  if(!hs.length)return b;const blocked=hs.map(h=>{const q=r+h.r+CLEAR;return [h.a[2]-q,h.a[2]+q] as [number,number];});
  const lo=Math.min(...zs)-b.diameter*0,hi=Math.max(...zs),to:number[]=[];let moved=0;
  for(const z of zs){const q=freeSpot(z,lo-200,hi,blocked,to,2*r+CLEAR)??z;if(Math.abs(q-z)>1e-6)moved++;to.push(q);}
  return moved?withPositions(b,2,zs,to.sort((x,y)=>x-y),`ขยับ ${moved} ชั้นหลบตะแกรง`):b;});
 return {...m,bars};
}
/** Moves bars drawn on a part (`sk-<part>-…`) by the part's move between two shape models (both normalised); bars of a
 * bar group move when every part of the group moved by the same amount. */
export function moveOwnedSketchBars(m:Member,before:ShapeModel|undefined):Member{
 const sm=m.shapeModel;if(!sm||!before)return m;
 const shift=new Map<string,Vec3>();for(const p of sm.parts){const q=before.parts.find(x=>x.id===p.id);if(!q)continue;const a=partBox(q),b=partBox(p),d:Vec3=[b.x0-a.x0,b.y0-a.y0,b.z0-a.z0];if(d.some(v=>Math.abs(v)>1e-6))shift.set(p.id,d);}
 if(!shift.size)return m;
 const same=(a:Vec3|undefined,b:Vec3|undefined)=>[0,1,2].every(k=>Math.abs((a?.[k]||0)-(b?.[k]||0))<1e-6);
 for(const g of sm.groups||[]){const first=shift.get(g.parts[0]);if(first&&g.parts.every(id=>same(shift.get(id),first)))shift.set(g.id,first);}
 return {...m,bars:m.bars.map(b=>{if(isPresetBar(b))return b;const id=barOwner(sm,b),d=id&&shift.get(id);if(!d)return b;const k=b.distributionAxis?'XYZ'.indexOf(b.distributionAxis):-1;
  return {...b,points:b.points.map(p=>r3([p[0]+d[0],p[1]+d[1],p[2]+d[2]])),...(k>=0?{distributionStart:Math.max(0,b.distributionStart+d[k]),distributionEnd:Math.max(0,b.distributionEnd+d[k])}:{}),placementConfirmed:false};})};
}

export const OUTSIDE_PREFIX='genext-',REFERENCE_PREFIX='genref-';
/** Bar portions past the concrete (laps above a column, starters, dowels): one reference region (cover 0, no
 * concrete) per bar set around them, so placement checks accept them; other regions are kept. */
export function withOutsideRegions(m:Member,spec:Spec):Member{
 const sm=m.shapeModel;if(!sm)return m;
 const ctx=editablePlacementContext(m),keep=ctx.regions.filter(r=>!r.id.startsWith(OUTSIDE_PREFIX)&&!r.id.startsWith(REFERENCE_PREFIX));
 // reference parts (column / wall above, cast later): their box is a placement region of its own
 const refs=sm.parts.filter(p=>p.role==='reference').slice(0,Math.max(0,REGION_LIMIT-keep.length)).map(p=>{const b=partBox(p);return {id:`${REFERENCE_PREFIX}${p.id}`,label:`${p.label} (อ้างอิง)`.slice(0,80),origin:[b.x0,b.y0,b.z0] as Vec3,size:[Math.max(1,b.x1-b.x0),Math.max(1,b.y1-b.y0),Math.max(1,b.z1-b.z0)] as Vec3,reference:'ชิ้นส่วนอ้างอิง (เทภายหลัง) · ไม่คิดคอนกรีต / แบบหล่อในสมาชิกนี้',cover:0,openings:[]};});
 keep.push(...refs);
 const boxes=outsideBoxes(m,spec),room=Math.max(0,REGION_LIMIT-keep.length);
 // more sets than free regions: the rest merge into the last box
 const list=boxes.slice(0,Math.max(0,room-1));if(boxes.length>list.length&&room>0){const rest=boxes.slice(list.length);list.push({mark:rest.map(b=>b.mark).join(', ').slice(0,60),min:[0,1,2].map(k=>Math.min(...rest.map(b=>b.min[k]))) as Vec3,max:[0,1,2].map(k=>Math.max(...rest.map(b=>b.max[k]))) as Vec3});}
 const regions=[...keep,...list.map((b,k)=>({id:`${OUTSIDE_PREFIX}${k+1}`,label:`เหล็ก ${b.mark} ยื่นพ้นคอนกรีต`.slice(0,80),origin:b.min,size:[0,1,2].map(i=>Math.max(1,b.max[i]-b.min[i])) as Vec3,reference:'ปลายเหล็กยื่นพ้นชิ้นส่วน (ต่อทาบ / เหล็กรอ / เดือย) · ไม่คิดคอนกรีต',cover:0,openings:[]}))];
 const same=JSON.stringify(regions)===JSON.stringify(ctx.regions);if(same)return m;
 return {...m,placementContext:regions.length?{version:2,regions}:undefined};
}
/** Per bar set: bounding box of the sampled path points outside the concrete (plus the boundary samples), padded by bar radius + cover. */
export function outsideBoxes(m:Member,spec:Spec):{mark:string;min:Vec3;max:Vec3}[]{
 const sm=m.shapeModel;if(!sm)return [];const g=shapeGeometry(sm),refs=sm.parts.filter(p=>p.role==='reference').map(partBox);
 // inside the concrete or inside a reference part (that region exists already)
 const inside=(p:Vec3)=>g.slabs.some(s=>p[2]>=s.z0-.5&&p[2]<=s.z1+.5&&inMulti([p[0],p[1]],s.region,.5))||refs.some(b=>p[0]>=b.x0&&p[0]<=b.x1&&p[1]>=b.y0&&p[1]<=b.y1&&p[2]>=b.z0&&p[2]<=b.z1);
 let rows;try{rows=schedule({...m,placementContext:undefined},spec);}catch{return [];}
 const out:{mark:string;min:Vec3;max:Vec3}[]=[];
 for(const row of rows){
  const tpl=row.paths[0];if(!tpl||tpl.every(inside))continue;
  const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity],add=(p:Vec3)=>{for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}};
  for(const path of row.paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(inside(a)&&inside(b))continue;
   const len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),n=Math.min(2000,Math.max(1,Math.ceil(len/5)));let prevIn=true,prev:Vec3=a;
   for(let k=0;k<=n;k++){const t=k/n,q:Vec3=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],ins=inside(q);
    if(!ins){add(q);if(prevIn&&k>0)add(prev);}else if(!prevIn)add(q);prevIn=ins;prev=q;}}
  // padded by the member cover too, so the concrete face the bars cross stays clear around them
  if(!Number.isFinite(min[0]))continue;const pad=row.diameter/2+m.cover+1;
  out.push({mark:row.mark,min:min.map(v=>Number((v-pad).toFixed(1))) as Vec3,max:max.map(v=>Number((v+pad).toFixed(1))) as Vec3});
 }
 return out;
}
/** Length of each bar set's template beyond the concrete (mm) for the workspace list. */
export function outsideLengths(m:Member):Map<string,number>{
 const sm=m.shapeModel,res=new Map<string,number>();if(!sm)return res;const g=shapeGeometry(sm);
 const inside=(p:Vec3)=>g.slabs.some(s=>p[2]>=s.z0-.5&&p[2]<=s.z1+.5&&inMulti([p[0],p[1]],s.region,.5));
 for(const b of m.bars){let L=0;for(let i=1;i<b.points.length;i++){const a=b.points[i-1],c=b.points[i],len=Math.hypot(c[0]-a[0],c[1]-a[1],c[2]-a[2]),n=Math.max(1,Math.ceil(len/10));
  for(let k=0;k<n;k++){const t=(k+.5)/n;if(!inside([a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t,a[2]+(c[2]-a[2])*t]))L+=len/n;}}
  if(L>1)res.set(b.id,Math.round(L));}
 return res;
}

/** The part's joined group has loops (built by its first part). */
const joinedLooped=(m:Member,p:ShapePart)=>{const sm=m.shapeModel;if(!sm||!p.rebar?.loopsJoined)return false;const lead=joinedGroup(sm,p)[0];return m.bars.some(b=>b.id.startsWith(`${PRESET_PREFIX}${lead.id}-gloop`));};
export type CoverageItem={label:string;ok:boolean|'warn';hint?:string};
/** What a part of this purpose needs and whether its bars have it (preset sets by key, drawn bars count as extra). */
export function partCoverage(m:Member,p:ShapePart,spec:Spec):CoverageItem[]{
 const r=p.rebar;if(!r||r.purpose==='other')return [];
 const ids=new Set(m.bars.filter(b=>barPart(m.shapeModel,b)===p.id).map(b=>b.id)),has=(k:string)=>[...ids].some(id=>id.startsWith(`${PRESET_PREFIX}${p.id}-${k}`)),drawn=[...ids].some(id=>id.startsWith('sk-'));
 const det=detailingFor(spec),onLower=!!m.shapeModel&&restsOn(m.shapeModel,p),closed=!!m.shapeModel&&coveredAbove(m.shapeModel,p);
 if(p.role==='void')return r.purpose==='wall'?[{label:'เหล็กตั้งรอบผิวบ่อ',ok:has('vert')},{label:'เหล็กนอนรอบผิวบ่อ',ok:has('horz')}]:[];
 // reference part: only its starters / dowels are this element's
 if(p.role==='reference'){const sup=m.shapeModel&&hostOf(m.shapeModel,p),key=r.purpose==='column'?'main':'vert',d=r.main?.d||r.vert?.d||16,lap=lapLength(det,d),len=r.ext||lap;
  return r.purpose!=='column'&&r.purpose!=='wall'?[{label:'ชิ้นอ้างอิงใช้ได้เฉพาะเสา / ผนัง',ok:false}]:[{label:r.purpose==='column'?'เหล็กเริ่มเสา (starter)':'เหล็กเดือยผนัง',ok:has(key)},
   {label:sup?`ฝังใน${sup.q.label}`:'มีชิ้นคอนกรีตรองรับด้านล่าง',ok:!!sup&&has(key),hint:sup?undefined:'ชิ้นอ้างอิงต้องวางบนผิวบนของชิ้นคอนกรีต'},
   {label:`ยื่นเข้าชิ้นอ้างอิง ≥ Lap ${Math.round(lap)}`,ok:len>=lap-1?true:'warn',hint:len>=lap-1?undefined:`${Math.round(len)} < ${Math.round(lap)}`}];}
 switch(r.purpose){
  case 'column':{const lap=r.main?lapLength(det,r.main.d):0,ext=r.ext||0;return [{label:'เหล็กยืน (main)',ok:has('main')},{label:'ปลอก',ok:has('tie')},{label:'ยึดลงชิ้นด้านล่าง (ขา 90°)',ok:!r.anchor?'warn':has('main')&&!!m.bars.find(b=>b.id===`${PRESET_PREFIX}${p.id}-main`&&b.points.length>2),hint:r.anchor?undefined:'ไม่ได้เลือกยึดลงฐาน'},
   {label:`ต่อทาบด้านบน ≥ Lap ${Math.round(lap)}`,ok:ext>=lap-1?true:ext>0?'warn':'warn',hint:ext>=lap-1?undefined:ext>0?`ยื่น ${Math.round(ext)} < ${Math.round(lap)}`:'ไม่มีเหล็กยื่นพ้นหัว (ถ้าเป็นชั้นบนสุดถือว่าถูก)'}];}
  case 'beam':return [{label:'เหล็กบน',ok:has('top')},{label:'เหล็กล่าง',ok:has('bot')},{label:'ปลอก',ok:has('stirrup')}];
  case 'slab':return [onLower?{label:'ตะแกรงล่าง (หล่อบนคอนกรีตชิ้นล่าง)',ok:true,hint:has('bx')?undefined:'ไม่ต้องใช้ · รอยต่อใช้ตะแกรงบนของชิ้นล่าง'}:{label:'ตะแกรงล่าง 2 ทาง',ok:has('bx')&&has('by')},{label:'ตะแกรงบน',ok:has('tx')&&has('ty')?true:'warn',hint:has('tx')?undefined:'ไม่มี (พื้นช่วงสั้น / บางอาจไม่ต้องใช้)'}];
  case 'wall':{const sup=m.shapeModel&&hostOf(m.shapeModel,p);return [{label:'เหล็กตั้ง',ok:has('vert')},{label:'เหล็กนอน',ok:has('horz')},{label:'2 ชั้น (ผนังหนา ≥ 200)',ok:(r.layers??2)===2||Math.min(partBox(p).x1-partBox(p).x0,partBox(p).y1-partBox(p).y0)<200?true:'warn'},
   ...(sup?[{label:`ยึดลง${sup.q.label}`,ok:r.anchor&&has('vert')?true:drawn?'warn' as const:false,hint:r.anchor?undefined:'เหล็กตั้งไม่ได้ฝังลงชิ้นด้านล่าง'}]:[])];}
  case 'footing':return [...(onLower?[{label:'ตะแกรงล่าง (หล่อบนคอนกรีตชิ้นล่าง)',ok:true,hint:has('bx')?undefined:'ไม่ต้องใช้ · รอยต่อใช้ตะแกรงบนของชิ้นล่าง'}]:[{label:'ตะแกรงล่าง X',ok:has('bx')},{label:'ตะแกรงล่าง Y',ok:has('by')}]),
   closed?{label:'ตะแกรงบน (มีชิ้นหล่อทับด้านบน)',ok:true,hint:has('tx')?undefined:'ไม่ต้องใช้'}:{label:'ตะแกรงบน',ok:has('tx')?true:'warn',hint:has('tx')?undefined:'ไม่มีตะแกรงบน'},
   {label:r.loopsJoined?'เหล็กรอบผิวข้าง (ลูปรอบแปลนรวม)':'เหล็กรอบผิวข้าง (หนา > 600)',ok:p.height<=600||has('loop')||drawn||joinedLooped(m,p)?true:'warn',hint:p.height>600&&!has('loop')&&!joinedLooped(m,p)&&!drawn?(onLower?'ฐานหนา · ชิ้นที่ติดกันหลายชิ้น: ใช้เครื่องมือ “ลูปรอบผิว” รอบแปลนรวมแทนลูปทีละชิ้น':'ฐานหนา · ควรมีลูปรอบผิว'):undefined}];
 }
 return [];
}
