import {useEffect,useMemo,useRef,useState} from 'react';
import type {Spec} from '../domain/model';
import {columnTieLayout,defaultElementInput,tiePatternInfo,type ColumnInput,type FootingColumn,type TieZoneKey} from '../domain/elementInput';
import {applyTemplateFooting,applyTemplateRow,applyTemplateStack,fractionText,mainText,rowPattern,templateBarName,tieText,zoneFractions,zoneRulesOf,type ColumnTemplate,type ColumnZoneRules} from '../domain/columnTemplates';
import {Modal,NumInput} from './EditorControls';
import {TieElevation,TiePlan} from './ColumnTieEditor';

/** Pick a section from the Project Column Template: one level range → single column (tie zones from the zone rules
 * and the column height / beam depth), or the whole table → column stack. */
export function ColumnTemplatePicker({spec,input,onApply,onClose}:{spec:Spec;input:ColumnInput;onApply:(next:ColumnInput)=>void;onClose:()=>void}){
 const list=spec.columnTemplates||[],rules=zoneRulesOf(spec),ref=input.template;
 const [id,setId]=useState(ref&&list.some(t=>t.id===ref.id)?ref.id:list[0]?.id||''),[row,setRow]=useState(ref?.row??(input.layout==='stack'?-1:0));
 const [beam,setBeam]=useState(ref&&ref.row>=0?ref.beam:input.pour?.beam??600),[linked,setLinked]=useState(ref?.linked??true),[filter,setFilter]=useState('');
 const [zone,setZone]=useState<TieZoneKey>('middle'),[view,setView]=useState<'grid'|'list'>('grid');
 const t=list.find(x=>x.id===id),k=t?Math.min(row,t.rows.length-1):0;
 const next=useMemo(()=>t?k<0?applyTemplateStack(input,t,rules,{linked}):applyTemplateRow(input,t,k,rules,{beam,linked}):undefined,[t,k,input,rules,beam,linked]);
 const lay=useMemo(()=>{if(!next||!t)return;const probe=k<0?applyTemplateRow(input,t,0,rules):next;try{return columnTieLayout(probe,rowPattern(t,t.rows[Math.max(0,k)]),probe.detailing);}catch{return;}},[next,t,k,input,rules]);
 const shown=list.filter(x=>!filter.trim()||x.name.toUpperCase().includes(filter.trim().toUpperCase()));
 const r=t&&k>=0?t.rows[k]:undefined,tie=next?.rebar.tie,f=r?zoneFractions(rules,r.first):undefined;
 return <Modal title="ตารางหน้าตัดเสา · Project Column Template" onClose={onClose}>
  <div className="ct-picker">
   {!list.length?<p className="notice">โครงการนี้ยังไม่มี Project Column Template · เพิ่มได้ที่ General Spec ของโครงการ → ปุ่ม “Project Column Template”</p>:<>
   <div className="ct-viewbar"><div className="segmented" role="tablist">{([['grid','ตารางหน้าตัดเสา'],['list','รายการ']] as const).map(([v,l])=><button key={v} type="button" role="tab" aria-selected={view===v} className={view===v?'active':''} onClick={()=>setView(v)}>{l}</button>)}</div>
    {list.length>8&&<input placeholder="ค้นหา C1…" value={filter} onChange={e=>setFilter(e.target.value)}/>}
    {view==='grid'&&<small className="muted">คลิกช่องหน้าตัด = ใช้ช่วงชั้นนั้น (เสาชั้นเดียว) · คลิกชื่อเสา = ทั้งตาราง (เสาหลายชั้น)</small>}</div>
   {view==='list'&&<div className="ct-chips" role="group" aria-label="ประเภทเสา">
    {shown.map(x=><button key={x.id} type="button" className={x.id===id?'active':''} onClick={()=>{setId(x.id);setRow(r=>r<0?-1:0);}}><b>{x.name}</b> <small>{x.rows[0].width}×{x.rows[0].depth}</small></button>)}</div>}
   {view==='list'&&t&&<div className="ct-chips" role="group" aria-label="ช่วงชั้น">{t.rows.map((x,i)=><button key={i} type="button" className={k===i?'active':''} onClick={()=>setRow(i)}>{x.level||`แถว ${i+1}`}{x.first&&<small> · ชั้นแรก</small>}</button>)}
    <button type="button" className={k<0?'active':''} title="ทุกช่วงชั้น → เสาหลายชั้น (ตารางเสา)" onClick={()=>setRow(-1)}>ทั้งตาราง (เสาหลายชั้น)</button></div>}
   {view==='grid'&&<ScheduleGrid list={shown} input={input} rules={rules} id={id} row={k} onPick={(x,i)=>{setId(x);setRow(i);}}/>}
   {t&&next&&tie&&<div className="ct-preview">
    <div className="ct-summary">
     <b>{t.name}{r?` · ${r.level}`:` · ${t.rows.length} ช่วงชั้น`}</b>{t.note&&<small className="block muted">{t.note}</small>}
     {r?<><p>หน้าตัด {r.width} × {r.depth} · เหล็กยืน {mainText(r)} · ปลอก {tieText(r)}</p>
      <p className="muted">ปลอกใน: {tiePatternInfo[rowPattern(t,r)].label}</p>
      <div className="form-grid"><label className="field"><span>ความสูงเสา (mm)</span><input disabled value={next.height}/></label>
       <label className="field"><span>ความลึกคานด้านบน (mm) · ช่วงคานเป็นโซนบน</span><NumInput type="number" min={0} step="any" value={beam} onChange={e=>setBeam(Math.max(0,Number(e.target.value)||0))}/></label></div>
      <p className="ct-zones">H = {next.height} − {beam} = {Math.max(0,next.height-beam)} · {r.first?'ชั้นแรก':'ชั้นทั่วไป'}: ล่าง {fractionText(f!.lower)} = <b>{tie.lower.length} @{tie.lower.spacing}</b> · กลาง {fractionText(f!.middle)} = <b>{Math.max(0,next.height-tie.lower.length-tie.upper.length)} @{tie.spacing}</b> · บน {fractionText(f!.upper)} + คาน = <b>{tie.upper.length} @{tie.upper.spacing}</b></p>
      {r.height>0&&r.height!==input.height&&<p className="notice warning">Template กำหนดสูงชั้น {r.height} mm (เสานี้ {input.height}) · จะใช้ค่าของ Template</p>}</>
     :<><p>{t.rows.map(x=>`${x.level}: ${x.width}×${x.depth} · ${mainText(x)} · ${tieText(x)}`).join('\n')}</p>
      <p className="muted">เปลี่ยนเป็นเสาหลายชั้น {t.rows.length} ชั้น · ความสูงชั้น / คานลึกใช้ค่าเดิมของเสา (หรือของ Template ถ้ากำหนด) · โซนปลอกตามกฎของโครงการ ({fractionText(zoneFractions(rules,true).lower)} / {fractionText(zoneFractions(rules,false).lower)} ล่าง)</p></>}
     <p className="muted">จะเติมให้: ขนาดหน้าตัด · {t.rows.some(x=>x.layout)?'ตำแหน่งเหล็กยืนและปลอกในตามรูปในแบบ':'เหล็กมุม / ด้าน X / ด้าน Y'} · ปลอกชุด 1 และชุด 2 ทั้ง 3 โซน · ค่าอื่น (cover, ปลายเหล็ก, การเท) คงเดิม</p>
    </div>
    <div className="ct-graphics">{lay&&<TiePlan lay={lay} size={150}/>}{k>=0&&<TieElevation input={next} lengths={{lower:tie.lower.length,upper:tie.upper.length,middle:Math.max(0,next.height-tie.lower.length-tie.upper.length)}} zone={zone} onZone={setZone}/>}</div>
   </div>}
   <footer className="actions"><label className="check"><input type="checkbox" checked={linked} onChange={e=>setLinked(e.target.checked)}/>ผูกกับ Template (แก้ Template ใน Spec แล้วเสานี้ปรับตาม)</label>
    <span style={{flex:1}}/><button onClick={onClose}>ยกเลิก</button><button className="primary" disabled={!next} onClick={()=>{if(next){onApply(next);onClose();}}}>ใช้หน้าตัดนี้</button></footer></>}
  </div>
 </Modal>;
}

