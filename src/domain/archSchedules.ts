import {blankMember,type Member,type Project} from './model';
import {finishKindLabels,finishKinds,finishesSchema,type Finish,type FinishKind,type OpeningInput,type FixtureInput,type RailingInput,type RoofInput,type RoomInput,type RoomOpening,type WallInput} from './archInputSchema';
import {applyArchInput,openingQuantities,roofQuantities,roomQuantities,wallQuantities} from './archInput';
import {locationTree,newLocationId,nextOrder,wbsCode,withLoc,type LocationTree,type Locations,type OccurrenceLoc} from './locations';
import {canonical} from './canonical';

// Architecture schedules: finish library rows (General Spec), room finish schedule and door / window schedule
// (Excel ⇄ members), and the wall / skirting deductions of rooms from the doors / windows placed in them.
const key=()=>crypto.randomUUID().replace(/-/g,'').slice(0,12);
const num=(t:string)=>{const v=Number(String(t).replace(/,/g,'').trim());return t.trim()&&Number.isFinite(v)?v:undefined;};

// ---------------------------------------------------------------- finish library
export type FinishRow={kind:string;code:string;name:string;item:string;unit:string;factor:string;source:string};
const kindWord=(t:string):FinishKind|undefined=>finishKinds.find(k=>k===t.trim().toLowerCase()||finishKindLabels[k]===t.trim());
/** Sheet rows → finishes: one row per BOQ item, rows of the same kind + code form one finish (name from the first). */
export function finishesFromRows(rows:FinishRow[]):{finishes:Finish[];problems:string[]}{
 const problems:string[]=[],by=new Map<string,Finish>();
 for(const r of rows){
  if(!r.code&&!r.kind)continue;const kind=kindWord(r.kind);
  if(!kind){problems.push(`${r.source}: ประเภท “${r.kind}” ไม่รู้จัก (${finishKinds.map(k=>finishKindLabels[k]).join(' / ')})`);continue;}
  if(!r.code){problems.push(`${r.source}: ไม่มีรหัส`);continue;}
  const k=`${kind}|${r.code.trim().toUpperCase()}`;let f=by.get(k);
  if(!f){f={id:key(),code:r.code.trim().slice(0,20),kind,name:(r.name||r.code).trim().slice(0,120),items:[]};by.set(k,f);}
  if(r.item){const factor=r.factor?num(r.factor):1;if(factor===undefined||factor<0){problems.push(`${r.source}: ตัวคูณ “${r.factor}” ไม่ใช่ตัวเลข`);continue;}
   if(f.items.length>=6){problems.push(`${r.source}: ${f.code} มีรายการได้ไม่เกิน 6`);continue;}
   f.items.push({id:key(),label:r.item.trim().slice(0,120),unit:(r.unit||(kind==='skirting'||kind==='railing'?'m':'m²')).trim().slice(0,12),factor});}
 }
 const finishes=[...by.values()],check=finishesSchema.safeParse(finishes);
 if(!check.success)problems.push(...check.error.issues.slice(0,5).map(i=>`${i.path.join('.')}: ${i.message}`));
 return {finishes:check.success?finishes:[],problems};
}
export function rowsFromFinishes(list:readonly Finish[]):FinishRow[]{
 return list.flatMap(f=>(f.items.length?f.items:[undefined]).map(it=>({kind:finishKindLabels[f.kind],code:f.code,name:f.name,item:it?.label||'',unit:it?.unit||'',factor:it?String(it.factor):'',source:''})));
}
/** Typical Thai finishes to start a library from (edit to the project's finish schedule). */
export function sampleFinishes():Finish[]{
 const f=(kind:FinishKind,code:string,name:string,items:[string,string,number][]):Finish=>({id:key(),kind,code,name,items:items.map(([label,unit,factor])=>({id:key(),label,unit,factor}))});
 return [
  f('floor','F1','พื้นคอนกรีตขัดมัน',[['พื้นขัดมันเรียบ','m²',1]]),
  f('floor','F2','กระเบื้องแกรนิตโต้ 60×60 cm',[['ปูนทรายปรับระดับ','m²',1],['ปูกระเบื้องแกรนิตโต้ 60×60 cm','m²',1]]),
  f('floor','F3','กระเบื้องเซรามิกกันลื่น 30×30 cm',[['ปูนทรายปรับระดับ','m²',1],['ปูกระเบื้องเซรามิกกันลื่น 30×30 cm','m²',1],['กันซึมพื้นห้องน้ำ','m²',1]]),
  f('skirting','S1','บัวกระเบื้องสูง 10 cm',[['บัวกระเบื้องสูง 10 cm','m',1]]),
  f('wall','W1','ฉาบปูนเรียบ ทาสีอะครีลิก',[['ฉาบปูนเรียบ','m²',1],['ทาสีอะครีลิก (รองพื้น + ทับหน้า 2 เที่ยว)','m²',1]]),
  f('wall','W2','ฉาบปูน บุกระเบื้องเซรามิก 30×60 cm',[['ฉาบปูนรองพื้น','m²',1],['บุกระเบื้องเซรามิก 30×60 cm','m²',1]]),
  f('ceiling','C1','ฝ้ายิปซัมบอร์ด 9 mm ฉาบเรียบ ทาสี',[['ฝ้ายิปซัมบอร์ด 9 mm โครงเคร่าเหล็กชุบสังกะสี','m²',1],['ทาสีฝ้า','m²',1]]),
  f('ceiling','C2','ฝ้ายิปซัมบอร์ดกันชื้น 9 mm',[['ฝ้ายิปซัมบอร์ดกันชื้น 9 mm โครงเคร่าเหล็กชุบสังกะสี','m²',1],['ทาสีฝ้า','m²',1]]),
  f('masonry','WT1','ผนังก่ออิฐมอญครึ่งแผ่น ฉาบปูน 2 ด้าน',[['ก่ออิฐมอญครึ่งแผ่น','m²',1],['ฉาบปูนเรียบ','m²',2]]),
  f('masonry','WT2','ผนังก่อคอนกรีตมวลเบา 7.5 cm ฉาบ 2 ด้าน',[['ก่อคอนกรีตมวลเบา หนา 7.5 cm','m²',1],['ฉาบปูนสำหรับมวลเบา','m²',2]]),
  f('roof','R1','หลังคากระเบื้องคอนกรีต',[['มุงกระเบื้องคอนกรีต','m²',1],['ฉนวนกันความร้อนใต้หลังคา','m²',1]]),
  f('roof','R2','หลังคาเมทัลชีท 0.47 mm',[['มุงแผ่นเมทัลชีท หนา 0.47 mm','m²',1]]),
  f('waterproof','WP1','กันซึมชนิดทา (Cementitious) 2 ชั้น',[['กันซึมชนิดทา Cementitious 2 ชั้น','m²',1]]),
  f('railing','RL1','ราวกันตกสแตนเลส สูง 1.10 m',[['ราวกันตกสแตนเลส สูง 1.10 m','m',1]]),
  f('railing','RL2','ราวจับบันไดเหล็กกล่อง ทาสี',[['ราวจับบันไดเหล็กกล่อง','m',1],['ทาสีราวเหล็ก','m',1]]),
 ];
}

