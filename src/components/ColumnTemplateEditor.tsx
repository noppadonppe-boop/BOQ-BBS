import {useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,Copy,Download,Plus,Trash2,Upload} from 'lucide-react';
import type {Spec} from '../domain/model';
import {columnTieLayout,defaultElementInput,tiePatternInfo,tiePatterns,type ColumnInput,type TiePattern} from '../domain/elementInput';
import {DEFAULT_ZONE_RULES,applyTemplateRow,fractionText,mainText,newTemplate,newTemplateRow,rowPattern,splitMain,templateMainCount,tieText,zoneFractions,zoneRulesOf,type ColumnTemplate,type ColumnTemplateRow,type ColumnZoneRules} from '../domain/columnTemplates';
import {exportColumnTemplates,importColumnTemplates} from '../data/columnTemplateExcel';
import {Modal,NumInput} from './EditorControls';
import {TiePlan} from './ColumnTieEditor';

const diameters=[12,16,20,25,28,32,36,40];
const tieDiameters=[9,10,12,16];
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;

/** Column built from a template row (tie plan / piece check); undefined when the section cannot hold the bars. */
export function templatePreview(spec:Spec,t:ColumnTemplate,k:number){
 const base=defaultElementInput('Column','manual',spec) as ColumnInput,i=applyTemplateRow(base,t,k,zoneRulesOf(spec));
 try{const lay=columnTieLayout(i,rowPattern(t,t.rows[k]),i.detailing);return {input:i,lay,pieces:1+lay.pieces.length};}catch{return undefined;}
}

/** Project Column Template (column schedule of the project) kept in the spec: column types with a row per level
 * range (section, main bars, ties nYd@S1(d@S2)) and the tie zone rules of the typical column detail. */
