import {useEffect,useState,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,Plus,Trash2} from 'lucide-react';
import type {Spec} from '../domain/model';
import {CONFIG_BEAM_RULES,DEFAULT_BEAM_RULES,barGrades,gradeBarLabel,gradeOptions,type GradeRow,beamCases,beamNotes,codeInfo,codeList,codeValues,designCodes,endHooks,isCustomCode,lapColumns,lapConcrete,lapGrades,lapTables,stirrupHooks,tableCode,tableOverrides,type BeamCase,type CodeData,type CodeValues,type CustomCode,type DesignCodeId,type Provision} from '../domain/designCodes';

/** onSave: persist the given spec right away (e.g. “บันทึก Grade”); without it changes wait for “บันทึก Spec”. */
type Props={spec:Spec;readOnly:boolean;onChange:(next:Spec)=>void;bs:ReactNode;onSave?:(next:Spec)=>void};
const fmt=(n:number)=>n.toLocaleString('en-US');
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;

/** General Spec · design-code categories (ACI / วสท. / BS / Custom) with the project's choice. */
export function DesignCodeLibrary({spec,readOnly,onChange,bs,onSave}:Props){
 const [view,setView]=useState<DesignCodeId>(spec.designCode||'ACI');
 const [editing,setEditing]=useState(false);
 const used=spec.designCode,ids=codeList(spec),info=codeInfo(spec,view),custom=isCustomCode(view),ownCustom=spec.customCodes?.find(c=>c.id===view);
 // follow the project's code when it changes elsewhere (project form / reload)
 useEffect(()=>{if(used)setView(used);},[used]);
 useEffect(()=>{if(!ids.includes(view))setView(used||'ACI');},[ids.join(),view,used]);
 // values of THIS project: its own overrides (spec.codeData) over the library defaults
 const own:CodeData=spec.codeData?.[view]||{},vals=codeValues(spec.codeData,view);
 const withData=(next:CodeData):Spec=>{const {[view]:_,...others}=spec.codeData||{},data=Object.keys(next).length?{...others,[view]:next}:others;const {codeData:__,...rest}=spec;return Object.keys(data).length?{...rest,codeData:data}:rest;};
 const store=(next:CodeData)=>onChange(withData(next));
 // commit: per-table “บันทึก” — store the patch in this code and save the spec right away (when the page can save)
 const commit=(next:CodeData)=>{const s=withData(next);onChange(s);onSave?.(s);};
 const e:Edit={vals,own,edit:editing&&!readOnly,readOnly,canSave:!!onSave,put:patch=>store({...own,...patch}),reset:key=>{const {[key]:_,...rest}=own;store(rest);},
  commit:patch=>commit({...own,...patch}),commitReset:key=>{const {[key]:_,...rest}=own;commit(rest);}};
 const customCount=tableOverrides(own).length,tables=tableCode(view);
 const setCustom=(patch:Partial<CustomCode>)=>{const list=spec.customCodes||[],cur=list.find(c=>c.id===view)||{id:view as CustomCode['id'],name:info.label,note:''};onChange({...spec,customCodes:[...list.filter(c=>c.id!==view),{...cur,...patch}]});};
 const addCustom=()=>{const id=`Custom-${crypto.randomUUID().replace(/-/g,'').slice(0,8)}` as CustomCode['id'];onChange({...spec,customCodes:[...(spec.customCodes||[]),{id,name:`Custom ${ids.filter(isCustomCode).length+1}`,note:''}]});setView(id);setEditing(true);};
 const removeCustom=()=>{if(!confirm(`ลบ “${info.label}” และค่าที่ปรับ/ข้อกำหนดเพิ่มเติมทั้งหมดของหมวดนี้?`))return;const {[view]:_,...data}=spec.codeData||{},{codeData:__,customCodes:___,...rest}=spec,list=(spec.customCodes||[]).filter(c=>c.id!==view);onChange({...rest,...(list.length?{customCodes:list}:{}),...(Object.keys(data).length?{codeData:data}:{})});setView(used||'ACI');};
 return <section className="panel padded code-library">
  <div className="section-heading"><div><h3>มาตรฐานออกแบบของ Spec ชุดนี้</h3><p className="muted">เลือกหมวดมาตรฐานที่ Spec ชุดนี้ใช้ · ข้อกำหนดแต่ละหมวดแยกกัน · เพิ่มข้อกำหนดอื่นได้ในทุกหมวด</p></div>
   <span className={`code-chosen ${used?'':'empty'}`}>{used?<>หมวดที่ใช้: <b>{codeInfo(spec,used).label}</b></>:'ยังไม่เลือกมาตรฐาน'}</span></div>
  <div className="code-cards" role="tablist" aria-label="หมวดมาตรฐาน">{ids.map(id=>{const c=codeInfo(spec,id);return <button key={id} role="tab" aria-selected={view===id} className={`code-card ${view===id?'active':''} ${used===id?'used':''}`} onClick={()=>setView(id)}>
   <span className="code-card-badge">{id==='EIT'?'วสท.':isCustomCode(id)?'Custom':id}</span><b>{c.label}</b><small>{c.sub}</small>{used===id&&<em>ใช้ใน Spec นี้</em>}</button>;})}
   {!readOnly&&<button type="button" className="code-card code-card-add" onClick={addCustom} disabled={(spec.customCodes||[]).length>=20}><Plus size={18}/><b>เพิ่ม Custom</b><small>สำเนา ACI Code · ตั้งชื่อตามโครงการ</small></button>}</div>
  <div className="code-view-head"><div><h4>{info.label} · {info.sub}</h4><p className="muted">{info.note}</p></div>
   <div className="actions">{tables&&<><button className={editing?'active':''} disabled={readOnly} onClick={()=>setEditing(!editing)}>{editing?'เสร็จสิ้นการแก้ไขค่าคาน':'แก้ไขค่าการเสริมเหล็กคาน'}</button>
    {customCount>0&&<button disabled={readOnly} onClick={()=>{if(confirm('คืนค่ามาตรฐานทั้งหมดของหมวดนี้ (ใน Spec ชุดนี้)?'))store(own.provisions?{provisions:own.provisions}:{});}}>คืนค่ามาตรฐานทั้งหมด</button>}</>}
    {view!=='Custom'&&custom&&<button className="danger-text" disabled={readOnly||used===view} title={used===view?'เปลี่ยนหมวดที่ใช้ก่อนลบ':''} onClick={removeCustom}><Trash2 size={14}/>ลบหมวดนี้</button>}
    <button className={used===view?'':'primary'} disabled={readOnly||used===view} onClick={()=>onChange({...spec,designCode:view})}>{used===view?'ใช้หมวดนี้อยู่':'ใช้หมวดนี้ใน Spec ชุดนี้'}</button></div></div>
  {custom&&<div className="form-grid code-custom-name"><label className="field"><span>ชื่อมาตรฐาน (เช่น ชื่อโครงการ)</span><input maxLength={80} disabled={readOnly} value={ownCustom?.name??info.label} onChange={ev=>setCustom({name:ev.target.value})} onBlur={ev=>{if(!ev.target.value.trim())setCustom({name:designCodes.Custom.label});}}/></label>
   <label className="field"><span>คำอธิบาย / เอกสารอ้างอิง</span><input maxLength={500} disabled={readOnly} value={ownCustom?.note||''} placeholder={designCodes.Custom.note} onChange={ev=>setCustom({note:ev.target.value})}/></label></div>}
  {tables&&<p className={`code-scope ${customCount?'custom':''}`}>{customCount?`Spec ชุดนี้ปรับค่าเอง ${customCount} ตาราง (ช่องสีส้ม) · มีผลกับทุกโครงการที่เลือกใช้ Spec ชุดนี้`:custom?'เริ่มจากค่าตาราง ACI Code · กด “แก้ไขตาราง” ที่แต่ละตารางเพื่อปรับค่า / เพิ่มขนาดเหล็ก แล้วกด “บันทึก”':'ใช้ค่ามาตรฐานจากไลบรารี · กด “แก้ไขตาราง” ที่แต่ละตาราง แล้ว “บันทึก” เฉพาะ Spec ชุดนี้'}</p>}
  {(view==='ACI'||custom)&&<AciLibrary e={e} source={custom?`${info.label} (เริ่มจาก ACI 318)`:undefined}/>}
  {view==='EIT'&&<><HooksSection e={e} source="ข้อมูลตาม วสท."/><p className="notice">หมวด วสท. จะเพิ่มตารางระยะทาบ / การเสริมเหล็กตามมาตรฐาน วสท. ในรุ่นถัดไป · เพิ่มข้อกำหนดอื่นได้ด้านล่าง</p></>}
  {view==='BS'&&bs}
  <GradeSection key={view} rows={vals.grades} custom={vals.custom.grades} label={info.label} readOnly={readOnly} canSave={!!onSave}
   onSave={grades=>{const {grades:_,...rest}=own,next=withData(grades?{...rest,grades}:rest);onChange(next);onSave?.(next);}}/>
  <Provisions items={own.provisions||[]} readOnly={readOnly} label={info.label} onChange={list=>{const {provisions:_,...rest}=own;store(list.length?{...rest,provisions:list}:rest);}}/>
  <p className="muted">การเปลี่ยนแปลงจะบันทึกเมื่อกด “บันทึก Spec” · โครงการที่เลือกใช้ Spec ชุดนี้จะถูกปรับตาม · ตารางเป็นข้อมูลอ้างอิงสำหรับการให้รายละเอียดเหล็ก ต้องตรวจกับแบบและวิศวกรผู้ออกแบบ</p>
 </section>;
}

