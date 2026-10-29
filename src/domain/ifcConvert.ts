import type {Bar,Member,Spec,Vec3} from './model';
import {barPaths,takeoff,validateMember} from './engine';
import {applyElementInput,defaultElementInput,elementInputSchema,type FoundationInput} from './elementInput';

// Step 3 of the IFC import: the bars of an imported footing (rectangular cap, optional pedestal, piles) are read back
// as footing input (meshes, loops, face bars, pedestal bars, piles). Rows the user ticks become input and their IFC
// bars are replaced by generated ones; everything else stays as IFC bars. The member keeps `ifcSource` (converted).

type Layer='bottomX'|'bottomY'|'topX'|'topY'|'loops'|'faces'|'colMain'|'colTie'|'other';
export type ConvertRow={key:Layer;label:string;from:string;to:string;state:'ok'|'warn'|'keep';marks:string[];note:string};
export type ConvertPlan={rows:ConvertRow[];problems:string[];input?:FoundationInput;before:number;
 /** layer of every placed bar of each IFC Mark (in barPaths order): converted bars leave the Mark, the rest stay */
 markLayers?:Record<string,Layer[]>};
const labels:Record<Layer,string>={bottomX:'ตะแกรงล่าง X',bottomY:'ตะแกรงล่าง Y',topX:'ตะแกรงบน X',topY:'ตะแกรงบน Y',loops:'LOOPS (ปลอกรอบ)',faces:'เหล็กผิวข้าง (แนวตั้ง)',colMain:'ตอม่อ: เหล็กยืน',colTie:'ตอม่อ: ปลอก',other:'อื่น ๆ'};
const r5=(v:number)=>Math.max(0,Math.round(v/5)*5);
const mode=(a:number[])=>{const c=new Map<number,number>();for(const v of a)c.set(v,(c.get(v)||0)+1);return [...c.entries()].sort((x,y)=>y[1]-x[1])[0]?.[0]??0;};
const len=(a:Vec3,b:Vec3)=>Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);

export const isIfcBar=(b:Bar)=>b.id.startsWith('ifc-');
/** Why a member cannot be converted ('' = it can). */
export function ifcConvertBlocker(m:Member):string{
 if(!m.ifcSource)return 'ไม่ได้มาจาก IFC';if(m.ifcSource.converted)return 'แปลงแล้ว';
 if(m.category!=='Foundation')return 'รุ่นนี้แปลงได้เฉพาะฐานราก';
 const parts=m.shapeModel?.parts||[];if(parts[0]?.shape!=='box')return 'ฐานรากไม่ใช่สี่เหลี่ยมผืนผ้า (แปลงได้เฉพาะฐานสี่เหลี่ยม)';
 if(parts.length>2)return 'มีตอม่อมากกว่า 1 ต้น';if(parts[1]&&parts[1].shape!=='box')return 'ตอม่อไม่ใช่สี่เหลี่ยม';
 if(m.deductions.some(d=>d.reason.startsWith('[IFC]')))return 'ฐานรากมีการตัด / บากในโมเดล (แปลงได้เฉพาะกล่องเต็ม)';
 return '';
}