/** Footing: pick a pedestal or starter bar section from the schedule (normally the first storey row) for one column on the footing. */
export function FootingTemplatePicker({spec,col,target,onApply,onClose}:{spec:Spec;col:FootingColumn;target:string;onApply:(next:FootingColumn)=>void;onClose:()=>void}){
 const list=spec.columnTemplates||[],rules=zoneRulesOf(spec),base=useMemo(()=>defaultElementInput('Column','manual',spec) as ColumnInput,[spec]);
 const known=list.find(t=>t.name===col.columnNo),firstRow=(t?:ColumnTemplate)=>Math.max(0,t?.rows.findIndex(r=>r.first)??0);
 const [id,setId]=useState(known?.id||list[0]?.id||''),[row,setRow]=useState(firstRow(known||list[0])),[filter,setFilter]=useState('');
 const [type,setType]=useState<'pedestal'|'starter'>(col.type==='starter'?'starter':'pedestal');
 const t=list.find(x=>x.id===id),k=t?Math.min(row,t.rows.length-1):0,r=t?.rows[k];
 const shown=list.filter(x=>!filter.trim()||x.name.toUpperCase().includes(filter.trim().toUpperCase()));
 return <Modal title="ตารางหน้าตัดเสา · เสาตอม่อ / Starter bar บนฐานราก" onClose={onClose}>
  <div className="ct-picker">
   {!list.length?<p className="notice">โครงการนี้ยังไม่มี Project Column Template · เพิ่มได้ที่ General Spec ของโครงการ → ปุ่ม “Project Column Template”</p>:<>
   <div className="ct-viewbar"><div className="segmented" role="group" aria-label="ใช้เป็น">{([['pedestal','เสาตอม่อ (คอนกรีต + เหล็กเสา)'],['starter','Starter bar (เหล็กรอเสา)']] as const).map(([v,l])=><button key={v} type="button" aria-pressed={type===v} className={type===v?'active':''} onClick={()=>setType(v)}>{l}</button>)}</div>
    {list.length>8&&<input placeholder="ค้นหา C1…" value={filter} onChange={e=>setFilter(e.target.value)}/>}
    <small className="muted">คลิกช่องหน้าตัด = ใช้หน้าตัดช่วงชั้นนั้น · คลิกชื่อเสา = ช่วงชั้นแรก (บนฐานราก)</small></div>
   <ScheduleGrid list={shown} input={base} rules={rules} id={id} row={k} onPick={(x,i)=>{setId(x);setRow(i<0?firstRow(list.find(y=>y.id===x)):i);}} bottom/>
   {t&&r&&<div className="ct-summary"><b>{target} ← {t.name} · {r.level}</b>
    <p>{type==='pedestal'?'เสาตอม่อ':'Starter bar'} · หน้าตัด {r.width} × {r.depth} · เหล็กยืน {mainText(r)}{type==='pedestal'?` · ปลอก ${templateBarName(r.tie.diameter)}@${r.tie.s2||r.tie.s1} (ระยะโซนปลายเสา S2)`:''}</p>
    <p className="muted">จะเติมให้: ประเภท · Column no. = {t.name} · หน้าตัดสี่เหลี่ยม · {r.layout?'ตำแหน่งเหล็กยืนตามรูปในแบบ':'เหล็กมุม / ด้าน X / ด้าน Y'}{type==='pedestal'?' · เหล็กปลอก':''} · ค่าอื่น (ตำแหน่ง, ความสูงตอม่อ, ระยะโผล่, การฝัง, ปลายบน) คงเดิม{type==='starter'?' · Starter bar ไม่มีเหล็กปลอก':''}</p></div>}
   <footer className="actions"><span style={{flex:1}}/><button onClick={onClose}>ยกเลิก</button><button className="primary" disabled={!t||!r} onClick={()=>{if(t){onApply(applyTemplateFooting(col,t,k,type));onClose();}}}>ใช้หน้าตัดนี้</button></footer></>}
  </div>
 </Modal>;
}

