import {useMemo,useState} from 'react';
import {Download,FileSpreadsheet} from 'lucide-react';
import type {Member,Project} from '../domain/model';
import {command} from '../data/firebase';
import {assemblyTypeLabels} from '../domain/steelInputSchema';
import {planSteelImport,steelQuantities} from '../domain/steelInput';
import type {ImportAction} from '../domain/archSchedules';
import {number} from './EditorControls';

type Run=(f:()=>Promise<unknown>,message?:string)=>void;
const tag={add:['เพิ่ม','success'],update:['อัปเดต','warning'],same:['คงเดิม','']} as const;

/** Steel page: assemblies with weight / paint / bolts, totals per profile and grade, Excel (Tekla material list) in / out. */
export function SteelSchedules({project,members,canEdit,busy,run}:{project:Project;members:Member[];canEdit:boolean;busy:boolean;run:Run}){
 const list=useMemo(()=>members.filter(m=>m.category==='SteelAssembly'&&m.steelInput).map(m=>({m,q:steelQuantities(m.steelInput!),count:m.occurrences.reduce((n,o)=>n+o.quantity,0)})),[members]);
 const totals=useMemo(()=>{const t=new Map<string,{name:string;grade:string;kg:number}>();for(const a of list)for(const l of a.q.lines){const name=l.profile?.plate?`PL${l.profile.plate.t}`:l.profile?.name||l.part.profile,k=`${name}|${l.part.grade}`,v=t.get(k)||{name,grade:l.part.grade,kg:0};v.kg+=l.weight*a.count;t.set(k,v);}
  return [...t.values()].sort((a,b)=>b.kg-a.kg);},[list]);
 const [incoming,setIncoming]=useState<{source:string;actions:ImportAction<Member>[];problems:string[]}|null>(null),[reading,setReading]=useState(''),ro=!canEdit||busy;
 const readFile=async(file?:File)=>{if(!file)return;setReading(`กำลังอ่าน ${file.name}…`);try{const {readSteel}=await import('../data/steelExcel'),p=planSteelImport(project,members,await readSteel(file));setIncoming({source:file.name,actions:p.members,problems:p.problems});setReading('');}catch(e:any){setReading(`อ่าน ${file.name} ไม่ได้: ${e?.message||e}`);}};
 const apply=()=>incoming&&run(async()=>{for(const a of incoming.actions)if(a.action!=='same')await command('saveMember',project.id,{member:a.item});setIncoming(null);},'นำเข้า Assembly เหล็กแล้ว');
 const total=list.reduce((n,a)=>n+a.q.weight*a.count,0);
 return <section className="panel padded arch-schedules">
  <div className="section-heading"><div><h3>Assembly เหล็กรูปพรรณ ({list.length})</h3><p className="muted">น้ำหนักรวม {number(total/1000,3)} ตัน · พื้นที่ทาสี {number(list.reduce((n,a)=>n+a.q.paint*a.count,0),1)} m² · น็อต {list.reduce((n,a)=>n+a.q.bolts*a.count,0)} ชุด</p></div>
   <div className="actions"><button onClick={()=>void import('../data/steelExcel').then(x=>x.exportSteel(members,project.locations,project.code))}><Download size={15}/>{list.length?'ส่งออก Excel':'แบบฟอร์ม Excel'}</button>
    <label className={`button${ro?' disabled':''}`} title="แผ่นงาน Parts · Bolts · Welds · Assemblies (Material list ของ Tekla)"><FileSpreadsheet size={15}/>นำเข้า Excel<input hidden type="file" accept=".xlsx" disabled={ro} onChange={e=>{void readFile(e.target.files?.[0]);e.target.value='';}}/></label></div></div>
  {reading&&<p role="status" className={`notice${reading.startsWith('อ่าน')?' danger':''}`}>{reading}</p>}
  {incoming&&<div className="arch-import"><div className="section-heading"><div><small className="eyebrow">นำเข้า</small><h3>{incoming.source}</h3></div><button onClick={()=>setIncoming(null)}>ปิด</button></div>
   <p className="notice">{(['add','update','same'] as const).map(k=>`${tag[k][0]} ${incoming.actions.filter(a=>a.action===k).length}`).join(' · ')}</p>
   {incoming.problems.length>0&&<div className="notice warning"><b>ข้ามบางแถว:</b><ul>{incoming.problems.slice(0,12).map(p=><li key={p}>{p}</li>)}</ul></div>}
   <div className="table-scroll"><table><thead><tr><th>ผล</th><th>Assembly</th><th className="num">ชิ้นส่วน</th><th className="num">kg / ชุด</th></tr></thead><tbody>{incoming.actions.map((a,i)=><tr key={i}><td><span className={`badge ${tag[a.action][1]}`}>{tag[a.action][0]}</span></td><td><code>{a.code}</code></td><td className="num">{a.item.steelInput!.parts.length}</td><td className="num">{number(steelQuantities(a.item.steelInput!).weight,1)}</td></tr>)}</tbody></table></div>
   <footer className="actions"><button className="primary" disabled={ro||!incoming.actions.some(a=>a.action!=='same')} onClick={apply}>บันทึก {incoming.actions.filter(a=>a.action!=='same').length} Assembly</button></footer></div>}
  <div className="table-scroll"><table className="arch-table"><thead><tr><th>Assembly</th><th>ประเภท</th><th>ชิ้นหลัก</th><th className="num">ชิ้นส่วน</th><th className="num">kg / ชุด</th><th className="num">ทาสี m² / ชุด</th><th className="num">น็อต / ชุด</th><th className="num">จำนวน</th><th className="num">รวม kg</th></tr></thead><tbody>
   {list.map(({m,q,count})=><tr key={m.id}><td><b>{m.code}</b> <small className="muted">{m.steelInput!.name}</small></td><td>{assemblyTypeLabels[m.steelInput!.type]}</td><td>{q.mainProfile?.name||q.main.profile}</td><td className="num">{m.steelInput!.parts.length}</td><td className="num">{number(q.weight,1)}</td><td className="num">{number(q.paint,2)}</td><td className="num">{q.bolts}</td><td className="num">{count}</td><td className="num">{number(q.weight*count,1)}</td></tr>)}
   {!list.length&&<tr><td colSpan={9} className="muted">ยังไม่มี Assembly · เพิ่มที่เมนู “Assembly เหล็กรูปพรรณ” หรือนำเข้า Excel</td></tr>}</tbody></table></div>
  {totals.length>0&&<><h4>สรุปน้ำหนักตาม Profile</h4><div className="table-scroll"><table className="arch-table"><thead><tr><th>Profile</th><th>Material</th><th className="num">kg</th><th className="num">ตัน</th></tr></thead><tbody>{totals.map(t=><tr key={`${t.name}|${t.grade}`}><td>{t.name}</td><td>{t.grade}</td><td className="num">{number(t.kg,1)}</td><td className="num">{number(t.kg/1000,3)}</td></tr>)}</tbody></table></div></>}
 </section>;
}
