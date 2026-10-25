import {useState} from 'react';
import {Download,Trash2,Upload} from 'lucide-react';
import type {Spec} from '../domain/model';
import {beamTemplateFromSchedule,beamTemplateSummary,beamTemplatesSchema,type BeamTemplate} from '../domain/beamTemplates';
import {codeValues} from '../domain/designCodes';

/** 1/3 → "1/3", 0.3 → "0.3" */
const fractionLabel=(f:number)=>{for(const q of [2,3,4,5,6,8,10,12]){const p=Math.round(f*q);if(p>0&&Math.abs(p/q-f)<1e-6)return `${p}/${q}`;}return String(Math.round(f*1000)/1000);};

/** Beam marks of the spec (spec.beamTemplates): sections as drawn + summary per mark, delete, JSON import / export.
 * Spans of a beam group pick them in the “เบอร์คาน” column. Import: a template list, a spec file with beamTemplates,
 * or a schedule list ({name, width, depth, sections[{zone, top, bottom, stirrup, legs, tie, side}]}) → bars derived. */
export function BeamTemplateList({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const list=spec.beamTemplates||[],[msg,setMsg]=useState(''),[err,setErr]=useState(''),[q,setQ]=useState('');
 const store=(next:BeamTemplate[])=>{const {beamTemplates:_,...rest}=spec;onChange(next.length?{...rest,beamTemplates:next}:rest);};
 const importFile=async(file:File)=>{try{setErr('');const raw=JSON.parse(await file.text()),arr:unknown[]=Array.isArray(raw)?raw:raw?.beamTemplates;
  if(!Array.isArray(arr))throw new Error('ไม่พบรายการ beamTemplates');
  const warns:string[]=[];
  const rows=arr.filter((e:any)=>e&&typeof e.name==='string'&&!e.name.startsWith('_')).map((e:any)=>e.rebar?e:beamTemplateFromSchedule({...e,group:e.group??e.sheet??'',source:e.source??(e.page?`${e.sheet||''} หน้า ${e.page}`.trim():'')},w=>warns.push(`${e.name}: ${w}`)));
  const parsed=beamTemplatesSchema.parse(rows),names=new Set(parsed.map(t=>t.name.toUpperCase()));
  store([...list.filter(t=>!names.has(t.name.toUpperCase())),...parsed]);
  setMsg(`นำเข้า ${file.name}: ${parsed.length} เบอร์ (ชื่อซ้ำแทนของเดิม) · กด “บันทึก Spec” เพื่อให้โครงการเห็น${warns.length?` · ตรวจ: ${warns.slice(0,5).join(' / ')}${warns.length>5?` …(+${warns.length-5})`:''}`:''}`);}
  catch(e:any){setErr(`นำเข้าไม่ได้ · ${e?.issues?.[0]?`${e.issues[0].path.join('.')}: ${e.issues[0].message}`:e?.message||e}`);}};
 const exportFile=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(list,null,1)],{type:'application/json'}));a.download='beam-templates.json';a.click();URL.revokeObjectURL(a.href);};
 const r=codeValues(spec.codeData,spec.designCode).beam,shown=list.filter(t=>!q.trim()||t.name.toUpperCase().includes(q.trim().toUpperCase()));
 const groups=[...new Set(shown.map(t=>t.group||''))];
 return <section className="foundation-templates beam-templates" aria-label="Beam Template"><h3>Beam Template · เบอร์คานตามแบบของโครงการ</h3>
  <p>หน้าตัดคานจาก Beam Details (END / MID / CON / CANT หรือ ALL SPAN: เหล็กบน ล่าง EX ปลอก เหล็กข้าง) · หน้าคาน (กลุ่มคาน) เลือกเบอร์ในช่อง “เบอร์คาน” ของแต่ละช่วง · เหล็กหลักต่อเนื่องตลอดแนวคาน ต่อทาบเมื่อยาวเกินเหล็กเส้น (บน: กลางช่วง L/3 · ล่าง: เหนือ / ใกล้ที่รองรับ L/4) · ระยะตัด EX ตาม “การเสริมเหล็กคาน” ของมาตรฐานที่เลือก: EX บนปลายไม่ต่อเนื่อง {fractionLabel(r.topEnd)}·L · ต่อเนื่อง {fractionLabel(r.topCont)}·La · EX ล่างหยุดห่างที่รองรับ {fractionLabel(r.bottomEnd??r.bottomZone)}·L / {fractionLabel(r.bottomCont??.1)}·L · ปลอกถี่ {fractionLabel(r.stirrupZone??.25)}·L</p>
  <div className="actions">{!disabled&&<label className="button"><Upload size={14}/>นำเข้า JSON<input type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/></label>}
   <button type="button" disabled={!list.length} onClick={exportFile}><Download size={14}/>ส่งออก JSON</button>
   {!disabled&&list.length>0&&<button type="button" onClick={()=>{if(confirm(`ลบ Beam Template ทั้งหมด ${list.length} เบอร์? คานที่ใช้ไปแล้วไม่เปลี่ยน`))store([]);}}><Trash2 size={14}/>ลบทั้งหมด</button>}
   <input aria-label="ค้นหาเบอร์คาน" placeholder="ค้นหาเบอร์คาน" value={q} onChange={e=>setQ(e.target.value)} style={{width:140}}/><span className="muted">{list.length} เบอร์</span></div>
  {msg&&<p className="notice success">{msg}</p>}{err&&<p className="notice danger">{err}</p>}
  {groups.map(g=><details key={g||'-'} open={groups.length===1||!!q.trim()}><summary><b>{g||'ไม่ระบุกลุ่ม'}</b> <span className="muted">({shown.filter(t=>(t.group||'')===g).length})</span></summary><div className="ft-list">{shown.filter(t=>(t.group||'')===g).map(t=><div key={t.id} className="ft-row">
   <div><b>{t.name}</b><p>{beamTemplateSummary(t)}</p>
    <small className="muted">{t.sections.map(x=>`${x.zone.toUpperCase()}: ${[x.top,x.stirrup+(x.legs>2?` ×${x.legs}`:''),x.tie,x.side,x.bottom].filter(Boolean).join(' · ')}`).join('  |  ')}</small>
    {t.note&&<p className="muted">{t.note}</p>}{t.source&&<small className="muted block">{t.source}</small>}</div>
   {!disabled&&<button type="button" className="icon-button" title={`ลบ ${t.name}`} onClick={()=>{if(confirm(`ลบ Beam Template ${t.name}? คานที่ใช้ไปแล้วไม่เปลี่ยน`))store(list.filter(x=>x.id!==t.id));}}><Trash2 size={14}/></button>}</div>)}</div></details>)}
 </section>;
}