/** Steel grade per bar size for one code. Own edit / save buttons: “บันทึก Grade” stores the table in this
 * code of the spec and saves the spec (linked projects follow). grades undefined = back to the standard table. */
function GradeSection({rows,custom,label,readOnly,canSave,onSave}:{rows:GradeRow[];custom:boolean;label:string;readOnly:boolean;canSave:boolean;onSave:(grades:GradeRow[]|undefined)=>void}){
 const [draft,setDraft]=useState<GradeRow[]|null>(null),list=draft||rows;
 const put=(i:number,patch:Partial<GradeRow>)=>setDraft(list.map((r,k)=>k===i?{...r,...patch}:r));
 const valid=list.length>0&&list.every(r=>r.bar>0&&r.bar<=60&&Number.isInteger(r.bar)&&r.grade.trim())&&new Set(list.map(r=>r.bar)).size===list.length;
 const save=()=>{if(!draft||!valid)return;const sorted=[...draft].map(r=>({bar:r.bar,grade:r.grade.trim()})).sort((a,b)=>a.bar-b.bar),same=sorted.length===barGrades.length&&sorted.every((r,k)=>r.bar===barGrades[k].bar&&r.grade===barGrades[k].grade);onSave(same?undefined:sorted);setDraft(null);};
 return <div className="code-block code-grades">
  <div className="code-block-head"><h5>STEEL GRADE · เกรดเหล็กตามขนาด · {label}</h5><small>{custom?<b className="code-own">ค่าปรับใน Spec นี้</b>:'ค่ามาตรฐาน'}</small>
   {!readOnly&&(draft?<span className="actions"><button type="button" className="primary" disabled={!valid} onClick={save}>{canSave?'บันทึก Grade':'ใช้ค่า Grade'}</button><button type="button" onClick={()=>setDraft(null)}>ยกเลิก</button></span>
    :<span className="actions"><button type="button" className="code-reset" onClick={()=>setDraft(rows.map(r=>({...r})))}>แก้ไข Grade</button>{custom&&<button type="button" className="code-reset" onClick={()=>{if(confirm(`คืนตาราง Grade มาตรฐานของ ${label}?`))onSave(undefined);}}>คืนค่ามาตรฐาน</button>}</span>)}</div>
  <div className="table-scroll"><table className="code-table grade-table"><thead><tr><th>Dia. (mm.)</th><th>Grade</th>{draft&&<th/>}</tr></thead>
   <tbody>{list.map((r,i)=><tr key={i}><th>{draft?<input aria-label="ขนาดเหล็ก mm" type="number" min={1} max={60} value={r.bar} onChange={ev=>put(i,{bar:Math.trunc(Number(ev.target.value)||0)})}/>:gradeBarLabel(r.bar)}</th>
    <td className={custom&&barGrades.find(b=>b.bar===r.bar)?.grade!==r.grade?'custom':''}>{draft?<><input aria-label={`เกรด ${gradeBarLabel(r.bar)}`} list="grade-options" maxLength={20} value={r.grade} onChange={ev=>put(i,{grade:ev.target.value.toUpperCase()})}/></>:r.grade}</td>
    {draft&&<td><button type="button" className="danger-text" title="ลบแถว" disabled={list.length===1} onClick={()=>setDraft(list.filter((_,k)=>k!==i))}><Trash2 size={14}/></button></td>}</tr>)}</tbody></table></div>
  <datalist id="grade-options">{gradeOptions.map(g=><option key={g} value={g}/>)}</datalist>
  {draft&&<><button type="button" disabled={list.length>=30} onClick={()=>setDraft([...list,{bar:Math.min(60,Math.max(0,...list.map(r=>r.bar))+4),grade:'SD50'}])}><Plus size={14}/>เพิ่มขนาด</button>
   {!valid&&<p className="notice warning">ระบุขนาด (1–60 mm ไม่ซ้ำ) และเกรดให้ครบทุกแถว</p>}
   <p className="muted">{canSave?'กด “บันทึก Grade” เพื่อบันทึกลงหมวดนี้ของ Spec ทันที · โครงการที่ใช้ Spec นี้จะถูกปรับตาม':'กด “ใช้ค่า Grade” แล้วกด “บันทึก Spec”'}</p></>}
 </div>;
}

