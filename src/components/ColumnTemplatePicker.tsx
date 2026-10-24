import {useMemo,useState} from 'react';
import type {Spec} from '../domain/model';
import {columnTieLayout,tiePatternInfo,type ColumnInput,type TieZoneKey} from '../domain/elementInput';
import {applyTemplateRow,applyTemplateStack,fractionText,mainText,tieText,zoneFractions,zoneRulesOf} from '../domain/columnTemplates';
import {Modal,NumInput} from './EditorControls';
import {TieElevation,TiePlan} from './ColumnTieEditor';

/** Pick a section from the Project Column Template: one level range → single column (tie zones from the zone rules
 * and the column height / beam depth), or the whole table → column stack. */
export function ColumnTemplatePicker({spec,input,onApply,onClose}:{spec:Spec;input:ColumnInput;onApply:(next:ColumnInput)=>void;onClose:()=>void}){
 const list=spec.columnTemplates||[],rules=zoneRulesOf(spec),ref=input.template;
 const [id,setId]=useState(ref&&list.some(t=>t.id===ref.id)?ref.id:list[0]?.id||''),[row,setRow]=useState(ref?.row??(input.layout==='stack'?-1:0));
 const [beam,setBeam]=useState(ref&&ref.row>=0?ref.beam:input.pour?.beam??600),[linked,setLinked]=useState(ref?.linked??true),[filter,setFilter]=useState('');
 const [zone,setZone]=useState<TieZoneKey>('middle');
 const t=list.find(x=>x.id===id),k=t?Math.min(row,t.rows.length-1):0;
 const next=useMemo(()=>t?k<0?applyTemplateStack(input,t,rules,{linked}):applyTemplateRow(input,t,k,rules,{beam,linked}):undefined,[t,k,input,rules,beam,linked]);
 const lay=useMemo(()=>{if(!next||!t)return;const probe=k<0?applyTemplateRow(input,t,0,rules):next;try{return columnTieLayout(probe,t.pattern,probe.detailing);}catch{return;}},[next,t,k,input,rules]);
 const shown=list.filter(x=>!filter.trim()||x.name.toUpperCase().includes(filter.trim().toUpperCase()));
 const r=t&&k>=0?t.rows[k]:undefined,tie=next?.rebar.tie,f=r?zoneFractions(rules,r.first):undefined;
 return <Modal title="เลือกหน้าตัดเสาจาก Template โครงการ" onClose={onClose}>
  <div className="ct-picker">
   {!list.length?<p className="notice">โครงการนี้ยังไม่มี Project Column Template · เพิ่มได้ที่ General Spec ของโครงการ → ปุ่ม “Project Column Template”</p>:<>
   <div className="ct-chips" role="group" aria-label="ประเภทเสา">{list.length>12&&<input placeholder="ค้นหา C1…" value={filter} onChange={e=>setFilter(e.target.value)}/>}
    {shown.map(x=><button key={x.id} type="button" className={x.id===id?'active':''} onClick={()=>{setId(x.id);setRow(r=>r<0?-1:0);}}><b>{x.name}</b> <small>{x.rows[0].width}×{x.rows[0].depth}</small></button>)}</div>
   {t&&<div className="ct-chips" role="group" aria-label="ช่วงชั้น">{t.rows.map((x,i)=><button key={i} type="button" className={k===i?'active':''} onClick={()=>setRow(i)}>{x.level||`แถว ${i+1}`}{x.first&&<small> · ชั้นแรก</small>}</button>)}
    <button type="button" className={k<0?'active':''} title="ทุกช่วงชั้น → เสาหลายชั้น (ตารางเสา)" onClick={()=>setRow(-1)}>ทั้งตาราง (เสาหลายชั้น)</button></div>}
   {t&&next&&tie&&<div className="ct-preview">
    <div className="ct-summary">
     <b>{t.name}{r?` · ${r.level}`:` · ${t.rows.length} ช่วงชั้น`}</b>{t.note&&<small className="block muted">{t.note}</small>}
     {r?<><p>หน้าตัด {r.width} × {r.depth} · เหล็กยืน {mainText(r)} · ปลอก {tieText(r)}</p>
      <p className="muted">ปลอกใน: {tiePatternInfo[t.pattern].label}</p>
      <div className="form-grid"><label className="field"><span>ความสูงเสา (mm)</span><input disabled value={next.height}/></label>
       <label className="field"><span>ความลึกคานด้านบน (mm) · ช่วงคานเป็นโซนบน</span><NumInput type="number" min={0} step="any" value={beam} onChange={e=>setBeam(Math.max(0,Number(e.target.value)||0))}/></label></div>
      <p className="ct-zones">H = {next.height} − {beam} = {Math.max(0,next.height-beam)} · {r.first?'ชั้นแรก':'ชั้นทั่วไป'}: ล่าง {fractionText(f!.lower)} = <b>{tie.lower.length} @{tie.lower.spacing}</b> · กลาง {fractionText(f!.middle)} = <b>{Math.max(0,next.height-tie.lower.length-tie.upper.length)} @{tie.spacing}</b> · บน {fractionText(f!.upper)} + คาน = <b>{tie.upper.length} @{tie.upper.spacing}</b></p>
      {r.height>0&&r.height!==input.height&&<p className="notice warning">Template กำหนดสูงชั้น {r.height} mm (เสานี้ {input.height}) · จะใช้ค่าของ Template</p>}</>
     :<><p>{t.rows.map(x=>`${x.level}: ${x.width}×${x.depth} · ${mainText(x)} · ${tieText(x)}`).join('\n')}</p>
      <p className="muted">เปลี่ยนเป็นเสาหลายชั้น {t.rows.length} ชั้น · ความสูงชั้น / คานลึกใช้ค่าเดิมของเสา (หรือของ Template ถ้ากำหนด) · โซนปลอกตามกฎของโครงการ ({fractionText(zoneFractions(rules,true).lower)} / {fractionText(zoneFractions(rules,false).lower)} ล่าง)</p></>}
     <p className="muted">จะเติมให้: ขนาดหน้าตัด · เหล็กมุม / ด้าน X / ด้าน Y · ปลอกชุด 1 และชุด 2 ทั้ง 3 โซน · ค่าอื่น (cover, ปลายเหล็ก, การเท) คงเดิม</p>
    </div>
    <div className="ct-graphics">{lay&&<TiePlan lay={lay} size={150}/>}{k>=0&&<TieElevation input={next} lengths={{lower:tie.lower.length,upper:tie.upper.length,middle:Math.max(0,next.height-tie.lower.length-tie.upper.length)}} zone={zone} onZone={setZone}/>}</div>
   </div>}
   <footer className="actions"><label className="check"><input type="checkbox" checked={linked} onChange={e=>setLinked(e.target.checked)}/>ผูกกับ Template (แก้ Template ใน Spec แล้วเสานี้ปรับตาม)</label>
    <span style={{flex:1}}/><button onClick={onClose}>ยกเลิก</button><button className="primary" disabled={!next} onClick={()=>{if(next){onApply(next);onClose();}}}>ใช้หน้าตัดนี้</button></footer></>}
  </div>
 </Modal>;
}