// ---------------------------------------------------------------- WBS paths "A-L2-201" / "A-L2"
/** Building-level[-room] by codes. */
export function resolvePath(tree:LocationTree,path:string):OccurrenceLoc|undefined{
 const [b,lv,room,...rest]=path.trim().toUpperCase().split('-');if(!b||!lv||rest.length)return;
 const root=tree.roots.find(r=>r.code.toUpperCase()===b),level=root&&tree.children(root.id,'level').find(n=>n.code.toUpperCase()===lv);if(!root||!level)return;
 if(!room)return {building:root.id,level:level.id};
 const r=tree.children(level.id,'room').find(n=>n.code.toUpperCase()===room);return r?{building:root.id,level:level.id,room:r.id}:undefined;
}
const occurrence=(tree:LocationTree,loc:OccurrenceLoc,quantity:number)=>withLoc(tree,{id:crypto.randomUUID(),zone:'',floor:'',grid:'',quantity},loc);

// ---------------------------------------------------------------- room finish schedule
export type RoomRow={building:string;level:string;room:string;name:string;width:string;length:string;area:string;perimeter:string;height:string;floor:string;skirting:string;wall:string;ceiling:string;dado:string;dadoHeight:string;waterproof?:string;upturn?:string;source:string};
export const roomHead=['อาคาร','ชั้น','ห้อง (รหัส)','ชื่อห้อง','กว้าง (m)','ยาว (m)','พื้นที่ (m²)','เส้นรอบรูป (m)','สูงฝ้า (m)','พื้น','บัว','ผนัง','ฝ้า','ผนังส่วนล่าง','สูงผนังส่วนล่าง (m)','กันซึม (WP)','ยกขอบกันซึม (m)'];
export type ImportAction<T>={item:T;action:'add'|'update'|'same';code:string};
export type RoomImportPlan={locations:Locations;roomsAdded:number;members:ImportAction<Member>[];problems:string[]};
/** Rows → WBS rooms (added under existing levels) + Room members (code = WBS path, e.g. A-L2-201). */
export function planRoomImport(project:Project,members:Member[],rows:RoomRow[]):RoomImportPlan{
 const problems:string[]=[],out:ImportAction<Member>[]=[];let locations:Locations=structuredClone(project.locations||{version:1,nodes:[]}),added=0;
 for(const r of rows){
  if(!r.building&&!r.room)continue;
  let tree=locationTree(locations);const root=tree.roots.find(n=>n.code.toUpperCase()===r.building.trim().toUpperCase()),level=root&&tree.children(root.id,'level').find(n=>n.code.toUpperCase()===r.level.trim().toUpperCase());
  if(!root||!level){problems.push(`${r.source}: ไม่พบ${root?`ชั้น ${r.level}`:`อาคาร ${r.building}`} ใน WBS (สร้างอาคาร / ชั้นก่อน)`);continue;}
  const rc=r.room.trim().toUpperCase().replace(/\s+/g,'');if(!/^[A-Z0-9+._-]{1,20}$/.test(rc)){problems.push(`${r.source}: รหัสห้อง “${r.room}” ใช้ A–Z 0–9 + . _ - ไม่เกิน 20 ตัว`);continue;}
  let room=tree.children(level.id,'room').find(n=>n.code.toUpperCase()===rc);
  if(!room){room={id:newLocationId(),kind:'room',parentId:level.id,code:rc,name:(r.name||`ห้อง ${rc}`).slice(0,120),order:nextOrder(locations,level.id,'room')};locations={...locations,nodes:[...locations.nodes,room]};added++;tree=locationTree(locations);}
  const m=(v:string)=>{const n=num(v);return n===undefined?0:Math.round(n*1000);},code=`${root.code}-${level.code}-${room.code}`;
  const old=members.find(x=>x.category==='Room'&&x.code.toUpperCase()===code.toUpperCase()),oldIn=old?.archInput?.kind==='room'?old.archInput:undefined;
  const input:RoomInput={kind:'room',name:(r.name||room.name).slice(0,120),width:m(r.width),length:m(r.length),area:num(r.area)??0,perimeter:num(r.perimeter)??0,height:m(r.height),floor:r.floor.trim(),skirting:r.skirting.trim(),wall:r.wall.trim(),ceiling:r.ceiling.trim(),
   ...(r.dado.trim()&&m(r.dadoHeight)>0?{dado:{finish:r.dado.trim(),height:m(r.dadoHeight)}}:{}),openings:oldIn?.openings||[],
   ...(r.waterproof?.trim()?{waterproof:{finish:r.waterproof.trim(),upturn:m(r.upturn||'')}}:{})};
  const base=old||{...blankMember('Room',code),occurrences:[occurrence(tree,{building:root.id,level:level.id,room:room.id},1)]};
  try{const next=applyArchInput({...base,description:input.name},input,project.spec);out.push({item:next,code,action:!old?'add':canonical(old.archInput)===canonical(next.archInput)&&old.description===next.description?'same':'update'});}
  catch(e:any){problems.push(`${r.source}: ${e?.message||e}`);}
 }
 return {locations,roomsAdded:added,members:out,problems};
}

