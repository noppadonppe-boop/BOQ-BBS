import {Fragment,useState,type ReactNode} from 'react';
import {Building2,ChevronDown,ChevronRight,DoorOpen,Factory,Layers3,Route} from 'lucide-react';
import {labels,type Category,type Member,type Project} from '../domain/model';
import {disciplineInfo,disciplineOf,disciplines,projectDisciplines,type Discipline} from '../domain/disciplines';
import type {takeoff} from '../domain/engine';
import {number} from './EditorControls';

export const disciplineIcons:Record<Discipline,typeof Layers3>={RC:Building2,Steel:Factory,Civil:Route,Arch:DoorOpen};
export const disciplinePage=(d:Discipline)=>`disc-${d}`;
export const pageDiscipline=(page:string)=>disciplines.find(d=>page===disciplinePage(d));

/** Sidebar group "ข้อมูลองค์อาคาร": discipline headers (open the overview, fold the list) → their element categories. */
export function DisciplineNav({project,members,available,page,go,children}:{project:Project;members:Member[];available:boolean;page:string;go:(page:string)=>void;children?:ReactNode}){
 const shown=projectDisciplines(project,members.map(m=>m.category)),current=pageDiscipline(page)||(disciplines.find(d=>disciplineInfo[d].categories.includes(page as Category)));
 const [open,setOpen]=useState<Set<Discipline>>(()=>new Set(current?[current]:['RC']));
 const count=(f:(m:Member)=>boolean)=>available?members.filter(f).length:'…';
 return <div className="nav-group"><small className="nav-label">ข้อมูลองค์อาคาร</small><nav>
  {shown.map(d=>{const info=disciplineInfo[d],Icon=disciplineIcons[d],isOpen=open.has(d)||current===d,Fold=isOpen?ChevronDown:ChevronRight;
   return <Fragment key={d}>
    <button className={`nav-discipline${page===disciplinePage(d)?' active':''}`} aria-expanded={info.categories.length?isOpen:undefined} onClick={()=>{const next=new Set(open);if(page===disciplinePage(d)&&isOpen)next.delete(d);else next.add(d);setOpen(next);go(disciplinePage(d));}}><Icon size={16}/><span>{info.label}</span><small>{count(m=>disciplineOf(m.category)===d)}</small>{info.categories.length>0&&<Fold size={13} className="nav-fold"/>}</button>
    {isOpen&&info.categories.map(c=><button key={c} className={`nav-sub${page===c?' active':''}`} onClick={()=>go(c)}><Layers3 size={14}/><span>{labels[c]}</span><small>{count(m=>m.category===c)}</small></button>)}
   </Fragment>;})}
  {children}
 </nav></div>;
}

type Takeoff=ReturnType<typeof takeoff>;
/** Overview of one discipline: categories with counts and quantities, or what the discipline will hold. */
export function DisciplinePage({discipline,members,totals,canEdit,go}:{discipline:Discipline;members:Member[];totals:Takeoff[];canEdit:boolean;go:(page:string)=>void}){
 const info=disciplineInfo[discipline],Icon=disciplineIcons[discipline];
 const rows=info.categories.map(c=>{let n=0,qty=0,concrete=0,formwork=0,rebar=0;members.forEach((m,i)=>{if(m.category!==c)return;const q=totals[i];n++;if(!q)return;qty+=q.quantity;concrete+=q.concrete*q.quantity;formwork+=q.formwork*q.quantity;rebar+=q.rebar*q.quantity;});return {c,n,qty,concrete,formwork,rebar};});
 const sum=(k:'n'|'qty'|'concrete'|'formwork'|'rebar')=>rows.reduce((t,r)=>t+r[k],0);
 return <>
  <div className="heading"><div><div className="eyebrow">DISCIPLINE · {info.short}</div><h1><Icon size={22}/> {info.label}</h1><p>เอกสารหลัก: <span className="badge success">{info.deliverable}</span></p></div></div>
  {info.categories.length?<section className="panel padded"><div className="table-scroll"><table><thead><tr><th>ประเภทองค์ประกอบ</th><th className="num">สมาชิก</th><th className="num">จำนวนชิ้น</th><th className="num">คอนกรีต m³</th><th className="num">แบบหล่อ m²</th><th className="num">เหล็กที่กรอก kg</th><th/></tr></thead><tbody>
   {rows.map(r=><tr key={r.c}><td>{labels[r.c]}{(r.c==='Stair'||r.c==='Lift')&&<small className="block muted">ใช้เครื่องมือรูปทรง / Prism และวาดเหล็กบนรูปตัด</small>}</td><td className="num">{r.n}</td><td className="num">{number(r.qty,0)}</td><td className="num">{number(r.concrete)}</td><td className="num">{number(r.formwork)}</td><td className="num">{number(r.rebar)}</td><td><button onClick={()=>go(r.c)}>เปิด</button></td></tr>)}
   <tr className="total"><td>TOTAL</td><td className="num">{sum('n')}</td><td className="num">{number(sum('qty'),0)}</td><td className="num">{number(sum('concrete'))}</td><td className="num">{number(sum('formwork'))}</td><td className="num">{number(sum('rebar'))}</td><td/></tr>
  </tbody></table></div><p className="muted">ปริมาณจากข้อมูลทำงานล่าสุด · BOQ Summary จัดกลุ่ม “หมวดงาน” ได้</p></section>
  :<section className="panel padded"><p className="notice">หมวดนี้เปิดใช้ในโครงการแล้ว · ประเภทองค์ประกอบและเครื่องมือ{info.deliverable}จะเพิ่มในระยะถัดไป</p><h3>รายการที่จะรองรับ</h3><ul>{info.planned.map(p=><li key={p}>{p}</li>)}</ul>{canEdit&&<p className="muted">ปิดหมวดนี้ได้ที่ “โครงการ & สำรองข้อมูล” → หมวดงานในโครงการ</p>}</section>}
 </>;
}

/** Settings: disciplines used by the project (at least one; disciplines that already have members stay on). */
export function DisciplineSettings({value,used,disabled,onChange}:{value?:Discipline[];used:Category[];disabled:boolean;onChange:(v:Discipline[])=>void}){
 const chosen=new Set(value?.length?value:['RC'] as Discipline[]),locked=new Set(used.map(disciplineOf));
 return <div className="discipline-settings"><h3>หมวดงานในโครงการ</h3><p className="muted">เลือกหมวดที่แสดงในเมนู “ข้อมูลองค์อาคาร” · หมวดที่มีสมาชิกอยู่แล้วปิดไม่ได้</p>
  <div className="discipline-options">{disciplines.map(d=>{const info=disciplineInfo[d],Icon=disciplineIcons[d],on=chosen.has(d)||locked.has(d);
   return <label key={d} className={`check discipline-option${on?' on':''}`}><input type="checkbox" disabled={disabled||locked.has(d)||(on&&chosen.size===1&&chosen.has(d))} checked={on} onChange={e=>{const next=new Set(chosen);for(const l of locked)next.add(l);if(e.target.checked)next.add(d);else next.delete(d);onChange(disciplines.filter(x=>next.has(x)));}}/><Icon size={16}/><span><b>{info.label}</b><small className="block muted">{info.deliverable}{info.categories.length?'':' · เร็ว ๆ นี้'}{locked.has(d)?' · มีสมาชิกแล้ว':''}</small></span></label>;})}</div>
 </div>;
}