export function ColumnTemplateEditor({spec,readOnly,onChange,onClose,title}:{spec:Spec;readOnly:boolean;onChange:(next:Spec)=>void;onClose:()=>void;title:string}){
 const list=spec.columnTemplates||[],rules=zoneRulesOf(spec);
 const [sel,setSel]=useState(list[0]?.id||''),[filter,setFilter]=useState(''),[msg,setMsg]=useState(''),[err,setErr]=useState('');
 const t=list.find(x=>x.id===sel)||list[0];
 const store=(next:ColumnTemplate[])=>{const {columnTemplates:_,...rest}=spec;onChange(next.length?{...rest,columnTemplates:next}:rest);};
 const put=(f:(x:ColumnTemplate)=>void)=>{if(!t)return;const x=structuredClone(t);f(x);store(list.map(y=>y.id===t.id?x:y));};
 const row=(k:number,f:(r:ColumnTemplateRow)=>void)=>put(x=>f(x.rows[k]));
 const setRules=(r:ColumnZoneRules)=>{const {columnZoneRules:_,...rest}=spec,same=JSON.stringify(r)===JSON.stringify(DEFAULT_ZONE_RULES);onChange(same?rest:{...rest,columnZoneRules:r});};
 const add=(copy?:ColumnTemplate)=>{
  let n=list.length+1;while(list.some(x=>x.name.toUpperCase()===`C${n}`))n++;
  const x=copy?{...structuredClone(copy),id:newTemplate('').id,name:`${copy.name}-copy`.slice(0,40)}:newTemplate(`C${n}`);
  store([...list,x]);setSel(x.id);
 };
 const remove=()=>{if(t&&confirm(`ลบประเภทเสา ${t.name} จาก Template? เสาที่ผูกไว้จะเลิกปรับตาม (ค่าที่ใส่แล้วยังอยู่)`)){store(list.filter(x=>x.id!==t.id));setSel(list.find(x=>x.id!==t.id)?.id||'');}};
 const rename=(name:string)=>{if(list.some(x=>x.id!==t?.id&&x.name.toUpperCase()===name.trim().toUpperCase()))return setErr(`มีประเภทเสา ${name} แล้ว`);setErr('');put(x=>{x.name=name.slice(0,40);});};
 const shown=list.filter(x=>!filter.trim()||x.name.toUpperCase().includes(filter.trim().toUpperCase()));
 const checks=useMemo(()=>t?t.rows.map((_,k)=>templatePreview(spec,t,k)):[],[spec,t]);
 const num=(v:number,on:(v:number)=>void,label:string,width=64)=><NumInput aria-label={label} type="number" min={0} step="any" style={{width}} disabled={readOnly} value={v} onChange={e=>on(Math.max(0,Number(e.target.value)||0))}/>;
 const int=(v:number,on:(v:number)=>void,label:string,width=46)=><NumInput aria-label={label} type="number" min={0} step={1} style={{width}} disabled={readOnly} value={v} onChange={e=>on(Math.max(0,Math.trunc(Number(e.target.value)||0)))}/>;
 const dsel=(v:number,on:(v:number)=>void,label:string,l=diameters)=><select aria-label={label} disabled={readOnly} value={v} onChange={e=>on(Number(e.target.value))}>{[...new Set([...l,v])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{barName(d)}</option>)}</select>;
 const div=(v:number,on:(v:number)=>void,label:string)=><NumInput aria-label={label} type="number" min={1} max={20} step="any" style={{width:52}} disabled={readOnly} value={v} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=20)on(n);}}/>;
 const rulesRow=(key:'first'|'typical',label:string)=>{const f=zoneFractions(rules,key==='first'),r=rules[key];
  return <tr><td>{label}</td><td>H / {div(r.lower,v=>setRules({...rules,[key]:{...r,lower:v}}),`${label} โซนล่าง`)} <b>= {fractionText(f.lower)}</b> @S2</td><td><b>{fractionText(f.middle)}</b> @S1{f.middle<=0&&<em className="danger-text"> · ไม่มีโซนกลาง</em>}</td><td>H / {div(r.upper,v=>setRules({...rules,[key]:{...r,upper:v}}),`${label} โซนบน`)} <b>= {fractionText(f.upper)}</b> + ความลึกคาน @S2</td></tr>;};
 const importFile=async(file:File)=>{try{setErr('');const r=await importColumnTemplates(file,list);store(r.templates);setSel(r.templates.at(-1)?.id||'');setMsg(`นำเข้า ${file.name}: ${r.notes.join(' · ')} · ตรวจค่าแล้วกด “บันทึก Spec”`);}catch(e:any){setErr(`นำเข้าไม่ได้ · ${e?.message||e}`);}};

 return <Modal title={title} onClose={onClose}>
  <div className="column-templates">
   <p className="muted">ตารางหน้าตัดเสาของโครงการ (ตามตารางเสาในแบบ) · แต่ละประเภทแยกแถวตามช่วงชั้น · ที่หน้าเสากด “เลือกจาก Template โครงการ” เพื่อเติมหน้าตัด เหล็กยืน และเหล็กปลอก · บันทึกพร้อม Spec (กด “บันทึก Spec”)</p>
   <div className="actions ct-tools">
    <button disabled={readOnly||list.length>=300} onClick={()=>add()}><Plus size={14}/>เพิ่มประเภทเสา</button>
    <label className={`button ${readOnly?'disabled':''}`} title="แถวละ 1 ช่วงชั้น · คอลัมน์ตามไฟล์ที่ส่งออก"><Upload size={14}/>นำเข้า Excel<input type="file" accept=".xlsx" hidden disabled={readOnly} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importFile(f);}}/></label>
    <button onClick={()=>void exportColumnTemplates(list,title.replace(/[^\w.-]+/g,'_').slice(0,40)).catch(e=>setErr(String(e?.message||e)))}><Download size={14}/>{list.length?'ส่งออก Excel':'ดาวน์โหลดแบบฟอร์ม Excel'}</button>
    {msg&&<span role="status" className="muted">{msg}</span>}
   </div>
   {err&&<p className="notice danger">{err}</p>}
   <details className="ct-rules" open><summary>กฎโซนเหล็กปลอก (Typical detail column) · H = ความสูงชั้น − ความลึกคาน</summary>
    <table className="subbase-table"><thead><tr><th>ชั้น</th><th>โซนล่าง</th><th>โซนกลาง</th><th>โซนบน</th></tr></thead><tbody>{rulesRow('first','ชั้นแรก (บนฐานราก)')}{rulesRow('typical','ชั้นทั่วไป')}</tbody></table>
    <p className="muted">ค่าเริ่มต้นตามแบบ: ชั้นแรก H/3 · H/2 · H/6 · ชั้นทั่วไป H/6 · 2H/3 · H/6 · ความยาวโซนปัดขึ้นทีละ 50 mm {JSON.stringify(rules)!==JSON.stringify(DEFAULT_ZONE_RULES)&&<button type="button" disabled={readOnly} onClick={()=>setRules(DEFAULT_ZONE_RULES)}>คืนค่าตามแบบ</button>}</p></details>
   <div className="ct-layout">
    <aside className="ct-list" aria-label="ประเภทเสา">
     {list.length>8&&<input placeholder="ค้นหา C1…" value={filter} onChange={e=>setFilter(e.target.value)}/>}
     {shown.map(x=><button key={x.id} className={x.id===t?.id?'active':''} onClick={()=>setSel(x.id)}><b>{x.name}</b><small>{x.rows[0].width} × {x.rows[0].depth} · {x.rows.length} ช่วงชั้น</small></button>)}
     {!list.length&&<p className="muted">ยังไม่มีประเภทเสา · กด “เพิ่มประเภทเสา” หรือนำเข้า Excel</p>}
    </aside>
    {t&&<div className="ct-detail">
     <div className="ct-head">
      {checks[0]&&<TiePlan lay={checks[0].lay} size={104}/>}
      <div className="form-grid">
       <label className="field"><span>ประเภทเสา (Mark)</span><input maxLength={40} disabled={readOnly} value={t.name} onChange={e=>rename(e.target.value)}/></label>
       <label className="field"><span>รูปแบบปลอกใน (ชุดที่ 2)</span><select disabled={readOnly} value={t.pattern} onChange={e=>put(x=>{x.pattern=e.target.value as TiePattern;})}>{tiePatterns.map(p=><option key={p} value={p}>{tiePatternInfo[p].label}</option>)}</select></label>
       <label className="field full"><span>หมายเหตุ (คอนกรีต / เกรดเหล็ก ตามแบบ)</span><input maxLength={300} disabled={readOnly} value={t.note} placeholder="fc' 450 ksc · Y12–Y20 SD40 · Y25–Y32 SD50" onChange={e=>put(x=>{x.note=e.target.value;})}/></label>
      </div>
      <div className="actions"><button disabled={readOnly} onClick={()=>add(t)}><Copy size={14}/>ทำสำเนา</button><button className="danger-text" disabled={readOnly} onClick={remove}><Trash2 size={14}/>ลบ</button></div>
     </div>
     <div className="table-scroll"><table className="subbase-table column-table"><thead><tr><th>ช่วงชั้น (บน → ล่าง)</th><th>ตามตาราง</th><th>ชั้นแรก</th><th>หน้าตัด b × d</th><th>สูงชั้น / คานลึก</th><th>เหล็กมุม (ต่อมุม)</th><th>เหล็กด้าน X / Y</th><th>คู่</th><th>ปลอก · n ชิ้น/ชุด</th><th>S1 / S2</th><th/></tr></thead>
      <tbody>{t.rows.map((_,k)=>t.rows.length-1-k).map(k=>{const r=t.rows[k],c=checks[k];return <tr key={k}>
       <td><input aria-label="ช่วงชั้น" maxLength={40} style={{width:120}} disabled={readOnly} value={r.level} onChange={e=>row(k,x=>{x.level=e.target.value.slice(0,40);})}/></td>
       <td><small>{r.width}×{r.depth}</small><small className="block">{mainText(r)} ({templateMainCount(r)})</small><small className="block">{tieText(r)}</small>
        {c?r.tie.sets>0&&c.pieces!==r.tie.sets&&<small className="block danger-text">รูปแบบที่เลือกได้ {c.pieces} ชิ้น/ชุด</small>:<small className="block danger-text">หน้าตัดเล็กเกินสำหรับเหล็ก</small>}</td>
       <td><input type="checkbox" aria-label="ชั้นแรกบนฐานราก" title="ชั้นแรกบนฐานราก (ใช้กฎโซนชั้นแรก)" disabled={readOnly} checked={r.first} onChange={e=>row(k,x=>{x.first=e.target.checked;})}/></td>
       <td><span className="bar-cell">{num(r.width,v=>row(k,x=>{x.width=v;}),'กว้าง',58)}×{num(r.depth,v=>row(k,x=>{x.depth=v;}),'ลึก',58)}</span></td>
       <td><span className="bar-cell" title="0 = ใช้ค่าของเสาแต่ละต้น">{num(r.height,v=>row(k,x=>{x.height=v;}),'ความสูงชั้น',60)}/{num(r.beamDepth,v=>row(k,x=>{x.beamDepth=v;}),'ความลึกคาน',52)}</span></td>
       {r.layout?<td colSpan={3}><span className="bar-cell" title="ตำแหน่งเหล็กยืนและปลอกในตามรูปหน้าตัดในแบบ (จาก Excel)">{dsel(r.main.corner.diameter,v=>row(k,x=>{x.main.corner.diameter=v;x.main.sideX.diameter=v;x.main.sideY.diameter=v;}),'ขนาดเหล็กยืน')}<small>ตามรูปในแบบ · {templateMainCount(r)} เส้น · ปลอกใน {r.layout.ties.length} วง</small>
        <button type="button" className="icon-button" title="เลิกใช้รูปตามแบบ (กลับไปกำหนดจำนวนเหล็กมุม / ด้าน)" disabled={readOnly} onClick={()=>row(k,x=>{const n=templateMainCount(x),sp=splitMain(n,x.width,x.depth,1);delete x.layout;x.main.corner.count=1;x.main.sideX.count=sp.sideX;x.main.sideY.count=sp.sideY;})}><Trash2 size={13}/></button></span></td>:<>
       <td><span className="bar-cell">{dsel(r.main.corner.diameter,v=>row(k,x=>{x.main.corner.diameter=v;}),'เหล็กมุม')}<select aria-label="จำนวนต่อมุม" disabled={readOnly} value={r.main.corner.count} onChange={e=>row(k,x=>{x.main.corner.count=Number(e.target.value);})}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></span></td>
       <td><span className="bar-cell">{int(r.main.sideX.count,v=>row(k,x=>{x.main.sideX.count=v;}),'เหล็กด้าน X')}/{int(r.main.sideY.count,v=>row(k,x=>{x.main.sideY.count=v;}),'เหล็กด้าน Y')}{dsel(r.main.sideX.diameter,v=>row(k,x=>{x.main.sideX.diameter=v;x.main.sideY.diameter=v;}),'ขนาดเหล็กด้าน')}</span></td>
       <td><input type="checkbox" aria-label="เหล็กด้านมัดคู่" disabled={readOnly} checked={r.main.sideBundle===2} onChange={e=>row(k,x=>{x.main.sideBundle=e.target.checked?2:1;})}/></td></>}
       <td><span className="bar-cell">{dsel(r.tie.diameter,v=>row(k,x=>{x.tie.diameter=v;}),'ขนาดปลอก',tieDiameters)}{int(r.tie.sets,v=>row(k,x=>{x.tie.sets=v;}),'ชิ้นต่อชุด',40)}</span></td>
       <td><span className="bar-cell">{num(r.tie.s1,v=>row(k,x=>{x.tie.s1=v;}),'S1',52)}/{num(r.tie.s2,v=>row(k,x=>{x.tie.s2=v;}),'S2',52)}</span></td>
       <td><span className="bar-cell">
        {k<t.rows.length-1&&<button type="button" className="icon-button" title="เลื่อนขึ้น" disabled={readOnly} onClick={()=>put(x=>{[x.rows[k],x.rows[k+1]]=[x.rows[k+1],x.rows[k]];})}><ArrowUp size={13}/></button>}
        {k>0&&<button type="button" className="icon-button" title="เลื่อนลง" disabled={readOnly} onClick={()=>put(x=>{[x.rows[k],x.rows[k-1]]=[x.rows[k-1],x.rows[k]];})}><ArrowDown size={13}/></button>}
        <button type="button" className="icon-button" aria-label="ลบช่วงชั้น" disabled={readOnly||t.rows.length<2} onClick={()=>put(x=>{x.rows.splice(k,1);})}><Trash2 size={13}/></button></span></td></tr>;})}</tbody></table></div>
     <div className="actions"><button type="button" disabled={readOnly||t.rows.length>=20} onClick={()=>put(x=>{const top=x.rows.at(-1);x.rows.push(top?{...structuredClone(top),level:`ชั้น ${x.rows.length+1}`,first:false}:newTemplateRow());})}><Plus size={14}/>เพิ่มช่วงชั้นด้านบน (คัดลอกแถวบนสุด)</button></div>
     <p className="muted">ปลอก nYd@S1(d@S2): n = จำนวนชิ้นต่อชุด (ใช้ตรวจกับรูปแบบปลอกใน) · S1 โซนกลาง · S2 โซนล่าง/บน · สูงชั้น / คานลึก = 0 ใช้ค่าของเสาแต่ละต้น</p>
    </div>}
   </div>
   <footer className="actions"><span className="muted">{list.length} ประเภทเสา · การแก้ไขบันทึกเมื่อกด “บันทึก Spec” · เสาที่ผูก Template ปรับตามเมื่อ Spec ถูกใช้กับโครงการ</span><button className="primary" onClick={onClose}>เสร็จ</button></footer>
  </div>
 </Modal>;
}