// ---------------------------------------------------------------- door / window schedule
export type OpeningRow={code:string;type:string;description:string;width:string;height:string;locations:string;quantity:string;source:string};
export const openingHead=['แบบ (รหัส)','ประเภท (ประตู / หน้าต่าง)','รายละเอียด','กว้าง (mm)','สูง (mm)','ตำแหน่ง (WBS × จำนวน คั่นด้วย ;)','จำนวนรวม (ถ้าไม่ระบุตำแหน่ง)'];
/** "A-L2-201×2; A-L2-202; A-L3 x4" → occurrences (WBS room or level). */
export function parsePlacements(tree:LocationTree,text:string):{loc:OccurrenceLoc;quantity:number;path:string}[]|string{
 const out:{loc:OccurrenceLoc;quantity:number;path:string}[]=[];
 for(const part of text.split(/[;\n]+/).map(s=>s.trim()).filter(Boolean)){
  const m=part.match(/^(.+?)\s*(?:[×xX*]\s*(\d+))?$/),path=(m?.[1]||'').trim(),n=m?.[2]?Number(m[2]):1,loc=resolvePath(tree,path);
  if(!loc)return `ไม่พบตำแหน่ง “${path}” ใน WBS (อาคาร-ชั้น หรือ อาคาร-ชั้น-ห้อง)`;if(!(n>=1&&n<=100000))return `จำนวน “${part}” ไม่ถูกต้อง`;
  const same=out.find(o=>o.path===path);if(same)same.quantity+=n;else out.push({loc,quantity:n,path});
 }
 return out;
}
export function planOpeningImport(project:Project,members:Member[],rows:OpeningRow[]):{members:ImportAction<Member>[];problems:string[]}{
 const tree=locationTree(project.locations),problems:string[]=[],out:ImportAction<Member>[]=[];
 for(const r of rows){
  if(!r.code)continue;const code=r.code.trim().slice(0,50),w=num(r.width),h=num(r.height),t=r.type.trim();
  const type=/^(window|w|หน้าต่าง|ช่องแสง)/i.test(t)?'window':/^(door|d|ประตู)/i.test(t)||!t?(/^W/i.test(code)&&!t?'window':'door'):undefined;
  if(!type){problems.push(`${r.source}: ประเภท “${r.type}” ใช้ ประตู / หน้าต่าง`);continue;}
  if(!(w&&w>0&&h&&h>0)){problems.push(`${r.source}: ${code} กรอกกว้าง / สูง (mm)`);continue;}
  const placed=r.locations.trim()?parsePlacements(tree,r.locations):[];if(typeof placed==='string'){problems.push(`${r.source}: ${placed}`);continue;}
  const old=members.find(x=>x.category==='Opening'&&x.code.toUpperCase()===code.toUpperCase()),oldIn=old?.archInput?.kind==='opening'?old.archInput:undefined;
  const input:OpeningInput={kind:'opening',type,width:w,height:h,description:r.description.trim().slice(0,200),items:oldIn?.items||[]};
  const qty=num(r.quantity),occurrences=placed.length?placed.map(p=>occurrence(tree,p.loc,p.quantity)):old?.occurrences||[{id:crypto.randomUUID(),zone:'',floor:'',grid:'',quantity:Math.max(1,Math.round(qty||1))}];
  try{const next=applyArchInput({...(old||blankMember('Opening',code)),description:input.description,occurrences},input,project.spec);
   const same=!!old&&canonical([old.archInput,old.occurrences.map(o=>[o.loc||null,o.quantity])])===canonical([next.archInput,next.occurrences.map(o=>[o.loc||null,o.quantity])]);
   out.push({item:next,code,action:!old?'add':same?'same':'update'});}
  catch(e:any){problems.push(`${r.source}: ${e?.message||e}`);}
 }
 return {members:out,problems};
}