export function ifcConvertPlan(m:Member,spec:Spec):ConvertPlan{
 const before=safeWeight(m,spec),blocker=ifcConvertBlocker(m);if(blocker)return {rows:[],problems:[blocker],before};
 const parts=m.shapeModel!.parts,f=parts[0] as Extract<typeof parts[number],{shape:'box'}>,ped=parts[1] as Extract<typeof parts[number],{shape:'box'}>|undefined;
 const X0=f.x,Y0=f.y,Z0=f.z0,W=f.w,L=f.d,H=f.height;
 // inside the pedestal: plan and above its base (bars below it, in the footing, are footing bars)
 const inPedPlan=(p:Vec3)=>!!ped&&p[0]>=ped.x-1&&p[0]<=ped.x+ped.w+1&&p[1]>=ped.y-1&&p[1]<=ped.y+ped.d+1,inPed=(p:Vec3)=>inPedPlan(p)&&p[2]>=Math.max(ped!.z0,Z0+H)-1;
 // one entry per placed bar: a Mark may hold bars of both directions (copies turned about Z)
 type Info={bar:Bar;path:Vec3[];layer:Layer;dir:0|1|2;at:number;leg:number;legs:number;z:number;code:string};
 const infos:Info[]=[];
 for(const b of m.bars.filter(isIfcBar))for(const p of barPaths(m,b)){
  if(p.length<2){infos.push({bar:b,path:p,layer:'other',dir:0,at:0,leg:0,legs:0,z:0,code:b.shapeCode});continue;}
  const legs=p.slice(1).map((q,i)=>({a:p[i],b:q,l:len(p[i],q),d:[0,1,2].reduce((k,j)=>Math.abs(q[j]-p[i][j])>Math.abs(q[k]-p[i][k])?j:k,0) as 0|1|2}));
  const main=legs.reduce((a,c)=>c.l>a.l?c:a),dir=main.d,z=(main.a[2]+main.b[2])/2-Z0,mid=main.a.map((v,k)=>(v+main.b[k])/2) as Vec3;
  const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]),spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys),flat=p.every(q=>Math.abs(q[2]-p[0][2])<5);
  const vert=legs.filter(g=>g.d===2&&g.l>50),inside=p.every(inPed);
  let layer:Layer='other';
  if(dir!==2&&flat&&spanX>.5*(inside?ped!.w:W)&&spanY>.5*(inside?ped!.d:L))layer=inside?'colTie':'loops';
  else if(dir!==2&&main.l>.6*(dir===0?W:L)&&!inPed(mid))layer=(z<H/2?'bottom':'top')+(dir===0?'X':'Y') as Layer;
  // pedestal bars: vertical inside its plan and rising above the footing (the foot may sit in the footing)
  else if(dir===2&&inPedPlan(main.a)&&inPedPlan(main.b)&&Math.max(main.a[2],main.b[2])>Z0+H+1)layer='colMain';
  else if(dir===2){const edge=Math.min(mid[0]-X0,X0+W-mid[0],mid[1]-Y0,Y0+L-mid[1]);if(edge<200)layer='faces';}
  const at=layer==='loops'||layer==='colTie'?Math.min(...p.map(q=>q[2]))-Z0:dir===2?0:mid[dir===0?1:0];
  infos.push({bar:b,path:p,layer,dir,at,leg:vert.length?Math.round(vert.reduce((n,g)=>n+g.l,0)/vert.length):0,legs:vert.length,z,code:b.shapeCode});
 }
 const rows:ConvertRow[]=[],input=structuredClone(defaultElementInput('Foundation')) as FoundationInput;
 input.width=W;input.length=L;input.thickness=H;
 const by=(k:Layer)=>infos.filter(i=>i.layer===k),dia=(l:Info[])=>mode(l.map(i=>i.bar.diameter)),marks=(l:Info[])=>[...new Set(l.map(i=>i.bar.mark))];
 // spacing = median gap between distinct positions (extra bars / gaps do not skew it)
 const spacing=(vals:number[])=>{const v:number[]=[];for(const x of vals.slice().sort((a,b)=>a-b))if(!v.length||x-v.at(-1)!>5)v.push(x);if(v.length<2)return 0;const g=v.slice(1).map((x,i)=>x-v[i]).sort((a,b)=>a-b);return r5(g[Math.floor(g.length/2)]);};
 const warnD=(l:Info[])=>new Set(l.map(i=>i.bar.diameter)).size>1?`ขนาดไม่เท่ากัน (${[...new Set(l.map(i=>'Ø'+i.bar.diameter))].join(' ')}) ใช้ Ø${dia(l)}`:'';
 let coverB=Infinity,coverT=Infinity,coverS=Infinity;
 for(const k of ['bottomX','bottomY','topX','topY'] as const){
  const l=by(k);if(!l.length)continue;const d=dia(l),s=spacing(l.map(i=>i.at)),n=l.length,legs=mode(l.map(i=>i.legs)),leg=Math.round(mode(l.map(i=>i.leg))/5)*5;
  const shape=k.startsWith('bottom')&&mode(l.map(i=>i.code==='41'?1:0))?'41':legs>=2?'21':legs===1?'11':'00',layer={diameter:d,spacing:Math.max(50,s||150),shape,leg:shape==='41'||shape==='00'?0:leg,radius:0};
  if(k.startsWith('bottom')){input.rebar[k as 'bottomX']={...input.rebar[k as 'bottomX'],...layer} as any;coverB=Math.min(coverB,...l.map(i=>i.z-i.bar.diameter/2));}
  else{input.rebar[k as 'topX']={...input.rebar[k as 'topX'],...layer,enabled:true} as any;coverT=Math.min(coverT,...l.map(i=>H-i.z-i.bar.diameter/2));}
  for(const i of l)for(const q of i.path){const ax=k.endsWith('X')?0:1;coverS=Math.min(coverS,ax===0?q[0]-X0-i.bar.diameter/2:q[1]-Y0-i.bar.diameter/2,ax===0?X0+W-q[0]-i.bar.diameter/2:Y0+L-q[1]-i.bar.diameter/2);}
  const w=warnD(l)||(new Set(l.map(i=>Math.round(i.at/5))).size<3||s>1000?'มีน้อยกว่า 3 ตำแหน่ง / ระยะห่างมาก ตรวจระยะเรียงอีกครั้ง':'');rows.push({key:k,label:labels[k],from:`${n} เส้น · Ø${d} @${s||'—'} · Shape ${[...new Set(l.map(i=>i.code))].join('/')}`,to:`Ø${d} @${layer.spacing} · Shape ${shape}${layer.leg?` ขา ${layer.leg}`:''}`,state:w||!s?'warn':'ok',marks:marks(l),note:w||(!s?'มีเส้นเดียว ระยะเรียงใช้ค่าเริ่มต้น':'')});
 }
 const loops=by('loops');if(loops.length){const d=dia(loops),zs=loops.map(i=>i.at),s=spacing(zs);input.rebar.side={...input.rebar.side,enabled:true,diameter:d,spacing:Math.max(50,s||200)};
  rows.push({key:'loops',label:labels.loops,from:`${new Set(zs.map(Math.round)).size} ชั้น · Ø${d}`,to:`Ø${d} @${input.rebar.side.spacing} · ต่อทาบตามรูปแบบมาตรฐาน`,state:warnD(loops)?'warn':'ok',marks:marks(loops),note:warnD(loops)||'ตำแหน่งต่อทาบใช้ค่าในแอป (ดูได้ในแท็บข้อมูล)'});}
 const faces=by('faces');if(faces.length){const d=dia(faces),pos=faces.map(i=>i.path.reduce((a,c)=>c[2]<a[2]?c:a,i.path[0])),sx=spacing(pos.filter(q=>Math.min(q[1]-Y0,Y0+L-q[1])<200).map(q=>q[0])),sy=spacing(pos.filter(q=>Math.min(q[0]-X0,X0+W-q[0])<200).map(q=>q[1]));
  input.rebar.sideBars={...input.rebar.sideBars,enabled:true,diameter:d,spacing:Math.max(50,sx||sy||200)};
  rows.push({key:'faces',label:labels.faces,from:`${pos.length} เส้น · Ø${d} · X @${sx||'—'} · Y @${sy||'—'}`,to:`Ø${d} @${input.rebar.sideBars.spacing}`,state:sx&&sy&&Math.abs(sx-sy)>10?'warn':'ok',marks:marks(faces),note:sx&&sy&&Math.abs(sx-sy)>10?'ระยะ X / Y ไม่เท่ากัน ปรับแยกได้ในแท็บข้อมูล':''});}
 if(ped){const main=by('colMain'),ties=by('colTie'),col={...input.column,type:'pedestal' as const,columnNo:'',width:ped.w,depth:ped.d,height:Math.max(1,Math.round(ped.z0+ped.height-(Z0+H))),offsetX:Math.round(ped.x+ped.w/2-(X0+W/2)),offsetY:Math.round(ped.y+ped.d/2-(Y0+L/2))};
  if(main.length){const d=dia(main),pts=main.map(i=>i.path.reduce((a,c)=>c[2]<a[2]?c:a,i.path[0])),cx=pts.map(q=>Math.round(q[0])),cy=pts.map(q=>Math.round(q[1])),x0=Math.min(...cx),x1=Math.max(...cx),y0=Math.min(...cy),y1=Math.max(...cy);
   const onX=pts.filter(q=>Math.abs(q[1]-y0)<5&&q[0]>x0+5&&q[0]<x1-5).length,onY=pts.filter(q=>Math.abs(q[0]-x0)<5&&q[1]>y0+5&&q[1]<y1-5).length;
   const top=Math.max(...main.flatMap(i=>i.path.map(q=>q[2]))),pedTop=ped.z0+ped.height;
   col.main={...col.main,corner:{diameter:d,count:1},sideX:{diameter:d,count:onX},sideY:{diameter:d,count:onY},diameter:d};col.projection=Math.max(0,Math.round(top-pedTop));col.cover=r5(x0-ped.x-d/2);
   rows.push({key:'colMain',label:labels.colMain,from:`${pts.length} เส้น · Ø${d}`,to:`มุม 4 + ด้าน X ${onX}×2 + ด้าน Y ${onY}×2 · ยื่นเหนือตอม่อ ${col.projection}`,state:pts.length===4+2*onX+2*onY?'ok':'warn',marks:marks(main),note:pts.length===4+2*onX+2*onY?'':'จำนวนไม่ลงตัวกับการวางรอบหน้าตัด'});}
  if(ties.length){const d=dia(ties),s=spacing(ties.map(i=>i.at));col.tie={...col.tie,diameter:d,spacing:Math.max(50,s||200)};rows.push({key:'colTie',label:labels.colTie,from:`${ties.length} ชิ้น · Ø${d}`,to:`Ø${d} @${col.tie.spacing}`,state:'ok',marks:marks(ties),note:''});}
  input.column=col as typeof input.column;}
 const other=by('other');if(other.length)rows.push({key:'other',label:labels.other,from:`${other.length} เส้น · Mark ${marks(other).join(', ')}`.slice(0,120),to:'เก็บเป็นเหล็ก IFC',state:'keep',marks:marks(other),note:''});
 input.cover={bottom:Number.isFinite(coverB)?r5(coverB):input.cover.bottom,top:Number.isFinite(coverT)?r5(coverT):input.cover.top,side:Number.isFinite(coverS)?r5(coverS):input.cover.side};
 const piles=m.shapeModel!.piles;if(piles?.positions.length)input.pile={...input.pile,type:piles.type==='round'?'round' as any:'square',size:piles.size,layout:'custom',count:piles.positions.length,length:piles.length,cutoff:piles.cutoff,embed:piles.embed,offsetX:0,offsetY:0,positions:piles.positions.map(([x,y])=>[Math.round(x-X0),Math.round(y-Y0)] as [number,number])};
 else input.pile={...input.pile,count:0};
 const site=m.shapeModel!.site;if(site)input.excavation={depth:site.excavationDepth,workingSpace:site.workingSpace,slope:site.slope};
 input.lean={thickness:site?.leanThickness||0,projection:site?.leanProjection||0};
 const markLayers:Record<string,Layer[]>={};for(const i of infos)(markLayers[i.bar.mark]||=[]).push(i.layer);
 const parsed=elementInputSchema.safeParse(input);
 return {markLayers,rows,problems:parsed.success?[]:parsed.error.issues.slice(0,5).map(i=>`${i.path.join('.')}: ${i.message}`),input:parsed.success?parsed.data as FoundationInput:undefined,before};
}