/** Additional provisions of one code: free list of topic / value / details. */
function Provisions({items,readOnly,label,onChange}:{items:Provision[];readOnly:boolean;label:string;onChange:(next:Provision[])=>void}){
 const put=(i:number,patch:Partial<Provision>)=>onChange(items.map((p,k)=>k===i?{...p,...patch}:p));
 const move=(i:number,d:number)=>{const j=i+d;if(j<0||j>=items.length)return;const next=[...items];[next[i],next[j]]=[next[j],next[i]];onChange(next);};
 return <div className="code-block code-provisions">
  <div className="code-block-head"><h5>ข้อกำหนดอื่นเพิ่มเติม · {label}</h5><small>{items.length?`${items.length} รายการ`:'ยังไม่มีรายการ'}</small>
   {!readOnly&&<button type="button" className="code-reset" disabled={items.length>=200} onClick={()=>onChange([...items,{id:crypto.randomUUID().slice(0,8),title:'',value:'',detail:''}])}><Plus size={14}/>เพิ่มข้อกำหนด</button>}</div>
  {items.length?<div className="table-scroll"><table className="code-table provisions-table"><thead><tr><th>#</th><th>หัวข้อ / ข้อกำหนด</th><th>ค่า / เกณฑ์</th><th>รายละเอียด / อ้างอิง</th>{!readOnly&&<th/>}</tr></thead>
   <tbody>{items.map((p,i)=><tr key={p.id}><th>{i+1}</th>
    <td>{readOnly?p.title:<input aria-label="หัวข้อข้อกำหนด" maxLength={200} value={p.title} placeholder="เช่น ระยะหุ้มคอนกรีต ฐานราก" onChange={ev=>put(i,{title:ev.target.value})}/>}</td>
    <td>{readOnly?p.value:<input aria-label="ค่าข้อกำหนด" maxLength={200} value={p.value} placeholder="เช่น 75 mm" onChange={ev=>put(i,{value:ev.target.value})}/>}</td>
    <td>{readOnly?p.detail:<textarea aria-label="รายละเอียดข้อกำหนด" rows={1} maxLength={4000} value={p.detail} onChange={ev=>put(i,{detail:ev.target.value})}/>}</td>
    {!readOnly&&<td className="provision-actions"><button type="button" title="เลื่อนขึ้น" disabled={!i} onClick={()=>move(i,-1)}><ArrowUp size={14}/></button><button type="button" title="เลื่อนลง" disabled={i===items.length-1} onClick={()=>move(i,1)}><ArrowDown size={14}/></button><button type="button" title="ลบ" className="danger-text" onClick={()=>onChange(items.filter((_,k)=>k!==i))}><Trash2 size={14}/></button></td>}</tr>)}</tbody></table></div>
  :<p className="muted">เพิ่มข้อกำหนดเฉพาะของหมวดนี้ เช่น ระยะหุ้มคอนกรีต ตำแหน่งต่อทาบ ข้อกำหนดผู้ออกแบบ · ใช้เป็นข้อมูลอ้างอิงของ Spec</p>}
 </div>;
}

type Edit={vals:CodeValues;own:CodeData;edit:boolean;readOnly:boolean;canSave:boolean;put:(patch:CodeData)=>void;reset:(key:keyof CodeData)=>void;commit:(patch:CodeData)=>void;commitReset:(key:keyof CodeData)=>void};
type BarRow={bar:number}&Record<string,number>;
/** Standard table by bar size with its own buttons: แก้ไข → edit cells / bar sizes, เพิ่มแถว, ลบแถว → บันทึก (sorted by
 * size, saved to this code of the spec) or ยกเลิก. Values differing from the library (`base`) are highlighted. */
