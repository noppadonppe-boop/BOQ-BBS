import {useMemo,useState} from 'react';
import {Download,FileSpreadsheet,Scissors} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {command} from '../data/firebase';
import {finishKindLabels,finishKinds,type FinishKind} from '../domain/archInputSchema';
import {findFinish} from '../domain/archInput';
import {locationTree} from '../domain/locations';
import {openingScheduleRows,planOpeningImport,planRoomImport,planWallImport,roofScheduleRows,roomScheduleRows,syncRoomOpenings,wallScheduleRows,type ImportAction,type OpeningRow,type RoomRow,type WallRow} from '../domain/archSchedules';
import {number} from './EditorControls';

type Run=(f:()=>Promise<unknown>,message?:string)=>void;
type Incoming={source:string;locations:Project['locations'];roomsAdded:number;actions:(ImportAction<Member>&{kind:'room'|'opening'|'wall'})[];problems:string[]};
const kindLabel={room:'ห้อง',opening:'ประตู-หน้าต่าง',wall:'ผนังก่อ'} as const;
const tag={add:['เพิ่ม','success'],update:['อัปเดต','warning'],same:['คงเดิม','']} as const;

/** Architecture page: room finish schedule, door / window schedule, totals per finish, Excel in / out and the wall /
 * skirting deductions of rooms from the doors / windows placed in them. */
