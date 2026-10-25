import {blankBar,type Bar,type Member,type Spec,type Vec3} from './model';
import type {CivilCategory,CivilInput,CivilRebar} from './civilInputSchema';
import {DEFAULT_DETAILING,gradeFor,lapLength,type Detailing} from './elementInput';
import {detailingFromSpec} from './specDetailing';
import {meshBars} from './rebarSketch';
import {vDitchInner} from './civilInput';

// Automatic reinforcement of Civil Work members (phase 2b): U / V channels, boxes (manhole / pit / tank), paving.
// Bars are polylines in member coordinates (ids `civ-<role>`), rebuilt on every apply; manual / sketched bars are kept.
export const CIVIL_BAR_PREFIX='civ-';
export const isCivilBar=(b:Bar)=>b.id.startsWith(CIVIL_BAR_PREFIX);
type RebarKind=Extract<CivilInput,{rebar?:unknown}>;
/** Typical reinforcement per category (edit to the drawing). */
export function defaultCivilRebar(c:CivilCategory):CivilRebar|undefined{
 const set=(diameter:number,spacing:number)=>({diameter,spacing});
 switch(c){
  case 'UDitch':return {cover:40,layers:'single',main:set(12,200),dist:set(10,200)};
  case 'VDitch':return {cover:35,layers:'single',main:set(10,200),dist:set(10,250)};
  case 'Trench':return {cover:40,layers:'double',main:set(12,200),dist:set(10,200),slab:set(12,150)};
  case 'Manhole':case 'Pit':return {cover:50,layers:'double',main:set(12,200),dist:set(12,200),slab:set(12,150)};
  case 'UGTank':case 'AGTank':return {cover:50,layers:'double',main:set(16,200),dist:set(12,200),slab:set(12,150)};
  case 'ConcretePaving':return {cover:50,layers:'single',main:set(12,300),dist:set(12,300)};
 }
}

type Axis='X'|'Y'|'Z';type P2=[number,number];
type G={role:string;d:number;points:Vec3[];code:string;axis:Axis;face:Bar['face'];note:string;dist?:{axis:Axis;from:number;to:number;count:number};offsets?:Vec3[];turns?:number[]};
const r3=(v:number)=>Number(v.toFixed(3));
/** Positions from a to b at ≤ s, both ends included. */
const spread=(a:number,b:number,s:number)=>{const n=b-a<1e-6?1:Math.ceil((b-a)/s-1e-9)+1;return Array.from({length:n},(_,k)=>n===1?a:a+(b-a)*k/(n-1));};
const fail=(msg:string):never=>{throw Error(msg);};
/** Equal pieces of a run longer than the stock bar, overlapping by the lap. */
function pieces(a:number,b:number,lap:number,stock:number):[number,number][]{
 const run=b-a;if(run<=stock+1e-6||stock-lap<=0)return [[a,b]];
 const k=Math.ceil((run-lap)/(stock-lap)-1e-9),len=(run+(k-1)*lap)/k;
 return Array.from({length:k},(_,i)=>[a+i*(len-lap),a+i*(len-lap)+len]);
}
/** Points along a polyline at ≤ s per segment (corners included once). */
function along(pts:P2[],s:number):P2[]{
 const out:P2[]=[];
 pts.slice(1).forEach((b,k)=>{const a=pts[k],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/s-1e-9));for(let j=k===0?0:1;j<=n;j++)out.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);});
 return out;
}
/** Straight bars along X or Y from a to b at each cross position `pos` (the two other coordinates), lapped to the stock
 * length; one Mark placed by offsets. */