function BarTable<R extends {bar:number}>({rows,base,cols,head,label,selected,onSelect,e,custom,onSave,onReset,maxRows=30}:{rows:R[];base:R[];cols:(keyof R&string)[];head:ReactNode;label:(bar:number)=>string;selected:number;onSelect:(bar:number)=>void;e:Edit;custom:boolean;onSave:(rows:R[])=>void;onReset:()=>void;maxRows?:number}){
 const [draft,setDraft]=useState<R[]|null>(null),list=draft||rows;
 const put=(i:number,f:keyof R,v:number)=>setDraft(list.map((r,k)=>k===i?{...r,[f]:v}:r));
 const sizes=list.map(r=>r.bar),valid=list.length>0&&sizes.every(b=>Number.isFinite(b)&&b>0&&b<=100)&&new Set(sizes).size===sizes.length;
 const add=()=>{const last=list.at(-1)!;setDraft([...list,{...last,bar:Math.min(100,Math.max(...sizes)+4)}]);};
 const save=()=>{if(!draft||!valid)return;onSave([...draft].sort((a,b)=>a.bar-b.bar));setDraft(null);};
 const changed=(r:R,f:keyof R)=>(base as BarRow[]).find(b=>b.bar===r.bar)?.[f as string]!==(r as unknown as BarRow)[f as string];
 return <>
  {!e.readOnly&&<div className="actions table-tools">{draft?<><button type="button" className="primary" disabled={!valid} onClick={save}>{e.canSave?'บันทึก':'ใช้ค่า'}</button><button type="button" disabled={list.length>=maxRows} onClick={add}><Plus size={14}/>เพิ่มแถว</button><button type="button" onClick={()=>setDraft(null)}>ยกเลิก</button>
    {!valid&&<span className="code-own">ขนาดเหล็กต้องไม่ซ้ำ และอยู่ระหว่าง 1–100 mm</span>}</>
   :<><button type="button" onClick={()=>setDraft(rows.map(r=>({...r})))}>แก้ไขตาราง</button>{custom&&<button type="button" className="code-reset" onClick={()=>{if(confirm('คืนค่ามาตรฐานของตารางนี้?'))onReset();}}>คืนค่ามาตรฐาน</button>}</>}</div>}
  <div className="table-scroll"><table className="code-table">{head}
   <tbody>{list.map((r,k)=><tr key={draft?k:r.bar} className={r.bar===selected?'selected':''} onClick={()=>onSelect(r.bar)}>
    <th>{draft?<input aria-label="ขนาดเหล็ก mm" type="number" min={1} max={100} value={r.bar} onClick={ev=>ev.stopPropagation()} onChange={ev=>put(k,'bar',Math.trunc(Number(ev.target.value)||0))}/>:label(r.bar)}</th>
    {cols.map(f=><td key={f} className={changed(r,f)?'custom':''}>{draft?<input type="number" min={0} value={r[f] as number} onClick={ev=>ev.stopPropagation()} onChange={ev=>put(k,f,Math.max(0,Number(ev.target.value)||0))}/>:fmt(r[f] as number)}</td>)}
    {draft&&<td><button type="button" className="danger-text" title="ลบแถว" disabled={list.length===1} onClick={ev=>{ev.stopPropagation();setDraft(list.filter((_,i)=>i!==k));}}><Trash2 size={14}/></button></td>}</tr>)}</tbody></table></div>
  {draft&&<p className="muted">{e.canSave?'กด “บันทึก” เพื่อบันทึกตารางนี้ลง Spec ทันที · โครงการที่ใช้ Spec นี้จะถูกปรับตาม':'กด “ใช้ค่า” แล้วกด “บันทึก Spec”'} · เรียงตามขนาดเหล็กอัตโนมัติ</p>}
 </>;
}
function ResetButton({e,k,custom}:{e:Edit;k:keyof CodeData;custom:boolean}){
 return custom?<button type="button" className="code-reset" disabled={!e.edit} onClick={()=>e.reset(k)} title="คืนค่ามาตรฐานของตารางนี้">คืนค่ามาตรฐาน</button>:null;
}