export function ArchSchedules({project,members,canEdit,busy,run}:{project:Project;members:Member[];canEdit:boolean;busy:boolean;run:Run}){
 const tree=useMemo(()=>locationTree(project.locations),[project.locations]),rooms=useMemo(()=>roomScheduleRows(members,tree),[members,tree]),openings=useMemo(()=>openingScheduleRows(members,tree),[members,tree]),walls=useMemo(()=>wallScheduleRows(members,tree),[members,tree]),roofs=useMemo(()=>roofScheduleRows(members,tree),[members,tree]);
 const sync=useMemo(()=>syncRoomOpenings(project,members),[project,members]),[incoming,setIncoming]=useState<Incoming|null>(null),[reading,setReading]=useState('');
 const ro=!canEdit||busy;
 // totals per finish code: room quantity × number of rooms
 const totals=useMemo(()=>{const t=new Map<string,{kind:FinishKind;code:string;qty:number;unit:string}>();
  for(const r of rooms){const add=(kind:FinishKind,code:string,qty:number)=>{if(!code||qty<=0)return;const k=`${kind}|${code}`,v=t.get(k)||{kind,code,qty:0,unit:kind==='skirting'?'m':'m²'};v.qty+=qty*r.count;t.set(k,v);};
   add('floor',r.i.floor,r.q.floor);add('skirting',r.i.skirting,r.q.skirting);add('wall',r.i.wall,r.q.wall);if(r.i.dado)add('wall',r.i.dado.finish,r.q.dado);add('ceiling',r.i.ceiling,r.q.ceiling);}
  for(const w of walls)if(w.i.type){const k=`masonry|${w.i.type}`,v=t.get(k)||{kind:'masonry' as FinishKind,code:w.i.type,qty:0,unit:'m²'};v.qty+=w.q.net*w.count;t.set(k,v);}
  for(const r of roofs)if(r.i.covering){const k=`roof|${r.i.covering}`,v=t.get(k)||{kind:'roof' as FinishKind,code:r.i.covering,qty:0,unit:'m²'};v.qty+=r.q.slope*r.count;t.set(k,v);}
  return [...t.values()].sort((a,b)=>finishKinds.indexOf(a.kind)-finishKinds.indexOf(b.kind)||a.code.localeCompare(b.code,'en',{numeric:true}));},[rooms,walls,roofs]);
 const exportRows=():{rooms:RoomRow[];openings:OpeningRow[];walls:WallRow[]}=>({
  walls:walls.map(({m,i})=>{const l=m.occurrences.find(o=>o.loc?.level)?.loc,code=(id?:string)=>id?tree.byId.get(id)?.code||'':'';
   return {building:code(l?.building),level:code(l?.level),code:m.code,type:i.type,length:String(i.length/1000),height:String(i.height/1000),thickness:String(i.thickness),openings:i.openings.map(o=>`${o.code}${o.count>1?`×${o.count}`:''}`).join('; '),stiffenerSpacing:String(i.stiffenerSpacing/1000),tieBeams:String(i.tieBeams),quantity:l?'':String(m.occurrences.reduce((n,o)=>n+o.quantity,0)),source:''};}),
  rooms:rooms.map(({m,i})=>{const l=m.occurrences.find(o=>o.loc?.room)?.loc,code=(id?:string)=>id?tree.byId.get(id)?.code||'':'';const s=(v:number)=>v?String(v/1000):'';
   return {building:code(l?.building),level:code(l?.level),room:code(l?.room)||m.code,name:i.name,width:s(i.width),length:s(i.length),area:i.area?String(i.area):'',perimeter:i.perimeter?String(i.perimeter):'',height:s(i.height),floor:i.floor,skirting:i.skirting,wall:i.wall,ceiling:i.ceiling,dado:i.dado?.finish||'',dadoHeight:i.dado?s(i.dado.height):'',source:''};}),
  openings:openings.map(({m,i})=>({code:m.code,type:i.type==='door'?'ประตู':'หน้าต่าง',description:i.description,width:String(i.width),height:String(i.height),locations:m.occurrences.filter(o=>o.loc?.level).map(o=>`${[o.loc!.building,o.loc!.level,o.loc!.room].map(id=>id&&tree.byId.get(id)?.code).filter(Boolean).join('-')}${o.quantity>1?`×${o.quantity}`:''}`).join('; '),quantity:m.occurrences.some(o=>o.loc?.level)?'':String(m.occurrences.reduce((n,o)=>n+o.quantity,0)),source:''}))});
 const readFile=async(file?:File)=>{if(!file)return;setReading(`กำลังอ่าน ${file.name}…`);try{
  const {readArchSchedules}=await import('../data/archExcel'),r=await readArchSchedules(file),rp=planRoomImport(project,members,r.rooms);
  // openings resolve their places against the tree with the rooms this file adds
  const op=planOpeningImport({...project,locations:rp.locations},[...members.filter(m=>!rp.members.some(a=>a.item.id===m.id)),...rp.members.map(a=>a.item)],r.openings);
  // walls take their openings from the door / window types (this file's first)
  const wp=planWallImport({...project,locations:rp.locations},[...members.filter(m=>!op.members.some(a=>a.item.id===m.id)),...op.members.map(a=>a.item)],r.walls);
  setIncoming({source:file.name,locations:rp.locations,roomsAdded:rp.roomsAdded,actions:[...rp.members.map(a=>({...a,kind:'room' as const})),...op.members.map(a=>({...a,kind:'opening' as const})),...wp.members.map(a=>({...a,kind:'wall' as const}))],problems:[...rp.problems,...op.problems,...wp.problems]});setReading('');}
  catch(e:any){setReading(`อ่าน ${file.name} ไม่ได้: ${e?.message||e}`);}};
 const apply=(inc:Incoming)=>run(async()=>{
  if(inc.roomsAdded)await command('saveLocations',project.id,{locations:inc.locations,version:project.version});
  for(const a of inc.actions)if(a.action!=='same')await command('saveMember',project.id,{member:a.item});
  setIncoming(null);},'นำเข้าตารางงานสถาปัตย์แล้ว');
 const applySync=()=>run(async()=>{for(const m of sync.updates)await command('saveMember',project.id,{member:m});},`หักช่องเปิดในห้องแล้ว ${sync.updates.length} ห้อง`);
 const name=(kind:FinishKind,code:string)=>findFinish(project.spec.finishes,kind,code)?.name||'— ไม่มีในคลังวัสดุผิว —';
 return <section className="panel padded arch-schedules">
  <div className="section-heading"><div><h3>ตารางงานสถาปัตย์</h3><p className="muted">ห้อง = ตำแหน่งใน WBS (อาคาร → ชั้น → ห้อง) · วัสดุผิวจากคลังวัสดุผิวใน General Spec · ปริมาณเป็นรายการ BOQ ของแต่ละห้อง / แบบประตู-หน้าต่าง</p></div>
   <div className="actions"><button onClick={()=>{const r=exportRows();void import('../data/archExcel').then(x=>x.exportArchSchedules(r.rooms,r.openings,r.walls,project.code));}}><Download size={15}/>{rooms.length||openings.length||walls.length?'ส่งออก Excel':'แบบฟอร์ม Excel'}</button>
    <label className={`button${ro?' disabled':''}`} title="แผ่นงาน Rooms + Openings + Walls"><FileSpreadsheet size={15}/>นำเข้า Excel<input hidden type="file" accept=".xlsx" disabled={ro} onChange={e=>{void readFile(e.target.files?.[0]);e.target.value='';}}/></label>
    <button disabled={ro||!sync.updates.length} title="ประตู / หน้าต่างที่วางตำแหน่งในห้อง (WBS) → หักผนังและบัวของห้อง" onClick={applySync}><Scissors size={15}/>หักช่องเปิดจากตารางประตู-หน้าต่าง{sync.updates.length?` (${sync.updates.length} ห้อง)`:''}</button></div></div>
  {reading&&<p role="status" className={`notice${reading.startsWith('อ่าน')?' danger':''}`}>{reading}</p>}
  {sync.notes.length>0&&<p className="notice warning">{sync.notes.slice(0,4).join(' · ')}</p>}
  {incoming&&<div className="arch-import"><div className="section-heading"><div><small className="eyebrow">นำเข้า</small><h3>{incoming.source}</h3></div><button onClick={()=>setIncoming(null)}>ปิด</button></div>
   <p className="notice">ห้องใหม่ใน WBS {incoming.roomsAdded} · {(['add','update','same'] as const).map(k=>`${tag[k][0]} ${incoming.actions.filter(a=>a.action===k).length}`).join(' · ')}</p>
   {incoming.problems.length>0&&<div className="notice warning"><b>ข้ามบางแถว:</b><ul>{incoming.problems.slice(0,12).map(p=><li key={p}>{p}</li>)}</ul></div>}
   <div className="table-scroll"><table><thead><tr><th>ผล</th><th>ประเภท</th><th>รหัส</th><th>รายละเอียด</th></tr></thead><tbody>{incoming.actions.map((a,i)=><tr key={i}><td><span className={`badge ${tag[a.action][1]}`}>{tag[a.action][0]}</span></td><td>{kindLabel[a.kind]}</td><td><code>{a.code}</code></td><td>{a.item.description}</td></tr>)}</tbody></table></div>
   <footer className="actions"><button className="primary" disabled={ro||!incoming.actions.some(a=>a.action!=='same')&&!incoming.roomsAdded} onClick={()=>apply(incoming)}>บันทึก {incoming.actions.filter(a=>a.action!=='same').length} สมาชิก{incoming.roomsAdded?` + ห้องใน WBS ${incoming.roomsAdded}`:''}</button><small className="muted">หลังนำเข้า กด “หักช่องเปิดจากตารางประตู-หน้าต่าง” เพื่อหักผนังของห้อง</small></footer></div>}
  <h4>ตารางงานผิวห้อง ({rooms.length})</h4>
  <div className="table-scroll"><table className="arch-table"><thead><tr><th>ห้อง</th><th>ชื่อ</th><th className="num">พื้นที่ m²</th><th className="num">รอบรูป m</th><th className="num">สูงฝ้า m</th><th>พื้น</th><th>บัว</th><th>ผนัง</th><th>ฝ้า</th><th className="num">ผนัง m²</th><th className="num">ช่องเปิด</th><th className="num">จำนวน</th></tr></thead><tbody>
   {rooms.map(r=><tr key={r.m.id}><td><code>{r.where||r.m.code}</code></td><td>{r.i.name}</td><td className="num">{number(r.q.floor,2)}</td><td className="num">{number(r.q.perimeter,2)}</td><td className="num">{number(r.i.height/1000,2)}</td><td>{r.i.floor}</td><td>{r.i.skirting}</td><td>{r.i.wall}{r.i.dado?` / ${r.i.dado.finish} ≤ ${number(r.i.dado.height/1000,2)}`:''}</td><td>{r.i.ceiling}</td><td className="num">{number(r.q.wall+r.q.dado,2)}</td><td className="num">{r.i.openings.reduce((n,o)=>n+o.count,0)}</td><td className="num">{r.count}</td></tr>)}
   {!rooms.length&&<tr><td colSpan={12} className="muted">ยังไม่มีห้อง · เพิ่มที่เมนู “ห้อง / งานผิว” หรือนำเข้า Excel</td></tr>}</tbody></table></div>
  {totals.length>0&&<><h4>สรุปตามวัสดุผิว</h4><div className="table-scroll"><table className="arch-table"><thead><tr><th>ประเภท</th><th>รหัส</th><th>วัสดุผิว</th><th className="num">ปริมาณ</th><th>หน่วย</th></tr></thead><tbody>{totals.map(t=><tr key={`${t.kind}|${t.code}`}><td>{finishKindLabels[t.kind]}</td><td>{t.code}</td><td>{name(t.kind,t.code)}</td><td className="num">{number(t.qty,2)}</td><td>{t.unit}</td></tr>)}</tbody></table></div></>}
  <h4>ตารางประตู-หน้าต่าง ({openings.length})</h4>
  <div className="table-scroll"><table className="arch-table"><thead><tr><th>แบบ</th><th>ประเภท</th><th>รายละเอียด</th><th>ขนาด (mm)</th><th className="num">จำนวน</th><th>ตำแหน่ง</th></tr></thead><tbody>
   {openings.map(o=><tr key={o.m.id}><td><b>{o.m.code}</b></td><td>{o.i.type==='door'?'ประตู':'หน้าต่าง'}</td><td>{o.i.description}</td><td>{o.i.width}×{o.i.height}</td><td className="num">{o.count}</td><td><small>{o.where}</small></td></tr>)}
   {!openings.length&&<tr><td colSpan={6} className="muted">ยังไม่มีแบบประตู-หน้าต่าง · เพิ่มที่เมนู “ประตู-หน้าต่าง” หรือนำเข้า Excel</td></tr>}</tbody></table></div>
  <h4>ผนังก่อ ({walls.length})</h4>
  <div className="table-scroll"><table className="arch-table"><thead><tr><th>ผนัง</th><th>ตำแหน่ง</th><th>ชนิด</th><th className="num">ยาว m</th><th className="num">สูง m</th><th className="num">ผนังสุทธิ m²</th><th className="num">เสาเอ็น m</th><th className="num">ทับหลัง m</th><th className="num">คานเอ็น m</th><th className="num">จำนวน</th></tr></thead><tbody>
   {walls.map(w=><tr key={w.m.id}><td><b>{w.m.code}</b></td><td><code>{w.where}</code></td><td>{w.i.type}</td><td className="num">{number(w.i.length/1000,2)}</td><td className="num">{number(w.i.height/1000,2)}</td><td className="num">{number(w.q.net,2)}</td><td className="num">{number(w.q.stiffener,2)}</td><td className="num">{number(w.q.lintel,2)}</td><td className="num">{number(w.q.tie,2)}</td><td className="num">{w.count}</td></tr>)}
   {walls.length>0&&<tr className="total"><td colSpan={5}>รวม (× จำนวน)</td>{(['net','stiffener','lintel','tie'] as const).map(k=><td key={k} className="num">{number(walls.reduce((n,w)=>n+w.q[k]*w.count,0),2)}</td>)}<td/></tr>}
   {!walls.length&&<tr><td colSpan={10} className="muted">ยังไม่มีผนังก่อ · เพิ่มที่เมนู “ผนังก่อ” หรือนำเข้า Excel (แผ่นงาน Walls)</td></tr>}</tbody></table></div>
  {roofs.length>0&&<><h4>หลังคา ({roofs.length})</h4><div className="table-scroll"><table className="arch-table"><thead><tr><th>หลังคา</th><th>วัสดุมุง</th><th className="num">แปลน m²</th><th className="num">มุมลาด °</th><th className="num">พื้นที่มุง m²</th><th className="num">ครอบสัน m</th><th className="num">เชิงชาย m</th><th className="num">ปั้นลม m</th><th className="num">จำนวน</th></tr></thead><tbody>
   {roofs.map(r=><tr key={r.m.id}><td><b>{r.m.code}</b></td><td>{r.i.covering}</td><td className="num">{number(r.q.plan,2)}</td><td className="num">{number(r.i.pitch,1)}</td><td className="num">{number(r.q.slope,2)}</td><td className="num">{number(r.i.ridge,2)}</td><td className="num">{number(r.i.eave,2)}</td><td className="num">{number(r.i.verge,2)}</td><td className="num">{r.count}</td></tr>)}</tbody></table></div></>}
 </section>;
}