function lineBars(role:string,d:number,dir:'X'|'Y',a:number,b:number,pos:P2[],det:Detailing,face:Bar['face'],note:string):G{
 const lap=lapLength(det,d),ps=pieces(a,b,lap,det.stockLength),pt=(u:number,p:P2):Vec3=>dir==='X'?[u,p[0],p[1]]:[p[0],u,p[1]];
 const first=pt(ps[0][0],pos[0]),offsets=ps.flatMap(([u])=>pos.map(p=>{const q=pt(u,p);return [q[0]-first[0],q[1]-first[1],q[2]-first[2]] as Vec3;}));
 if(offsets.length>2000)fail(`${note}: เกิน 2,000 ตำแหน่งต่อ Mark · แยกเป็นหลายช่วง`);
 return {role,d,points:[first,pt(ps[0][1],pos[0])],code:'00',axis:dir,face,offsets,note:`${note}${ps.length>1?` · ต่อทาบ ${Math.round(lap)} mm (${ps.length} ท่อนต่อแนว)`:''}`};
}
/** Two-way mesh of a rectangle: `first` direction at z, the other direction next to it (up = +1 above, −1 below). */
function rectMesh(role:string,label:string,box:{x0:number;x1:number;y0:number;y1:number},z:number,up:1|-1,first:'X'|'Y',m:{diameter:number;spacing:number},o:{diameter:number;spacing:number},c:number,det:Detailing,face:Bar['face']):G[]{
 const bar=(dir:'X'|'Y',set:{diameter:number;spacing:number},zz:number,tag:string)=>{const e=c+set.diameter/2,[u0,u1,v0,v1]=dir==='X'?[box.x0,box.x1,box.y0,box.y1]:[box.y0,box.y1,box.x0,box.x1];
  const pos=spread(v0+e,v1-e,set.spacing).map(v=>[v,zz] as P2);
  return lineBars(`${role}-${tag}`,set.diameter,dir,u0+e,u1-e,pos,det,face,`${label} ทิศ ${dir} DB${set.diameter}@${set.spacing}`);};
 return [bar(first,m,z,first.toLowerCase()),bar(first==='X'?'Y':'X',o,z+up*(m.diameter+o.diameter)/2,(first==='X'?'Y':'X').toLowerCase())];
}
/** Rectangle ring positions (CCW) at ≤ s per side with inward normals; corners once. */
function ringPositions(x0:number,y0:number,x1:number,y1:number,s:number){
 const ring:P2[]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],out:{p:P2;n:P2}[]=[];
 ring.forEach((a,k)=>{const b=ring[(k+1)%4],len=Math.hypot(b[0]-a[0],b[1]-a[1]),u:P2=[(b[0]-a[0])/len,(b[1]-a[1])/len],n:P2=[-u[1],u[0]],cnt=Math.ceil(len/s-1e-9)+1;
  for(let j=0;j<cnt-1;j++)out.push({p:[a[0]+u[0]*len*j/(cnt-1),a[1]+u[1]*len*j/(cnt-1)],n});});
 return out;
}
/** Vertical wall bars round a ring: template per position, one Mark (offsets + turns about the last point). */
function ringBars(role:string,d:number,pos:{p:P2;n:P2}[],tpl:(q:{p:P2;n:P2})=>Vec3[],code:string,note:string):G{
 const points=tpl(pos[0]),pivot=points.at(-1)!,ang=(n:P2)=>Math.atan2(n[1],n[0]);
 const turns=pos.map(q=>{let t=(ang(q.n)-ang(pos[0].n))*180/Math.PI;if(t>180)t-=360;if(t<-180)t+=360;return Math.round(t*1000)/1000;});
 const offsets=pos.map(q=>{const last=tpl(q).at(-1)!;return [last[0]-pivot[0],last[1]-pivot[1],last[2]-pivot[2]] as Vec3;});
 return {role,d,points,code,axis:'Z',face:'side',offsets,turns,note};
}
/** Closed horizontal loops round a rectangle (lap on the first side), stacked along Z. */
function loopBar(role:string,d:number,x0:number,y0:number,x1:number,y1:number,z0:number,z1:number,s:number,det:Detailing,note:string):G{
 const lap=lapLength(det,d),ring:P2[]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0],[Math.min(x1,x0+lap),y0]],zs=spread(z0,z1,s);
 return {role,d,points:ring.map(([x,y])=>[x,y,z0] as Vec3),code:'99',axis:'X',face:'side',dist:{axis:'Z',from:z0,to:zs.at(-1)!,count:zs.length},note:`${note} · ${zs.length} ชั้น · ทาบ ${Math.round(lap)} mm`};
}