// ---------------------------------------------------------------- rooms ← doors / windows placed in them
/** Openings of each room node from the Opening members placed there (occurrence loc.room × quantity). */
export function openingsByRoom(members:Member[]):Map<string,RoomOpening[]>{
 const by=new Map<string,RoomOpening[]>();
 for(const m of members){const i=m.archInput;if(m.category!=='Opening'||i?.kind!=='opening')continue;
  for(const o of m.occurrences){const r=o.loc?.room;if(!r)continue;const list=by.get(r)||[],same=list.find(x=>x.code===m.code);
   if(same)same.count+=o.quantity;else list.push({code:m.code,door:i.type==='door',width:i.width,height:i.height,count:o.quantity});by.set(r,list);}}
 return by;
}
/** Room members whose openings differ from the doors / windows placed in their room (first occurrence's room). */
export function syncRoomOpenings(project:Project,members:Member[]):{updates:Member[];notes:string[]}{
 const by=openingsByRoom(members),updates:Member[]=[],notes:string[]=[],tree=locationTree(project.locations);
 for(const m of members){const i=m.archInput;if(m.category!=='Room'||i?.kind!=='room')continue;
  const rooms=[...new Set(m.occurrences.map(o=>o.loc?.room).filter((r):r is string=>!!r))];if(!rooms.length)continue;
  const sets=rooms.map(r=>canonical((by.get(r)||[]).slice().sort((a,b)=>a.code.localeCompare(b.code)))),openings=(by.get(rooms[0])||[]).slice().sort((a,b)=>a.code.localeCompare(b.code));
  if(new Set(sets).size>1)notes.push(`${m.code}: ห้องที่ใช้แบบนี้มีประตู / หน้าต่างไม่เท่ากัน · ใช้ของ ${wbsCode(tree,{...m.occurrences.find(o=>o.loc?.room===rooms[0])!.loc!})}`);
  if(canonical(i.openings.slice().sort((a,b)=>a.code.localeCompare(b.code)))===canonical(openings))continue;
  try{updates.push(applyArchInput(m,{...i,openings},project.spec));}catch(e:any){notes.push(`${m.code}: ${e?.message||e}`);}
 }
 return {updates,notes};
}
/** Schedule lines for display / export. */
export function roomScheduleRows(members:Member[],tree:LocationTree){
 return members.filter(m=>m.category==='Room'&&m.archInput?.kind==='room').map(m=>{const i=m.archInput as RoomInput,q=roomQuantities(i),count=m.occurrences.reduce((n,o)=>n+o.quantity,0);
  return {m,i,q,count,where:m.occurrences.map(o=>o.loc?wbsCode(tree,o.loc):[o.building,o.floor,o.grid].filter(Boolean).join('-')).filter(Boolean).join(', ')};});
}
export function openingScheduleRows(members:Member[],tree:LocationTree){
 return members.filter(m=>m.category==='Opening'&&m.archInput?.kind==='opening').map(m=>{const i=m.archInput as OpeningInput,count=m.occurrences.reduce((n,o)=>n+o.quantity,0);
  return {m,i,q:openingQuantities(i),count,where:m.occurrences.map(o=>`${o.loc?wbsCode(tree,o.loc):[o.building,o.floor,o.grid].filter(Boolean).join('-')||'—'}${o.quantity>1?`×${o.quantity}`:''}`).join('; ')};});
}

