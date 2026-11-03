import {blankBar,type Bar,type Member,type Spec,type Vec3} from './model';
import {DEFAULT_DETAILING,bendRadius,closedLink,gradeFor,lapLength,hookDevLength,type Detailing} from './elementInput';
import {detailingFromSpec} from './specDetailing';
import {inMulti,partPolygon,shapeGeometry} from './shapeGeometry';
import {type PartPurpose,type PartRebar,type ShapeModel,type ShapePart} from './shapeModelSchema';
import {layoutOf,loopBars,meshBars,nextMark,sketchRadius,verticalFaceBars,type P2} from './rebarSketch';
import {editablePlacementContext,REGION_LIMIT} from './placementContext';
import {schedule} from './engine';

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
export const partSketchId=(partId:string)=>`sk-${partId}-${crypto.randomUUID().replace(/-/g,'').slice(0,10)}`;

/** Purpose guessed from the part's proportions (thin & wide = slab / wall, tall & small = column, long = beam). */
export function guessPurpose(p:ShapePart):PartPurpose{
 if(p.role==='void')return 'other';
 const b=partBox(p),w=b.x1-b.x0,d=b.y1-b.y0,h=p.height,small=Math.min(w,d),big=Math.max(w,d);
 if(p.shape==='circle'&&p.inner>0||p.shape==='shaft')return 'wall';
 if(h<=Math.min(400,small/3))return 'slab';
 if(small<=400&&big>=3*small&&h>=big/3)return 'wall';
 if(h>=2*small&&big<=1.5*small)return 'column';
 if(big>=3*small&&h<big/3)return 'beam';
 return small>=1000&&h<=small?'footing':'other';
}
/** Preset values for a purpose (sized from the part): the user edits them in the rebar workspace. */
export function defaultPartRebar(purpose:PartPurpose,p:ShapePart,det:Detailing):PartRebar{
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
const r3=(p:Vec3)=>p.map(v=>Number(v.toFixed(3))) as Vec3;
/** Inset (each axis) of a corner bar Ø d so it bears on the bend of a link Ø dt with centreline radius rad. */
const cornerInset=(rad:number,dt:number,d:number)=>Math.max(0,rad-dt/2-d/2)*(1-Math.SQRT1_2);
const axisOf=(k:number)=>(['X','Y','Z'] as const)[k];

/** Preset bars of one part (ids `pp-<part>-<key>`, marks filled in by `applyPartPresets`). */
export function partPresetBars(m:Member,p:ShapePart,spec:Spec):{bars:Bar[];notes:string[]}{
 const r=p.rebar,sm=m.shapeModel;if(!r||!sm||r.purpose==='other'||p.role==='void')return {bars:[],notes:[]};
 // part cover can only add to the member cover (placement checks use the member cover)
 const det=detailingFor(spec),c=Math.max(m.cover,r.cover??m.cover),b=partBox(p),notes:string[]=[],out:Bar[]=[];
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
 const pm=partMember(m,p),boxy=p.shape==='box';
 if(r.purpose==='slab'||r.purpose==='footing'){
  const B=r.meshB,T=r.meshT;const zt=b.z1-c;
  const legUp=r.purpose==='footing'&&r.legs&&B?Math.max(0,zt-(T&&T.s>0?2*T.d:0)-(b.z0+c+B.d/2)-B.d):0;
  if(B&&B.s>0){take('bx',meshBars(pm,{z:b.z0+c+B.d/2,diameter:B.d,grade:grade(B.d),spacing:B.s,cover:c,dirs:['X'],leg:legUp,note:'ตะแกรงล่าง'}));
   take('by',meshBars(pm,{z:b.z0+c+1.5*B.d,diameter:B.d,grade:grade(B.d),spacing:B.s,cover:c,dirs:['Y'],leg:legUp?legUp-B.d:0,note:'ตะแกรงล่าง ชั้น 2'}));}
  if(T&&T.s>0){take('tx',meshBars(pm,{z:zt-T.d/2,diameter:T.d,grade:grade(T.d),spacing:T.s,cover:c,dirs:['X'],leg:0,note:'ตะแกรงบน'}));
   take('ty',meshBars(pm,{z:zt-1.5*T.d,diameter:T.d,grade:grade(T.d),spacing:T.s,cover:c,dirs:['Y'],leg:0,note:'ตะแกรงบน ชั้น 2'}));}
  const L=r.loops;if(r.purpose==='footing'&&L&&L.s>0){const z0=b.z0+c+2*(B?.d||16)+L.s/2,z1=zt-2*(T&&T.s>0?T.d:0)-L.d;
   if(z1>z0)take('loop',loopBars(pm,{z:z0,zTop:z1,diameter:L.d,grade:grade(L.d),spacing:L.s,cover:c,lap:lapLength(det,L.d),mark:'P',note:'ลูปรอบผิวข้าง'}));}
  if(!out.length)notes.push(`${p.label}: ไม่มีชั้นเหล็กที่ใช้ (ระยะ @ = 0)`);
 }
 if(r.purpose==='column'&&r.main){
  const M=r.main,T=r.tie,dt=T?.d||0,a=c+dt+M.d/2,top=r.ext?b.z1+r.ext:b.z1-c-M.d/2,tieTop=b.z1-Math.max(50,c+dt/2);
  const sup=r.anchor?supportOf(sm,p):undefined,sc=sup?.q.rebar?.cover??m.cover;
  const zb=sup?sup.c.z0+sc+2*(sup.q.rebar?.meshB?.d||16)+M.d/2:b.z0+c+M.d/2;
  const foot=sup?Math.min(hookDevLength(det,M.d),det.hook90*M.d+sketchRadius(M.d)):0;
  const pos:{p:P2;n:P2}[]=[];
  if(p.shape==='circle'&&p.inner===0){const R=p.diameter/2-a,n=Math.max(4,M.nx);for(let k=0;k<n;k++){const t=2*Math.PI*k/n,u:P2=[Math.cos(t),Math.sin(t)];pos.push({p:[p.cx+u[0]*R,p.cy+u[1]*R],n:u});}}
  else if(boxy){const xs=Array.from({length:M.nx},(_,k)=>b.x0+a+(b.x1-b.x0-2*a)*k/(M.nx-1)),ys=Array.from({length:M.ny},(_,k)=>b.y0+a+(b.y1-b.y0-2*a)*k/(M.ny-1));
   // corner bars sit in the tie bend (its inner radius exceeds the bar radius): moved in along the diagonal
   const k=T&&T.s>0?cornerInset(bendRadius(dt,det,true),dt,M.d):0;
   xs.forEach((x,i)=>{const e=i===0?k:i===xs.length-1?-k:0,f=e?k:0;pos.push({p:[x+e,b.y0+a+f],n:[0,-1]});pos.push({p:[x+e,b.y1-a-f],n:[0,1]});});
   ys.slice(1,-1).forEach(y=>{pos.push({p:[b.x0+a,y],n:[-1,0]});pos.push({p:[b.x1-a,y],n:[1,0]});});}
  else notes.push(`${p.label}: Preset เสาใช้กับกล่องหรือทรงกระบอกตัน · รูปทรงนี้ให้วาดเหล็กเอง`);
  if(pos.length){
   // one Mark: template at the first bar, turned about its top point to each position (outward feet into the support)
   const room=sup?Math.max(0,Math.min(foot,...pos.map(q=>(q.n[0]>0?sup.c.x1-q.p[0]:q.n[0]<0?q.p[0]-sup.c.x0:q.n[1]>0?sup.c.y1-q.p[1]:q.p[1]-sup.c.y0)-sc-M.d/2))):0;
   const tpl=(q:{p:P2;n:P2}):Vec3[]=>[...(room>2*M.d?[[q.p[0]+q.n[0]*room,q.p[1]+q.n[1]*room,zb] as Vec3]:[]),[q.p[0],q.p[1],zb],[q.p[0],q.p[1],top]];
   const first=pos[0],pts=tpl(first),pivot=pts.at(-1)!,ang=(n:P2)=>Math.atan2(n[1],n[0]);
   const turns=pos.map(q=>{let t=(ang(q.n)-ang(first.n))*180/Math.PI;if(t>180)t-=360;if(t<-180)t+=360;return Math.round(t*1000)/1000;});
   out.push(bar('main',{d:M.d,points:pts,code:pts.length>2?'11':'00',axis:'Z',offsets:pos.map(q=>[q.p[0]-pivot[0],q.p[1]-pivot[1],0] as Vec3),turns,
    note:`เหล็กยืน ${pos.length}-DB${M.d}${room>2*M.d?` · ขา 90° ${Math.round(room)} ในฐาน`:''}${r.ext?` · ยื่นพ้นหัว ${Math.round(r.ext)} (ต่อทาบ)`:''}`}));
   if(T&&T.s>0&&boxy){const rad=bendRadius(dt,det,true),z0=b.z0+(sup?50:Math.max(50,c+dt/2)),z1=tieTop;
    out.push(bar('tie',{d:dt,tie:true,points:closedLink(0,1,2,b.x0+c+dt/2,b.x1-c-dt/2,b.y0+c+dt/2,b.y1-c-dt/2,z0,det,rad,dt),code:'99',axis:'Z',radius:rad,dist:{axis:2,from:z0,to:z1,spacing:T.s},note:`ปลอก RB/DB${dt} @${T.s}`}));
    // ties in the support stay under its top mesh
    if(sup){const T2=sup.q.rebar?.meshT,zs0=zb+150,zs1=Math.min(b.z0-75,sup.c.z1-sc-(T2&&T2.s>0?2*T2.d:0)-dt-10);if(zs1>zs0)out.push(bar('tie-in',{d:dt,tie:true,points:closedLink(0,1,2,b.x0+c+dt/2,b.x1-c-dt/2,b.y0+c+dt/2,b.y1-c-dt/2,zs0,det,rad,dt),code:'99',axis:'Z',radius:rad,dist:{axis:2,from:zs0,to:zs1,spacing:300},note:'ปลอกยึดเหล็กยืนในฐาน @300'}));}}
   if(T&&T.s>0&&p.shape==='circle'){const R=p.diameter/2-c-dt/2,n=24,lap=lapLength(det,dt),ring:Vec3[]=Array.from({length:n+1},(_,k)=>{const t=2*Math.PI*k/n;return [p.cx+R*Math.cos(t),p.cy+R*Math.sin(t),b.z0+50] as Vec3;});
    const t1=lap/R;ring.push([p.cx+R*Math.cos(t1),p.cy+R*Math.sin(t1),b.z0+50]);
    out.push(bar('tie',{d:dt,tie:true,points:ring,code:'99',axis:'Z',radius:0,dist:{axis:2,from:b.z0+50,to:tieTop,spacing:T.s},note:`ปลอกวงกลม DB${dt} @${T.s} ทาบ ${Math.round(lap)}`}));}
  }
 }
 if(r.purpose==='beam'){
  if(!boxy)notes.push(`${p.label}: Preset คานใช้กับกล่องเท่านั้น`);
  else{const alongX=b.x1-b.x0>=b.y1-b.y0,s=alongX?0:1,t=1-s,S=r.stirrup,ds=S?.d||0,ext=r.ext||0;
   const t0=(t?b.y0:b.x0),t1=(t?b.y1:b.x1);
   const pt=(u:number,w:number,z:number):Vec3=>s===0?[u,w,z]:[w,u,z];
   for(const [key,L,z,label] of [['top',r.top,b.z1-c-ds,'บน'],['bot',r.bottom,b.z0+c+ds,'ล่าง']] as const){if(!L||L.n<1)continue;
    const s0=(s?b.y0:b.x0)+(ext?-ext:c+L.d/2),s1=(s?b.y1:b.x1)+(ext?ext:-c-L.d/2);
    const k=S&&S.s>0?cornerInset(bendRadius(ds,det,true),ds,L.d):0,zz=key==='top'?z-L.d/2-k:z+L.d/2+k,w0=t0+c+ds+L.d/2+k,w1=t1-c-ds-L.d/2-k;
    out.push(bar(key,{d:L.d,points:[pt(s0,w0,zz),pt(s1,w0,zz)],code:'00',axis:axisOf(s),face:key==='top'?'top':'bottom',dist:{axis:t,from:w0,to:L.n>1?w1:w0,count:L.n},note:`เหล็ก${label} ${L.n}-DB${L.d}${ext?` · ยื่นพ้นปลาย ${Math.round(ext)}`:''}`}));}
   if(S&&S.s>0){const rad=bendRadius(ds,det,true),e=Math.max(50,c+ds/2),a0=(s?b.y0:b.x0)+e,a1=(s?b.y1:b.x1)-e;
    out.push(bar('stirrup',{d:ds,tie:true,points:closedLink(t,2,s,t0+c+ds/2,t1-c-ds/2,b.z0+c+ds/2,b.z1-c-ds/2,a0,det,rad,ds),code:'99',axis:'Z',radius:rad,dist:{axis:s,from:a0,to:a1,spacing:S.s},note:`ปลอก DB/RB${ds} @${S.s}`}));}}
 }
 if(r.purpose==='wall'){
  const V=r.vert,H=r.horz,ext=r.ext||0;
  if(!boxy){if(V&&V.s>0)take('vert',verticalFaceBars(pm,{z0:b.z0+c,z1:b.z1-c,diameter:V.d,grade:grade(V.d),spacing:V.s,cover:c+(H?.d||0),leg:0,mark:'P',note:'เหล็กตั้งผิวนอก'}));
   if(H&&H.s>0)take('horz',loopBars(pm,{z:b.z0+c+H.d,zTop:b.z1-c-H.d,diameter:H.d,grade:grade(H.d),spacing:H.s,cover:c,lap:lapLength(det,H.d),mark:'P',note:'เหล็กนอนผิวนอก'}));
   notes.push(`${p.label}: ผนังที่ไม่ใช่กล่อง ใช้เหล็กรอบผิวนอก (ผิวในให้วาดเพิ่ม)`);}
  else{const alongX=b.x1-b.x0>=b.y1-b.y0,s=alongX?0:1,t=1-s,pt=(u:number,w:number,z:number):Vec3=>s===0?[u,w,z]:[w,u,z];
   const L0=(s?b.y0:b.x0),L1=(s?b.y1:b.x1),T0=(t?b.y0:b.x0),T1=(t?b.y1:b.x1),dh=H?.d||0,dv=V?.d||0;
   const faces=(r.layers??2)===2?[{k:'a',h:T0+c+dh/2,v:T0+c+dh+dv/2},{k:'b',h:T1-c-dh/2,v:T1-c-dh-dv/2}]:[{k:'',h:(T0+T1)/2-dv/2-dh/2,v:(T0+T1)/2}];
   // anchor: vertical bars start on the bottom mesh of the part below with a 90° foot turned outward
   const sup=r.anchor&&V?supportOf(sm,p):undefined,sc=sup?.q.rebar?.cover??m.cover;
   for(const f of faces){
    if(V&&V.s>0){const u0=L0+c+dh+dv/2,u1=L1-c-dh-dv/2,top=b.z1+(ext||-c-V.d/2);
     let base:Vec3[]=[pt(u0,f.v,b.z0+c+V.d/2)],anchored=0;
     if(sup){const zb=sup.c.z0+sc+2*(sup.q.rebar?.meshB?.d||16)+V.d/2,dir=f.k==='b'?1:-1,edge=t?(dir>0?sup.c.y1:sup.c.y0):(dir>0?sup.c.x1:sup.c.x0);
      anchored=Math.max(0,Math.min(det.hook90*V.d+sketchRadius(V.d),Math.abs(edge-f.v)-sc-V.d/2));
      base=anchored>2*V.d?[pt(u0,f.v+dir*anchored,zb),pt(u0,f.v,zb)]:[pt(u0,f.v,zb)];}
     const pts=[...base,pt(u0,f.v,top)];
     out.push(bar(`vert${f.k}`,{d:V.d,points:pts,code:pts.length>2?'11':'00',axis:'Z',dist:{axis:s,from:u0,to:u1,spacing:V.s},note:`เหล็กตั้ง${f.k?` ผิว ${f.k==='a'?'1':'2'}`:''} DB${V.d} @${V.s}${sup?` · ยึดลง${sup.q.label}${anchored>2*V.d?` ขา 90° ${Math.round(anchored)}`:''}`:''}${ext?` · ยื่นพ้นหัว ${Math.round(ext)}`:''}`}));}
    if(H&&H.s>0){const z0=b.z0+c+H.d/2,z1=b.z1-c-H.d/2;out.push(bar(`horz${f.k}`,{d:H.d,points:[pt(L0+c+H.d/2,f.h,z0),pt(L1-c-H.d/2,f.h,z0)],code:'00',axis:axisOf(s),dist:{axis:2,from:z0,to:z1,spacing:H.s},note:`เหล็กนอน${f.k?` ผิว ${f.k==='a'?'1':'2'}`:''} DB${H.d} @${H.s}`}));}}}
 }
 return {bars:out,notes};
}

/** Rebuilds every part's preset bars (marks kept per bar id), drops presets of removed parts, then reference regions. */
export function applyPartPresets(m:Member,spec:Spec):{member:Member;notes:string[]}{
 const sm=m.shapeModel;if(!sm)return {member:m,notes:[]};
 const old=new Map(m.bars.filter(isPresetBar).map(b=>[b.id,b])),notes:string[]=[];
 const kept=m.bars.filter(b=>!isPresetBar(b)),built:Bar[]=[];
 for(const p of sm.parts){if(!p.rebar)continue;let res;try{res=partPresetBars(m,p,spec);}catch(e){notes.push(`${p.label}: ${e instanceof Error?e.message:String(e)}`);continue;}notes.push(...res.notes);built.push(...res.bars);}
 // bars that existed keep their Mark; new ones take the next free Mark after all kept ones
 const made:Bar[]=built.map(b=>({...b,mark:old.get(b.id)?.mark||'',placementConfirmed:false}));
 for(const b of made)if(!b.mark)b.mark=nextMark({...m,bars:[...kept,...made.filter(x=>x.mark)]});
 const work:Member={...m,bars:[...kept,...made].slice(0,300)};
 if(made.length+m.bars.filter(b=>!isPresetBar(b)).length>300)notes.push('จำนวนชุดเหล็กเกิน 300 ชุด · ตัดชุดท้าย ๆ ออก');
 return {member:withOutsideRegions(work,spec),notes};
}

/** Moves bars drawn on a part (`sk-<part>-…`) by the part's move between two shape models (both normalised). */
export function moveOwnedSketchBars(m:Member,before:ShapeModel|undefined):Member{
 const sm=m.shapeModel;if(!sm||!before)return m;
 const shift=new Map<string,Vec3>();for(const p of sm.parts){const q=before.parts.find(x=>x.id===p.id);if(!q)continue;const a=partBox(q),b=partBox(p),d:Vec3=[b.x0-a.x0,b.y0-a.y0,b.z0-a.z0];if(d.some(v=>Math.abs(v)>1e-6))shift.set(p.id,d);}
 if(!shift.size)return m;
 return {...m,bars:m.bars.map(b=>{if(isPresetBar(b))return b;const id=barPart(sm,b),d=id&&shift.get(id);if(!d)return b;const k=b.distributionAxis?'XYZ'.indexOf(b.distributionAxis):-1;
  return {...b,points:b.points.map(p=>r3([p[0]+d[0],p[1]+d[1],p[2]+d[2]])),...(k>=0?{distributionStart:Math.max(0,b.distributionStart+d[k]),distributionEnd:Math.max(0,b.distributionEnd+d[k])}:{}),placementConfirmed:false};})};
}

export const OUTSIDE_PREFIX='genext-';
/** Bar portions past the concrete (laps above a column, starters, dowels): one reference region (cover 0, no
 * concrete) per bar set around them, so placement checks accept them; other regions are kept. */
export function withOutsideRegions(m:Member,spec:Spec):Member{
 const sm=m.shapeModel;if(!sm)return m;
 const ctx=editablePlacementContext(m),keep=ctx.regions.filter(r=>!r.id.startsWith(OUTSIDE_PREFIX));
 const boxes=outsideBoxes(m,spec),room=Math.max(0,REGION_LIMIT-keep.length);
 // more sets than free regions: the rest merge into the last box
 const list=boxes.slice(0,Math.max(0,room-1));if(boxes.length>list.length&&room>0){const rest=boxes.slice(list.length);list.push({mark:rest.map(b=>b.mark).join(', ').slice(0,60),min:[0,1,2].map(k=>Math.min(...rest.map(b=>b.min[k]))) as Vec3,max:[0,1,2].map(k=>Math.max(...rest.map(b=>b.max[k]))) as Vec3});}
 const regions=[...keep,...list.map((b,k)=>({id:`${OUTSIDE_PREFIX}${k+1}`,label:`เหล็ก ${b.mark} ยื่นพ้นคอนกรีต`.slice(0,80),origin:b.min,size:[0,1,2].map(i=>Math.max(1,b.max[i]-b.min[i])) as Vec3,reference:'ปลายเหล็กยื่นพ้นชิ้นส่วน (ต่อทาบ / เหล็กรอ / เดือย) · ไม่คิดคอนกรีต',cover:0,openings:[]}))];
 const same=JSON.stringify(regions)===JSON.stringify(ctx.regions);if(same)return m;
 return {...m,placementContext:regions.length?{version:2,regions}:undefined};
}
/** Per bar set: bounding box of the sampled path points outside the concrete (plus the boundary samples), padded by bar radius + cover. */
export function outsideBoxes(m:Member,spec:Spec):{mark:string;min:Vec3;max:Vec3}[]{
 const sm=m.shapeModel;if(!sm)return [];const g=shapeGeometry(sm);
 const inside=(p:Vec3)=>g.slabs.some(s=>p[2]>=s.z0-.5&&p[2]<=s.z1+.5&&inMulti([p[0],p[1]],s.region,.5));
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

export type CoverageItem={label:string;ok:boolean|'warn';hint?:string};
/** What a part of this purpose needs and whether its bars have it (preset sets by key, drawn bars count as extra). */
export function partCoverage(m:Member,p:ShapePart,spec:Spec):CoverageItem[]{
 const r=p.rebar;if(!r||r.purpose==='other')return [];
 const ids=new Set(m.bars.filter(b=>barPart(m.shapeModel,b)===p.id).map(b=>b.id)),has=(k:string)=>[...ids].some(id=>id.startsWith(`${PRESET_PREFIX}${p.id}-${k}`)),drawn=[...ids].some(id=>id.startsWith('sk-'));
 const det=detailingFor(spec);
 switch(r.purpose){
  case 'column':{const lap=r.main?lapLength(det,r.main.d):0,ext=r.ext||0;return [{label:'เหล็กยืน (main)',ok:has('main')},{label:'ปลอก',ok:has('tie')},{label:'ยึดลงชิ้นด้านล่าง (ขา 90°)',ok:!r.anchor?'warn':has('main')&&!!m.bars.find(b=>b.id===`${PRESET_PREFIX}${p.id}-main`&&b.points.length>2),hint:r.anchor?undefined:'ไม่ได้เลือกยึดลงฐาน'},
   {label:`ต่อทาบด้านบน ≥ Lap ${Math.round(lap)}`,ok:ext>=lap-1?true:ext>0?'warn':'warn',hint:ext>=lap-1?undefined:ext>0?`ยื่น ${Math.round(ext)} < ${Math.round(lap)}`:'ไม่มีเหล็กยื่นพ้นหัว (ถ้าเป็นชั้นบนสุดถือว่าถูก)'}];}
  case 'beam':return [{label:'เหล็กบน',ok:has('top')},{label:'เหล็กล่าง',ok:has('bot')},{label:'ปลอก',ok:has('stirrup')}];
  case 'slab':return [{label:'ตะแกรงล่าง 2 ทาง',ok:has('bx')&&has('by')},{label:'ตะแกรงบน',ok:has('tx')&&has('ty')?true:'warn',hint:has('tx')?undefined:'ไม่มี (พื้นช่วงสั้น / บางอาจไม่ต้องใช้)'}];
  case 'wall':{const sup=m.shapeModel&&supportOf(m.shapeModel,p);return [{label:'เหล็กตั้ง',ok:has('vert')},{label:'เหล็กนอน',ok:has('horz')},{label:'2 ชั้น (ผนังหนา ≥ 200)',ok:(r.layers??2)===2||Math.min(partBox(p).x1-partBox(p).x0,partBox(p).y1-partBox(p).y0)<200?true:'warn'},
   ...(sup?[{label:`ยึดลง${sup.q.label}`,ok:r.anchor&&has('vert')?true:drawn?'warn' as const:false,hint:r.anchor?undefined:'เหล็กตั้งไม่ได้ฝังลงชิ้นด้านล่าง'}]:[])];}
  case 'footing':return [{label:'ตะแกรงล่าง X',ok:has('bx')},{label:'ตะแกรงล่าง Y',ok:has('by')},{label:'ตะแกรงบน',ok:has('tx')?true:'warn',hint:has('tx')?undefined:'ไม่มีตะแกรงบน'},{label:'เหล็กรอบผิวข้าง (หนา > 600)',ok:p.height<=600||has('loop')||drawn?true:'warn',hint:p.height>600&&!has('loop')?'ฐานหนา · ควรมีลูปรอบผิว':undefined}];
 }
 return [];
}