function channelBars(i:Extract<CivilInput,{kind:'channel'}>,r:CivilRebar,det:Detailing):G[]{
 const L=i.length,t=i.wall,b=i.base,W=i.innerWidth+2*t,top=b+i.innerHeight,c=r.cover,dm=r.main.diameter,dd=r.dist.diameter,zt=top-c-dm/2,x0=c+dm/2,x1=L-c-dm/2,xs=spread(x0,x1,r.main.spacing);
 const layers=r.layers==='double'?[{key:'o',y:c+dm/2,z:c+dm/2,side:1,label:'ชั้นนอก'},{key:'i',y:t-c-dm/2,z:b-c-dm/2,side:-1,label:'ชั้นใน'}]:[{key:'m',y:Math.max(t/2,c+dm/2),z:Math.max(b/2,c+dm/2),side:1,label:'กลางผนัง'}];
 if(r.layers==='double'&&(layers[1].y-layers[0].y<dm+2*dd||layers[1].z-layers[0].z<dm+2*dd))fail(`ผนัง / พื้นรางหนาไม่พอสำหรับเหล็ก 2 ชั้น (cover ${c} mm) · ใช้ชั้นเดียวหรือเพิ่มความหนา`);
 if(zt-Math.max(...layers.map(l=>l.z))<2*dm)fail('ความลึกรางน้อยเกินไปสำหรับเหล็กรูปตัว U');
 const out:G[]=[];
 for(const l of layers){const y2=W-l.y,δ=l.side*(dm+dd)/2;
  out.push({role:`u-${l.key}`,d:dm,points:[[x0,l.y,zt],[x0,l.y,l.z],[x0,y2,l.z],[x0,y2,zt]],code:'21',axis:'Y',face:'side',dist:{axis:'X',from:x0,to:xs.at(-1)!,count:xs.length},note:`เหล็กรูปตัว U ${l.label} DB${dm}@${r.main.spacing}`});
  const pos=along([[l.y+δ,zt],[l.y+δ,l.z+δ],[y2-δ,l.z+δ],[y2-δ,zt]],r.dist.spacing);
  out.push(lineBars(`long-${l.key}`,dd,'X',c+dd/2,L-c-dd/2,pos,det,'side',`เหล็กตามยาว ${l.label} DB${dd}@${r.dist.spacing}`));}
 if(i.cover>0&&r.slab)out.push(...slabMesh('cover','ฝาราง',{x0:0,x1:L,y0:0,y1:W},top,i.cover,r.slab,c,r.layers,det,'Y',r.slab,false,false));
 return out;
}
/** Mesh of a slab z0..z0+h: bottom (span direction outermost) and, for double layers, top. */
function slabMesh(role:string,label:string,box:{x0:number;x1:number;y0:number;y1:number},z0:number,h:number,set:{diameter:number;spacing:number},c:number,layers:CivilRebar['layers'],det:Detailing,span:'X'|'Y',other=set,top=false,strict=true):G[]{
 const d=set.diameter+other.diameter,zb=z0+c+set.diameter/2,zt=z0+h-c-set.diameter/2;
 if(h-2*c<d)fail(`${label}หนาไม่พอสำหรับ cover ${c} mm`);
 const bottom=()=>rectMesh(`${role}-b`,`${label} ชั้นล่าง`,box,zb,1,span,set,other,c,det,'bottom'),upper=()=>rectMesh(`${role}-t`,`${label} ชั้นบน`,box,zt,-1,span,set,other,c,det,'top');
 if(layers==='single')return top?upper():bottom();
 // thin cover slabs (strict = false) keep the bottom layer only
 if(zt-zb<2*d){if(!strict)return bottom();fail(`${label}หนาไม่พอสำหรับเหล็ก 2 ชั้น · ใช้ชั้นเดียวหรือเพิ่มความหนา`);}
 return [...bottom(),...upper()];
}
function boxBars(m:Member,i:Extract<CivilInput,{kind:'box'}>,r:CivilRebar,det:Detailing):{gen:G[];slab:Bar[]}{
 const t=i.wall,b=i.base,τ=i.toe,L=i.innerLength+2*t,W=i.innerWidth+2*t,top=b+i.innerHeight,c=r.cover,dm=r.main.diameter,dd=r.dist.diameter,cv=i.cover;
 const gen=slabMesh('base','พื้นบ่อ',{x0:0,x1:L+2*τ,y0:0,y1:W+2*τ},0,b,r.main,c,r.layers,det,'X');
 const leg=Math.max(det.hook90*dm,150),dbl=r.layers==='double';
 const o=dbl?c+dm/2:Math.max(t/2,c+dm/2),oi=c+dm/2,zFoot=c+2*dm+dm/2,zTop=cv>0?top+cv-c-dm/2-(r.slab?2*r.slab.diameter:0):top-c-dm/2;
 if(dbl&&t-o-oi<dm+2*dd)fail(`ผนังหนาไม่พอสำหรับเหล็ก 2 ชั้น (cover ${c} mm) · ใช้ชั้นเดียวหรือเพิ่มความหนา`);
 if(zFoot+(dbl?dm*1.5:dm/2)>b-c-(dbl?2*dm:0))fail('พื้นบ่อหนาไม่พอสำหรับขาเหล็กยืนผนังและตะแกรงพื้น');
 // outer (or centre) vertical bars: foot turned inward in the base; with a cover slab the top turns inward into the slab
 const outer=ringPositions(τ+o,τ+o,τ+L-o,τ+W-o,r.main.spacing),inLeg=(q:{p:P2;n:P2},z:number):Vec3=>[q.p[0]+q.n[0]*leg,q.p[1]+q.n[1]*leg,z];
 gen.push(ringBars('wall-v-o',dm,outer,q=>[inLeg(q,zFoot),[q.p[0],q.p[1],zFoot],[q.p[0],q.p[1],zTop],...(cv>0?[inLeg(q,zTop)]:[])],cv>0?'21':'11',`เหล็กยืนผนัง${dbl?'ด้านนอก':' (กลางผนัง)'} DB${dm}@${r.main.spacing} · ปลายล่างงอเข้าพื้น ${Math.round(leg)} mm${cv>0?' · ปลายบนงอเข้าฝา':''}`));
 const zLoop0=b+50,zLoop1=top-(cv>0?50:c+dd/2),oh=o+(dm+dd)/2;
 gen.push(loopBar('wall-h-o',dd,τ+oh,τ+oh,τ+L-oh,τ+W-oh,zLoop0,zLoop1,r.dist.spacing,det,`เหล็กนอนผนัง${dbl?'ด้านนอก':''} DB${dd}@${r.dist.spacing}`));
 if(dbl){const a=t-oi,inner=ringPositions(τ+a,τ+a,τ+L-a,τ+W-a,r.main.spacing),zi=zFoot+dm,zTi=cv>0?zTop-dm:zTop;
  gen.push(ringBars('wall-v-i',dm,inner,q=>[inLeg(q,zi),[q.p[0],q.p[1],zi],[q.p[0],q.p[1],zTi]],'11',`เหล็กยืนผนังด้านใน DB${dm}@${r.main.spacing} · ปลายล่างงอเข้าพื้น ${Math.round(leg)} mm`));
  const ah=a-(dm+dd)/2;gen.push(loopBar('wall-h-i',dd,τ+ah,τ+ah,τ+L-ah,τ+W-ah,zLoop0,Math.min(zLoop1,zTi),r.dist.spacing,det,`เหล็กนอนผนังด้านใน DB${dd}@${r.dist.spacing}`));}
 // cover slab (opening cut out of the mesh by the plan region)
 const slab:Bar[]=[];
 if(cv>0&&r.slab){const s=r.slab,zb=top+c+s.diameter/2,zt=top+cv-c-s.diameter/2,lay=(z:number,dir:'X'|'Y',tag:string,label:string)=>meshBars(m,{z,diameter:s.diameter,grade:gradeFor(det,s.diameter,det.mainGrade),spacing:s.spacing,cover:c,dirs:[dir],leg:0,note:label}).map((x,k)=>({...x,id:`${CIVIL_BAR_PREFIX}cover-${tag}-${k+1}`,face:(tag[0]==='b'?'bottom':'top') as Bar['face']}));
  if(zt-zb<s.diameter*2)fail(`ฝาหนาไม่พอสำหรับ cover ${c} mm`);
  slab.push(...lay(zb,'X','bx','ฝาบ่อ ชั้นล่าง'),...lay(zb+s.diameter,'Y','by','ฝาบ่อ ชั้นล่าง'));
  if(dbl&&zt-zb>=4*s.diameter)slab.push(...lay(zt,'X','tx','ฝาบ่อ ชั้นบน'),...lay(zt-s.diameter,'Y','ty','ฝาบ่อ ชั้นบน'));}
 return {gen,slab};
}
function vChannelBars(i:Extract<CivilInput,{kind:'vchannel'}>,r:CivilRebar,det:Detailing):G[]{
 const t=i.lining,D=i.depth,c=r.cover,dm=r.main.diameter,dd=r.dist.diameter;
 if(t<2*c+dm+dd+.5)fail(`ดาดหนาไม่พอสำหรับเหล็ก 1 ชั้น (cover ${c} mm ทั้งสองด้าน) · ต้องหนาอย่างน้อย ${2*c+dm+dd} mm`);
 // mid-line of the lining: inner surface moved t/2 into the concrete (normal (dz, −dy) of each left-to-right segment)
 const {inner}=vDitchInner(i);
 const off=(k:number,h:number)=>{const a=inner[k],e=inner[k+1],l=Math.hypot(e[0]-a[0],e[1]-a[1]),n:P2=[(e[1]-a[1])/l*h,-(e[0]-a[0])/l*h];return {a:[a[0]+n[0],a[1]+n[1]] as P2,e:[e[0]+n[0],e[1]+n[1]] as P2};};
 const hit=(s1:{a:P2;e:P2},s2:{a:P2;e:P2}):P2=>{const d1=[s1.e[0]-s1.a[0],s1.e[1]-s1.a[1]],d2=[s2.e[0]-s2.a[0],s2.e[1]-s2.a[1]],den=d1[0]*d2[1]-d1[1]*d2[0];if(Math.abs(den)<1e-9)return s1.e;const u=((s2.a[0]-s1.a[0])*d2[1]-(s2.a[1]-s1.a[1])*d2[0])/den;return [s1.a[0]+u*d1[0],s1.a[1]+u*d1[1]];};
 // the outer bottom of the lining is flat: a sharp V vertex below the cover level is cut along that level
 const clip=(pts:P2[],zMin:number)=>pts.flatMap((p,k):P2[]=>{if(p[1]>=zMin-1e-9)return [p];const cut=(q:P2):P2=>[p[0]+(q[0]-p[0])*(zMin-p[1])/(q[1]-p[1]),zMin];return [...(k>0&&pts[k-1][1]>zMin?[cut(pts[k-1])]:[]),...(k<pts.length-1&&pts[k+1][1]>zMin?[cut(pts[k+1])]:[])];});
 const line=(h:number,d:number)=>{const segs=inner.slice(1).map((_,k)=>off(k,h)),zEnd=t+D-c-dm/2,atZ=(s:{a:P2;e:P2},z:number):P2=>{const u=(z-s.a[1])/(s.e[1]-s.a[1]);return [s.a[0]+u*(s.e[0]-s.a[0]),z];};
  return clip([atZ(segs[0],zEnd),...segs.slice(1).map((s,k)=>hit(segs[k],s)),atZ(segs.at(-1)!,zEnd)],c+d/2);};
 const mid=line(t/2+dd/2,dm),L=i.length,x0=c+dm/2,xs=spread(x0,L-c-dm/2,r.main.spacing);
 const out:G[]=[{role:'v',d:dm,points:mid.map(([y,z])=>[x0,y,z] as Vec3),code:'99',axis:'Y',face:'side',dist:{axis:'X',from:x0,to:xs.at(-1)!,count:xs.length},note:`เหล็กตามขวางรางวี DB${dm}@${r.main.spacing} (กลางความหนาดาด)`}];
 const pos=along(line(t/2-dm/2,dd),r.dist.spacing);
 out.push(lineBars('long',dd,'X',c+dd/2,L-c-dd/2,pos,det,'side',`เหล็กตามยาวรางวี DB${dd}@${r.dist.spacing}`));
 return out;
}
function pavingBars(i:Extract<CivilInput,{kind:'paving'}>,r:CivilRebar,det:Detailing):G[]{
 const box={x0:0,x1:i.length,y0:0,y1:i.width},c=r.cover;
 return slabMesh('pave','แผ่นพื้น',box,0,i.thickness,r.main,c,r.layers,det,'Y',r.dist,true);
}