// ---------------------------------------------------------------- masonry walls / roofs
export type WallRow={building:string;level:string;code:string;type:string;length:string;height:string;thickness:string;openings:string;stiffenerSpacing:string;tieBeams:string;quantity:string;source:string};
export const wallHead=['อาคาร','ชั้น','รหัสผนัง (สมาชิก)','ชนิดผนัง (WT)','ยาว (m)','สูง (m)','หนา (mm)','ช่องเปิด (แบบ × จำนวน คั่นด้วย ;)','เสาเอ็นห่าง (m)','คานเอ็น (แนว)','จำนวนแนวที่เหมือนกัน'];
/** Rows → MasonryWall members (code from the sheet, place = building-level); openings by door / window type codes. */
export function planWallImport(project:Project,members:Member[],rows:WallRow[]):{members:ImportAction<Member>[];problems:string[]}{
 const tree=locationTree(project.locations),problems:string[]=[],out:ImportAction<Member>[]=[];
 const types=new Map(members.filter(m=>m.category==='Opening'&&m.archInput?.kind==='opening').map(m=>[m.code.toUpperCase(),m.archInput as OpeningInput]));
 for(const r of rows){
  if(!r.code)continue;const code=r.code.trim().slice(0,50),L=num(r.length),H=num(r.height);
  if(!(L&&L>0&&H&&H>0)){problems.push(`${r.source}: ${code} กรอกยาว / สูง (m)`);continue;}
  const loc=r.building.trim()&&r.level.trim()?resolvePath(tree,`${r.building.trim()}-${r.level.trim()}`):undefined;
  if((r.building.trim()||r.level.trim())&&!loc){problems.push(`${r.source}: ไม่พบ ${r.building}-${r.level} ใน WBS`);continue;}
  const openings:RoomOpening[]=[];let bad='';
  for(const part of r.openings.split(/[;\n]+/).map(s=>s.trim()).filter(Boolean)){const m=part.match(/^(.+?)\s*(?:[×xX*]\s*(\d+))?$/),c=(m?.[1]||'').trim(),t=types.get(c.toUpperCase());
   if(!t){bad=`ไม่พบแบบประตู / หน้าต่าง ${c} (นำเข้าแผ่นงาน Openings ก่อน)`;break;}openings.push({code:c,door:t.type==='door',width:t.width,height:t.height,count:m?.[2]?Number(m[2]):1});}
  if(bad){problems.push(`${r.source}: ${bad}`);continue;}
  const old=members.find(x=>x.category==='MasonryWall'&&x.code.toUpperCase()===code.toUpperCase()),oldIn=old?.archInput?.kind==='wall'?old.archInput:undefined;
  const sp=num(r.stiffenerSpacing),tb=num(r.tieBeams),qty=num(r.quantity);
  const input:WallInput={kind:'wall',length:Math.round(L*1000),height:Math.round(H*1000),thickness:num(r.thickness)??oldIn?.thickness??100,type:r.type.trim(),openings,
   stiffenerSpacing:sp===undefined?oldIn?.stiffenerSpacing??2500:Math.round(sp*1000),stiffenersAtOpenings:oldIn?.stiffenersAtOpenings??true,lintelBearing:oldIn?.lintelBearing??200,tieBeams:tb===undefined?oldIn?.tieBeams??0:Math.max(0,Math.min(10,Math.trunc(tb)))};
  const occurrences=loc?[occurrence(tree,loc,Math.max(1,Math.round(qty||1)))]:old?.occurrences||[{id:crypto.randomUUID(),zone:'',floor:'',grid:'',quantity:Math.max(1,Math.round(qty||1))}];
  try{const next=applyArchInput({...(old||blankMember('MasonryWall',code)),occurrences},input,project.spec);
   const same=!!old&&canonical([old.archInput,old.occurrences.map(o=>[o.loc||null,o.quantity])])===canonical([next.archInput,next.occurrences.map(o=>[o.loc||null,o.quantity])]);
   out.push({item:next,code,action:!old?'add':same?'same':'update'});}
  catch(e:any){problems.push(`${r.source}: ${e?.message||e}`);}
 }
 return {members:out,problems};
}
const placeText=(tree:LocationTree,m:Member)=>m.occurrences.map(o=>o.loc?wbsCode(tree,o.loc):[o.building,o.floor,o.grid].filter(Boolean).join('-')).filter(Boolean).join(', ');
export function wallScheduleRows(members:Member[],tree:LocationTree){
 return members.filter(m=>m.category==='MasonryWall'&&m.archInput?.kind==='wall').map(m=>{const i=m.archInput as WallInput;return {m,i,q:wallQuantities(i),count:m.occurrences.reduce((n,o)=>n+o.quantity,0),where:placeText(tree,m)};});
}
export function roofScheduleRows(members:Member[],tree:LocationTree){
 return members.filter(m=>m.category==='Roof'&&m.archInput?.kind==='roof').map(m=>{const i=m.archInput as RoofInput;return {m,i,q:roofQuantities(i),count:m.occurrences.reduce((n,o)=>n+o.quantity,0),where:placeText(tree,m)};});
}