/** Member with the ticked rows as footing input (generated bars) and the other IFC bars kept. */
export function applyIfcConvert(m:Member,plan:ConvertPlan,keys:Set<Layer>,spec:Spec):{member:Member;after:number;problems:string[];warnings:string[]}{
 if(!plan.input)return {member:m,after:plan.before,problems:plan.problems,warnings:[]};
 const input=structuredClone(plan.input),off=(k:Layer)=>!keys.has(k)||!plan.rows.some(r=>r.key===k);
 for(const k of ['topX','topY'] as const)if(off(k))input.rebar[k]={...input.rebar[k],enabled:false};
 if(off('loops'))input.rebar.side={...input.rebar.side,enabled:false};if(off('faces'))input.rebar.sideBars={...input.rebar.sideBars,enabled:false};
 const converted=(l:Layer)=>l!=='other'&&keys.has(l)&&plan.rows.some(r=>r.key===l);
 const keepBars=m.bars.flatMap((b):Bar[]=>{const ls=plan.markLayers?.[b.mark];if(!isIfcBar(b)||!ls)return [b];const keep=ls.map((l,i)=>converted(l)?-1:i).filter(i=>i>=0);
  if(keep.length===ls.length)return [b];if(!keep.length||!b.offsets)return [];
  // the bars left: offsets / turns of the kept copies, re-based on the first kept one
  const o0=b.offsets[keep[0]],t0=b.offsetTurns?.[keep[0]]||0;
  if(t0)return [];// a turned first copy cannot be re-based without moving the template: drop (shown in the weight check)
  return [{...b,count:keep.length,offsets:keep.map(i=>[b.offsets![i][0]-o0[0],b.offsets![i][1]-o0[1],b.offsets![i][2]-o0[2]] as Vec3),...(b.offsetTurns?{offsetTurns:keep.map(i=>b.offsetTurns![i])}:{}),points:b.points.map(p=>[p[0]+o0[0],p[1]+o0[1],p[2]+o0[2]] as Vec3)}];});
 // bottom layers are part of every footing input: an unticked one keeps its IFC bars and generates none (count 0 via Ø 0 is invalid → keep)
 const keepBottom=(['bottomX','bottomY'] as const).filter(off);
 const {shapeModel:_s,...rest}=m;
 const base:Member={...rest,bars:keepBars,deductions:m.deductions.filter(d=>!d.reason.startsWith('[IFC]'))};
 const applied=applyElementInput(base,input,{rounding:spec.rounding});
 let member:Member={...applied.member,ifcSource:{...m.ifcSource!,converted:true}};
 // layers the footing input always generates (bottom mesh, pedestal bars): an unticked row keeps its IFC bars instead
 const drop=[...keepBottom.map(k=>`gen-${k==='bottomX'?'bottom-x':'bottom-y'}`),...(plan.rows.some(r=>r.key==='colMain')&&off('colMain')?['gen-column-main']:[]),...(plan.rows.some(r=>r.key==='colTie')&&off('colTie')?['gen-column-tie']:[])];
 if(drop.length)member={...member,bars:member.bars.filter(b=>!drop.some(d=>b.id.startsWith(d)))};
 const problems=validateMember(member,spec);
 return {member,after:safeWeight(member,spec),problems,warnings:applied.warnings};
}
function safeWeight(m:Member,spec:Spec){try{return takeoff(m,spec).rebar;}catch{return 0;}}