function toBar(g:G,mark:string,det:Detailing):Bar{
 const rad=g.code==='00'?0:(g.d<=16?det.bendSmall:det.bendLarge)*g.d+g.d/2,count=g.offsets?.length??g.dist?.count??1;
 return {...blankBar(mark),id:CIVIL_BAR_PREFIX+g.role,diameter:g.d,grade:gradeFor(det,g.d,g.d<=9?det.tieGrade:det.mainGrade),count,axis:g.axis,face:g.face,shape:'polyline',shapeCode:g.code,radius:r3(rad),
  points:g.points.map(p=>p.map(r3) as Vec3),...(['00','11','21'].includes(g.code)?{lengthMethod:'bs8666' as const}:{}),
  ...(g.offsets?{offsets:g.offsets.map(p=>p.map(r3) as Vec3),...(g.turns?.some(t=>t!==0)?{offsetTurns:g.turns}:{})}:g.dist?{distributionAxis:g.dist.axis,distributionStart:r3(g.dist.from),distributionEnd:r3(g.dist.to)}:{}),
  note:g.note.slice(0,500)};
}
/** Member with its civ-* bars rebuilt from `input.rebar` (none = removed); other bars kept, Marks continue after theirs. */
export function withCivilRebar(m:Member,input:CivilInput,spec?:Spec):Member{
 const keep=m.bars.filter(b=>!isCivilBar(b)),r=(input as RebarKind).rebar;
 if(!r||!('rebar' in input))return {...m,bars:keep};
 const det=spec?detailingFromSpec(spec,DEFAULT_DETAILING,{category:m.category}):DEFAULT_DETAILING;
 let gen:G[]=[],extra:Bar[]=[];
 if(input.kind==='channel')gen=channelBars(input,r,det);
 else if(input.kind==='vchannel')gen=vChannelBars(input,r,det);
 else if(input.kind==='box'){const x=boxBars(m,input,r,det);gen=x.gen;extra=x.slab;}
 else if(input.kind==='paving')gen=pavingBars(input,r,det);
 const used=new Set(keep.map(b=>b.mark));let k=0;const mark=()=>{for(;;){k++;const s=`C${String(k).padStart(2,'0')}`;if(!used.has(s))return s;}};
 return {...m,bars:[...gen.map(g=>toBar(g,mark(),det)),...extra.map(b=>({...b,mark:mark()})),...keep]};
}