// ---------------------------------------------------------------- railings / fixtures
export type FixtureRow={code:string;description:string;unit:string;locations:string;quantity:string;source:string};
export const fixtureHead=['รหัส','รายละเอียด','หน่วย','ตำแหน่ง (WBS × จำนวน คั่นด้วย ;)','จำนวนรวม (ถ้าไม่ระบุตำแหน่ง)'];
export function planFixtureImport(project:Project,members:Member[],rows:FixtureRow[]):{members:ImportAction<Member>[];problems:string[]}{
 const tree=locationTree(project.locations),problems:string[]=[],out:ImportAction<Member>[]=[];
 for(const r of rows){
  if(!r.code)continue;const code=r.code.trim().slice(0,50),placed=r.locations.trim()?parsePlacements(tree,r.locations):[];
  if(typeof placed==='string'){problems.push(`${r.source}: ${placed}`);continue;}
  const old=members.find(x=>x.category==='Fixture'&&x.code.toUpperCase()===code.toUpperCase()),oldIn=old?.archInput?.kind==='fixture'?old.archInput:undefined;
  const input:FixtureInput={kind:'fixture',description:r.description.trim().slice(0,200),unit:(r.unit.trim()||oldIn?.unit||'ชุด').slice(0,12),items:oldIn?.items||[]};
  const qty=num(r.quantity),occurrences=placed.length?placed.map(p=>occurrence(tree,p.loc,p.quantity)):old?.occurrences||[{id:crypto.randomUUID(),zone:'',floor:'',grid:'',quantity:Math.max(1,Math.round(qty||1))}];
  try{const next=applyArchInput({...(old||blankMember('Fixture',code)),description:input.description,occurrences},input,project.spec);
   const same=!!old&&canonical([old.archInput,old.occurrences.map(o=>[o.loc||null,o.quantity])])===canonical([next.archInput,next.occurrences.map(o=>[o.loc||null,o.quantity])]);
   out.push({item:next,code,action:!old?'add':same?'same':'update'});}
  catch(e:any){problems.push(`${r.source}: ${e?.message||e}`);}
 }
 return {members:out,problems};
}
export function railingScheduleRows(members:Member[],tree:LocationTree){
 return members.filter(m=>m.category==='Railing'&&m.archInput?.kind==='railing').map(m=>({m,i:m.archInput as RailingInput,count:m.occurrences.reduce((n,o)=>n+o.quantity,0),where:placeText(tree,m)}));
}
export function fixtureScheduleRows(members:Member[],tree:LocationTree){
 return members.filter(m=>m.category==='Fixture'&&m.archInput?.kind==='fixture').map(m=>({m,i:m.archInput as FixtureInput,count:m.occurrences.reduce((n,o)=>n+o.quantity,0),where:m.occurrences.map(o=>`${o.loc?wbsCode(tree,o.loc):[o.building,o.floor,o.grid].filter(Boolean).join('-')||'—'}${o.quantity>1?`×${o.quantity}`:''}`).join('; ')}));
}