function AciLibrary({e,source}:{e:Edit;source?:string}){
 const [tab,setTab]=useState<'hooks'|'lap'|'beam'>('hooks');
 const tabs=[['hooks','1. Standard Hooks'],['lap','2. Lap Length for Splices of Bars'],['beam','3. การเสริมเหล็กคาน']] as const;
 return <>
  <div className="segmented code-tabs" role="tablist">{tabs.map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
  {tab==='hooks'&&<HooksSection e={e} source={source||'ข้อมูลตาม วสท. (ใช้อ้างอิงร่วมกับ ACI 318)'}/>}
  {tab==='lap'&&<LapSection e={e} source={source}/>}
  {tab==='beam'&&<BeamSection e={e} source={source}/>}
 </>;
}

// ---------------- Standard hooks ----------------
export function HooksSection({source,e}:{source:string;e:Edit}){
 const [bar,setBar]=useState(20),[tie,setTie]=useState(12);
 const hooks=e.vals.endHooks,ties=e.vals.stirrupHooks;
 const r=hooks.find(h=>h.bar===bar)||hooks[0],t=ties.find(h=>h.bar===tie)||ties[0];

 return <div className="code-section">
  <div className="code-block"><div className="code-block-head"><h5>TABLE · STANDARD HOOKS · RECOMMENDED END HOOKS, ALL GRADES</h5><small>{source}{e.vals.custom.endHooks&&<b className="code-own"> · ค่าปรับใน Spec นี้</b>}</small></div>
   <BarChips sizes={hooks.map(h=>h.bar)} value={r.bar} onChange={setBar}/>
   <div className="code-graphics">
    <figure><Hook180 r={r}/><figcaption>180° · 4d<sub>b</sub> หรือ 70 mm (min.)</figcaption></figure>
    <figure><Hook90 r={r}/><figcaption>90° · 12d<sub>b</sub></figcaption></figure>
   </div>
   <BarTable rows={hooks} base={endHooks} cols={['D','a180','j180','a90']} label={String} selected={r.bar} onSelect={setBar} e={e} custom={e.vals.custom.endHooks} onSave={rows=>e.commit({endHooks:rows})} onReset={()=>e.commitReset('endHooks')}
    head={<thead><tr><th rowSpan={2}>BAR SIZE (mm)</th><th rowSpan={2}>FINISHED BEND DIAMETER D (mm)</th><th colSpan={2}>180-DEG HOOKS</th><th>90-DEG HOOKS</th></tr><tr><th>A OR G (mm)</th><th>J (mm)</th><th>A OR G (mm)</th></tr></thead>}/>
   <p className="muted">d<sub>b</sub> = Nominal diameter of bar, wire, or prestressing strand (mm)</p></div>
  <div className="code-block"><div className="code-block-head"><h5>STIRRUP AND TIE HOOKS, ALL GRADES</h5><small>{source}{e.vals.custom.stirrupHooks&&<b className="code-own"> · ค่าปรับใน Spec นี้</b>}</small></div>
   <BarChips sizes={ties.map(h=>h.bar)} value={t.bar} onChange={setTie}/>
   <div className="code-graphics three">
    <figure><Stirrup90 t={t}/><figcaption>90° · GENERAL USE<br/><small>12d<sub>b</sub> สำหรับ DB20, DB25, DB32 · 6d<sub>b</sub> สำหรับ RB9, DB12, DB16</small></figcaption></figure>
    <figure><Stirrup135 t={t} seismic={false}/><figcaption>135° · GENERAL USE (6d<sub>b</sub>)</figcaption></figure>
    <figure><Stirrup135 t={t} seismic/><figcaption>135° · SEISMIC USE (10d<sub>b</sub>)</figcaption></figure>
   </div>
   <BarTable rows={ties} base={stirrupHooks} cols={['D','a90','a135','h135','a135s','h135s']} label={String} selected={t.bar} onSelect={setTie} e={e} custom={e.vals.custom.stirrupHooks} onSave={rows=>e.commit({stirrupHooks:rows})} onReset={()=>e.commitReset('stirrupHooks')}
    head={<thead><tr><th rowSpan={3}>BAR SIZE (mm)</th><th rowSpan={3}>D (mm)</th><th colSpan={3}>GENERAL USE</th><th colSpan={2} className="seismic">SEISMIC USE</th></tr>
    <tr><th>90-DEG HOOKS</th><th colSpan={2}>135-DEG HOOKS</th><th colSpan={2} className="seismic">135-DEG HOOKS</th></tr>
    <tr><th>A OR G (mm)</th><th>A OR G (mm)</th><th>H, APPROX. (mm)</th><th className="seismic">A OR G (mm)</th><th className="seismic">H, APPROX. (mm)</th></tr></thead>}/></div>
 </div>;
}
function BarChips({sizes,value,onChange,prefix=false}:{sizes:number[];value:number;onChange:(n:number)=>void;prefix?:boolean}){
 return <div className="bar-chips" role="radiogroup" aria-label="ขนาดเหล็ก">{sizes.map(s=><button key={s} type="button" role="radio" aria-checked={s===value} className={s===value?'active':''} onClick={()=>onChange(s)}>{prefix?barName(s):`Ø${s}`}</button>)}</div>;
}
const C={bar:'#167561',dim:'#5f7378',text:'#2d4b52',accent:'#c2410c'};
function Dim({x1,y1,x2,y2,label,side=-1}:{x1:number;y1:number;x2:number;y2:number;label:string;side?:number}){
 const v=Math.abs(x1-x2)<.5,mx=(x1+x2)/2,my=(y1+y2)/2;
 return <g className="dim"><line x1={x1} y1={y1} x2={x2} y2={y2}/>{[[x1,y1],[x2,y2]].map(([x,y],k)=><line key={k} x1={x-3} y1={y+3} x2={x+3} y2={y-3}/>)}
  <text x={v?mx+side*6:mx} y={v?my:my+side*5} textAnchor={v?(side<0?'end':'start'):'middle'} dominantBaseline={v?'middle':side<0?'auto':'hanging'}>{label}</text></g>;
}
function Hook180({r}:{r:typeof endHooks[number]}){
 const x=70,rad=26,top=70,end=top+46;
 return <svg viewBox="0 0 220 230" className="code-svg" role="img" aria-label="180 degree hook">
  <path d={`M${x} 205 V${top} A${rad} ${rad} 0 0 1 ${x+2*rad} ${top} V${end}`} stroke={C.bar} strokeWidth={7} fill="none" strokeLinecap="round"/>
  <line x1={x} y1={top-rad-4} x2={x} y2={18} stroke={C.bar} strokeWidth={1.2} strokeDasharray="4 3"/>
  <circle cx={x+rad} cy={top} r={rad-7} fill="none" stroke={C.dim} strokeDasharray="3 2"/><text x={x+rad} y={top+3} textAnchor="middle" className="svg-small">D={r.D}</text>
  <Dim x1={x-22} y1={top-rad-4} x2={x-22} y2={205} label={`A/G ${r.a180}`}/>
  <Dim x1={x-4} y1={top+rad+90} x2={x+2*rad+4} y2={top+rad+90} label={`J ${r.j180}`} side={1}/>
  <Dim x1={x+2*rad+22} y1={top} x2={x+2*rad+22} y2={end} label="4db / 70" side={1}/>
 </svg>;
}
function Hook90({r}:{r:typeof endHooks[number]}){
 const x=50,rad=22,y=80;
 return <svg viewBox="0 0 220 230" className="code-svg" role="img" aria-label="90 degree hook">
  <path d={`M${x} 205 V${y+rad} A${rad} ${rad} 0 0 1 ${x+rad} ${y} H${x+150}`} stroke={C.bar} strokeWidth={7} fill="none" strokeLinecap="round"/>
  <circle cx={x+rad} cy={y+rad} r={rad-7} fill="none" stroke={C.dim} strokeDasharray="3 2"/><text x={x+rad} y={y+rad+3} textAnchor="middle" className="svg-small">D={r.D}</text>
  <Dim x1={x-4} y1={y+70} x2={x+154} y2={y+70} label={`A/G ${r.a90}`} side={1}/>
  <Dim x1={x+rad} y1={y-18} x2={x+150} y2={y-18} label={`12db = ${12*r.bar}`}/>
 </svg>;
}
function Stirrup90({t}:{t:typeof stirrupHooks[number]}){
 const x=60,rad=16,y=60;
 return <svg viewBox="0 0 200 210" className="code-svg" role="img" aria-label="stirrup 90 degree hook">
  <path d={`M${x+110} 190 H${x+rad} A${rad} ${rad} 0 0 1 ${x} ${190-rad} V${y+rad} A${rad} ${rad} 0 0 1 ${x+rad} ${y} H${x+80}`} stroke={C.bar} strokeWidth={6} fill="none" strokeLinecap="round"/>
  <Dim x1={x-4} y1={y+40} x2={x+84} y2={y+40} label={`A/G ${t.a90}`} side={1}/>
  <text x={x+40} y={y-10} className="svg-small" textAnchor="middle">D={t.D}</text>
 </svg>;
}
function Stirrup135({t,seismic}:{t:typeof stirrupHooks[number];seismic:boolean}){
 // bar rises, wraps clockwise 135° over the top and leaves down-right (6db / 10db extension)
 const x=60,rad=16,y=60,cy=y+rad,len=seismic?70:48,a=Math.SQRT1_2,ex=x+rad+rad*a,ey=cy-rad*a,hx=ex+len*a,hy=ey+len*a;
 const a135=seismic?t.a135s:t.a135,h=seismic?t.h135s:t.h135;
 return <svg viewBox="0 0 200 210" className="code-svg" role="img" aria-label="stirrup 135 degree hook">
  <path d={`M${x} 190 V${cy} A${rad} ${rad} 0 0 1 ${ex} ${ey} L${hx} ${hy}`} stroke={seismic?C.accent:C.bar} strokeWidth={6} fill="none" strokeLinecap="round"/>
  <Dim x1={x-16} y1={y-3} x2={x-16} y2={190} label={`A/G ${a135}`}/>
  <Dim x1={hx+18} y1={y-3} x2={hx+18} y2={hy} label={`H ${h}`} side={1}/>
  <text x={x+rad} y={y-8} className="svg-small" textAnchor="middle">{seismic?'10db':'6db'} · D={t.D}</text>
 </svg>;
}

// ---------------- Lap length ----------------
export function LapSection({e,source='ข้อมูลตาม ACI 318'}:{e:Edit;source?:string}){
 const [fc,setFc]=useState<number>(28),[grade,setGrade]=useState<string>('SD40'),[bar,setBar]=useState(20);
 const key=`${fc}-${grade}`,table=e.vals.lap[key],base=lapTables[key],row=table.find(r=>r.bar===bar)||table[0],max=Math.max(1,...table.map(r=>r.ftlTop)),custom=e.vals.custom.lap.includes(key);
 const groups=lapColumns.reduce<{group:string;n:number}[]>((g,c)=>{const last=g.at(-1);if(last?.group===c.group)last.n++;else g.push({group:c.group,n:1});return g;},[]);
 const resetTable=()=>{const {[key]:_,...rest}=e.own.lap||{};if(Object.keys(rest).length)e.commit({lap:rest});else e.commitReset('lap');};
 return <div className="code-section"><div className="code-block">
  <div className="code-block-head"><h5>LAP LENGTH FOR SPLICES OF BARS</h5><small>{source}{custom&&<b className="code-own"> · ค่าปรับใน Spec นี้ (f'c {fc} · {grade})</b>}</small></div>
  <div className="lap-filters">
   <div><span>f'c (MPa)</span><div className="segmented">{lapConcrete.map(v=><button key={v} className={fc===v?'active':''} onClick={()=>setFc(v)}>{v} MPa</button>)}</div></div>
   <div><span>เกรดเหล็ก</span><div className="segmented">{lapGrades.map(v=><button key={v} className={grade===v?'active':''} onClick={()=>setGrade(v)}>{v} ({v}T)</button>)}</div></div>
   <div><span>ขนาดเหล็ก</span><BarChips sizes={table.map(r=>r.bar)} value={row.bar} onChange={setBar} prefix/></div>
  </div>
  <div className="lap-visual">
   <LapDiagram row={row}/>
   <div className="lap-chart" aria-label="เปรียบเทียบระยะทาบ"><b>FTL TENSION / FTL TOP · f'c {fc} MPa · {grade}</b>{table.map(r=><div key={r.bar} className={`lap-bar ${r.bar===row.bar?'active':''}`} onClick={()=>setBar(r.bar)}><span>{barName(r.bar)}</span><div><i style={{width:`${r.ftlTension/max*100}%`}}/><i className="top" style={{width:`${(r.ftlTop-r.ftlTension)/max*100}%`}}/></div><em>{fmt(r.ftlTension)} / {fmt(r.ftlTop)}</em></div>)}</div>
  </div>
  <p className="lap-title">FOR f'c = {fc} MPa AND {grade} ({grade}T) REBAR</p>
  <BarTable key={key} maxRows={20} rows={table} base={base} cols={lapColumns.map(c=>c.key)} label={barName} selected={row.bar} onSelect={setBar} e={e} custom={custom} onSave={rows=>e.commit({lap:{...e.own.lap,[key]:rows}})} onReset={resetTable}
   head={<thead><tr><th rowSpan={2}>REBAR SIZE</th>{groups.map(g=><th key={g.group} colSpan={g.n}>{g.group}</th>)}</tr><tr>{lapColumns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>}/>
  <p className="muted">หน่วย mm · TOP REINF = เหล็กบน (Top bar) · ใช้ร่วมกับรายละเอียดการเสริมเหล็กคาน (F.T.A. / Standard hook)</p>
 </div></div>;
}
function LapDiagram({row}:{row:typeof lapTables[string][number]}){
 return <svg viewBox="0 0 460 210" className="code-svg lap-svg" role="img" aria-label="lap splice and anchorage">
  <text x={10} y={18} className="svg-head">FULL TENSION LAP (F.T.L.)</text>
  <line x1={20} y1={52} x2={300} y2={52} stroke={C.bar} strokeWidth={7} strokeLinecap="round"/>
  <line x1={160} y1={64} x2={440} y2={64} stroke={C.accent} strokeWidth={7} strokeLinecap="round"/>
  <Dim x1={160} y1={82} x2={300} y2={82} label={`FTL ${fmt(row.ftlTension)} · TOP ${fmt(row.ftlTop)}`} side={1}/>
  <text x={10} y={124} className="svg-head">ANCHORAGE (F.T.A. / S.H.A.)</text>
  <rect x={20} y={134} width={70} height={66} className="svg-support"/>
  <path d="M440 150 H34 V196" stroke={C.bar} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  <Dim x1={90} y1={140} x2={440} y2={140} label={`FTA ${fmt(row.ftaTension)} · TOP ${fmt(row.ftaTop)}`}/>
  <Dim x1={90} y1={166} x2={34} y2={166} label={`SHA ${fmt(row.sha)}`} side={1}/>
  <text x={300} y={190} className="svg-small">FCA {fmt(row.fca)} · FCL {fmt(row.fcl)}</text>
 </svg>;
}

// ---------------- Beam details ----------------
export function BeamSection({e,source='ACI 318'}:{e:Edit;source?:string}){
 const [L,setL]=useState(6000),rules=e.vals.beam;
 const v=(f:number)=>L>0?` = ${fmt(Math.round(f*L/25)*25)}`:'';
 const cards:{n:number;node:ReactNode;title:string;caseLabel?:string}[]=[...beamCases.map(c=>({n:c.n,title:c.title,caseLabel:c.caseLabel,node:<BeamElevation c={c} v={v} rules={rules}/>})),{n:8,title:'BEAM AT DIFFERENT LEVEL',node:<BeamStep/>},{n:9,title:'TYPICAL BEAM CROSS SECTION',node:<BeamSectionSvg/>}].sort((a,b)=>a.n-b.n);
 const rule=(k:keyof typeof rules,label:string)=><label key={k} className={`field ${rules[k]!==DEFAULT_BEAM_RULES[k]?'custom':''}`}><span>{label} (× L)</span><input type="number" step={0.005} min={0} max={2} disabled={!e.edit} value={rules[k]} onChange={ev=>e.put({beam:{...rules,[k]:Math.min(2,Math.max(0,Number(ev.target.value)||0))}})}/></label>;
 return <div className="code-section"><div className="code-block">
  <div className="code-block-head"><h5>การเสริมเหล็กคาน · TYPICAL BEAM REINFORCEMENT DETAILS</h5><small>{source}{e.vals.custom.beam&&<b className="code-own"> · ค่าปรับใน Spec นี้</b>}</small><ResetButton e={e} k="beam" custom={e.vals.custom.beam}/></div>
  <div className="form-grid beam-rules"><label className="field"><span>ช่วงคานสุทธิ L (mm) · ใช้แสดงค่าในรูป</span><input type="number" value={L} min={0} onChange={ev=>setL(Math.max(0,Number(ev.target.value)||0))}/></label>
   {rule('topEnd','เหล็กบน EX ปลายไม่ต่อเนื่อง (END)')}{rule('topCont','เหล็กบน EX ปลายต่อเนื่อง (CON, × La)')}{rule('bottomZone','ระยะจากผิวที่รองรับ (ล่าง)')}
   {rule('bottomEnd','เหล็กล่าง EX กลางช่วง: เริ่มจากปลาย END')}{rule('bottomCont','เหล็กล่าง EX กลางช่วง: เริ่มจากปลาย CON')}{rule('stirrupZone','ช่วงปลอกถี่ END / CON')}
   <div className="field"><span>ค่าสำเร็จรูป</span><div className="actions"><button type="button" disabled={!e.edit} onClick={()=>e.put({beam:{...DEFAULT_BEAM_RULES}})}>ACI (0.25L / 0.3L)</button><button type="button" disabled={!e.edit} onClick={()=>e.put({beam:{...CONFIG_BEAM_RULES}})} title="L1/3 · La/3 · L/8 · L/10 · ปลอกถี่ L/4">Beam configuration (L/3)</button></div></div></div>
  <div className="beam-grid">{cards.map(c=><figure key={c.n} className="beam-card"><span className="beam-no">{c.n}</span>{c.node}<figcaption>{c.caseLabel&&<u>{c.caseLabel}</u>}{c.title}</figcaption></figure>)}</div>
  <ol className="beam-notes">{beamNotes.map(n=><li key={n}>{n}</li>)}</ol>
 </div></div>;
}
const W={cant:80,sup:20,span:230,next:66};
function BeamElevation({c,v,rules}:{c:BeamCase;v:(f:number)=>string;rules:CodeValues['beam']}){
 // library fractions 0.25 / 0.3 stand for this project's discontinuous / continuous top-bar rule
 const fr=(f:number)=>f<.275?rules.topEnd:rules.topCont,num=(f:number)=>String(Number(f.toFixed(3)));
 const total=c.parts.reduce((n,p)=>n+W[p],0),x0=(500-total)/2,yt=92,yb=120,bt=98,bb=114;
 let x=x0;const seg=c.parts.map(p=>{const s={p,x0:x,x1:x+W[p]};x+=W[p];return s;});
 const sups=seg.filter(s=>s.p==='sup'),span=seg.find(s=>s.p==='span')||seg.find(s=>s.p==='cant')!,spanW=span.x1-span.x0,end=x;
 const first=seg[0],last=seg.at(-1)!;
 const start=first.p==='sup'?first.x0+4:first.x0+(first.p==='cant'?6:0),stop=last.p==='sup'?last.x1-4:last.x1-(last.p==='cant'?6:0);
 const hookL=first.p==='cant',hookR=last.p==='cant',ftaL=!!c.ftaLeft,ftaR=!!c.ftaRight;
 const top=`M${start} ${ftaL?bt+44:hookL?bb:bt} V${bt} H${stop} V${ftaR?bt+44:hookR?bb:bt}`,bot=`M${start} ${ftaL?bb+28:bb} V${bb} H${stop} V${ftaR?bb+28:bb}`;
 return <svg viewBox="0 0 500 215" className="code-svg beam-svg" role="img" aria-label={c.title}>
  <rect x={x0} y={yt} width={end-x0} height={yb-yt} className="svg-beam"/>
  {sups.map((s,k)=><rect key={k} x={s.x0} y={26} width={W.sup} height={170} className="svg-support"/>)}
  {seg.filter(s=>s.p==='next').map((s,k)=><path key={k} d={s.x0===x0?`M${x0+8} ${yt-8} l-6 8 l10 6 l-6 ${yb-yt}`:`M${end-8} ${yt-8} l6 8 l-10 6 l6 ${yb-yt}`} className="svg-break"/>)}
  {Array.from({length:Math.floor((stop-start)/11)},(_,k)=>start+6+k*11).map(sx=><line key={sx} x1={sx} x2={sx} y1={bt+3} y2={bb-3} className="svg-stirrup"/>)}
  <path d={top} stroke={C.bar} strokeWidth={2.4} fill="none" strokeLinejoin="round"/>
  <path d={bot} stroke={C.bar} strokeWidth={2.4} fill="none" strokeLinejoin="round"/>
  {c.top.map((t,k)=>{const s=sups[t.at];if(!s)return null;const f=fr(t.frac),face=t.side==='right'?s.x1:s.x0,len=Math.min(f*W.span,(t.side==='right'?end-face:face-x0)-4),xe=t.side==='right'?face+len:face-len;
   const label=t.label.startsWith('MAX')?`MAX. ${num(f)}L₁, ${num(f)}L₂`:`${num(f)}L${v(f)}`;
   return <g key={k}><line x1={Math.min(face,xe)} x2={Math.max(face,xe)} y1={bt+4} y2={bt+4} stroke={C.accent} strokeWidth={2.4}/>
    <Dim x1={Math.min(face,xe)} y1={yt-22-(k%2)*12} x2={Math.max(face,xe)} y2={yt-22-(k%2)*12} label={label}/>
    <circle cx={xe} cy={bt+4} r={5} className="svg-note"/><text x={xe} y={bt+6.5} textAnchor="middle" className="svg-note-text">3</text></g>;})}
  {span.p==='span'&&sups.filter(s=>Math.abs(s.x1-span.x0)<1||Math.abs(s.x0-span.x1)<1).map((s,k)=>{const face=Math.abs(s.x1-span.x0)<1?span.x0:span.x1,b=rules.bottomZone,xe=face===span.x0?face+b*spanW:face-b*spanW;
   return <Dim key={k} x1={Math.min(face,xe)} y1={yb+14} x2={Math.max(face,xe)} y2={yb+14} label={`${num(b)}L${v(b)}`} side={1}/>;})}
  <Dim x1={span.x0} y1={yb+44} x2={span.x1} y2={yb+44} label={span.p==='span'?`CLEAR SPAN; L${v(1)}`:'CANTILEVER; L'} side={1}/>
  <text x={(span.x0+span.x1)/2} y={bt+11} textAnchor="middle" className="svg-label">STIRRUPS</text>
  {(ftaL||ftaR)&&<text x={ftaL?start-10:stop+10} y={bt+60} textAnchor={ftaL?'end':'start'} className="svg-small">F.T.A (TYP)</text>}
  {hookR&&<text x={stop} y={yt-6} textAnchor="end" className="svg-small">STANDARD HOOK</text>}
  {hookL&&<text x={start} y={yt-6} className="svg-small">STANDARD HOOK</text>}
  {sups.map((s,k)=><text key={k} x={s.x0+W.sup/2} y={208} textAnchor="middle" className="svg-small">SUPPORT</text>)}
 </svg>;
}
function BeamStep(){
 return <svg viewBox="0 0 500 215" className="code-svg beam-svg" role="img" aria-label="beam at different level">
  <rect x={210} y={30} width={26} height={170} className="svg-support"/>
  <rect x={40} y={70} width={170} height={36} className="svg-beam"/><rect x={236} y={110} width={220} height={36} className="svg-beam"/>
  <path d="M50 76 H300 V96" stroke={C.bar} strokeWidth={2.4} fill="none"/><path d="M50 100 H230 V130" stroke={C.bar} strokeWidth={2.4} fill="none"/>
  <path d="M446 116 H160" stroke={C.accent} strokeWidth={2.4} fill="none"/><path d="M446 140 H170 V110" stroke={C.accent} strokeWidth={2.4} fill="none"/>
  <Dim x1={236} y1={56} x2={300} y2={56} label="F.T.A"/><Dim x1={160} y1={166} x2={210} y2={166} label="F.T.A" side={1}/>
  <Dim x1={170} y1={186} x2={236} y2={186} label="2H" side={1}/><Dim x1={470} y1={110} x2={470} y2={146} label="H" side={1}/>
  <text x={300} y={104} className="svg-small">≥ 20</text>
 </svg>;
}
function BeamSectionSvg(){
 return <svg viewBox="0 0 500 215" className="code-svg beam-svg" role="img" aria-label="typical beam cross section">
  <rect x={60} y={30} width={330} height={26} className="svg-beam"/><rect x={170} y={30} width={110} height={170} className="svg-beam"/>
  <line x1={66} y1={38} x2={384} y2={38} stroke={C.bar} strokeWidth={2}/>
  <rect x={180} y={44} width={90} height={146} rx={6} fill="none" stroke={C.accent} strokeWidth={2}/>
  {[192,225,258].map(x=><circle key={x} cx={x} cy={56} r={6} fill={C.bar}/>)}{[192,225,258].map(x=><circle key={x} cx={x} cy={178} r={6} fill={C.bar}/>)}
  {[100,140].map(y=><g key={y}><circle cx={186} cy={y} r={4} fill={C.dim}/><circle cx={264} cy={y} r={4} fill={C.dim}/><line x1={186} y1={y} x2={264} y2={y} stroke={C.dim} strokeDasharray="4 3"/></g>)}
  <text x={66} y={24} className="svg-small">SLAB TOP BARS · 40 mm CL. TO STIRRUPS</text><text x={290} y={66} className="svg-small">BEAM TOP BARS</text>
  <text x={290} y={104} className="svg-small">ADD DB12@300 C/C</text><text x={290} y={116} className="svg-small">REQUIRED WHEN H &gt; 900 mm</text>
  <text x={290} y={146} className="svg-small">RB6 SPACING SAME AS MAIN STIRRUP</text><text x={290} y={180} className="svg-small">40 mm CL. TO STIRRUPS</text>
  <Dim x1={150} y1={30} x2={150} y2={200} label="H"/><Dim x1={170} y1={208} x2={280} y2={208} label="BEAM WIDTH"/>
 </svg>;
}