/** Level names of all types in drawing order (bottom → top), each type's own order kept. */
export function scheduleLevels(list:ColumnTemplate[]){
 const out:string[]=[];
 for(const t of list){let at=-1;for(const r of t.rows){const i=out.indexOf(r.level);if(i>=0)at=i;else out.splice(at=at+1,0,r.level);}}
 return out;
}

/** Column schedule as on the drawings: types across, level ranges down (top storey first), section sketch + text per cell. */
function ScheduleGrid({list,input,rules,id,row,onPick,bottom}:{list:ColumnTemplate[];input:ColumnInput;rules:ColumnZoneRules;id:string;row:number;onPick:(id:string,row:number)=>void;bottom?:boolean}){
 const box=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(bottom&&box.current)box.current.scrollTop=box.current.scrollHeight;},[bottom]);
 const levels=useMemo(()=>scheduleLevels(list).reverse(),[list]);
 const lays=useMemo(()=>new Map(list.flatMap(t=>t.rows.map((r,k)=>{let lay;try{const p=applyTemplateRow(input,t,k,rules);lay=columnTieLayout(p,rowPattern(t,r),p.detailing);}catch{lay=undefined;}return [`${t.id}/${r.level}`,{k,lay}] as const;}))),[list,input,rules]);
 const big=Math.max(1,...list.flatMap(t=>t.rows.map(r=>Math.max(r.width,r.depth))));
 return <div className="ct-sched" ref={box}><table>
  <thead><tr><th className="lv">ช่วงชั้น \ เสา</th>{list.map(t=><th key={t.id} className={t.id===id&&row<0?'active':''}><button type="button" title={`${t.name} ทั้งตาราง → เสาหลายชั้น ${t.rows.length} ชั้น${t.note?`\n${t.note}`:''}`} onClick={()=>onPick(t.id,-1)}><b>{t.name}</b><small>{t.rows.length} ชั้น · {t.rows.some(r=>r.layout)?'ตามรูปในแบบ':tiePatternInfo[t.pattern].label.split(' (')[0]}</small></button></th>)}</tr></thead>
  <tbody>{levels.map(lv=><tr key={lv}><th className="lv">{lv}</th>{list.map(t=>{const c=lays.get(`${t.id}/${lv}`),r=c&&t.rows[c.k];
   if(!c||!r)return <td key={t.id} className="none"/>;
   const on=t.id===id&&(row===c.k||row<0);
   return <td key={t.id} className={on?'active':''}><button type="button" title={`${t.name} · ${lv}${r.first?' · ชั้นแรก':''}`} onClick={()=>onPick(t.id,c.k)}>
    {c.lay?<TiePlan lay={c.lay} size={Math.round(48+62*Math.max(r.width,r.depth)/big)}/>:<span className="muted">—</span>}
    <span className="ct-cell"><b>{r.width}×{r.depth}</b><span>{mainText(r)}</span><span>{tieText(r)}</span></span></button></td>;})}</tr>)}</tbody>
 </table></div>;
}
