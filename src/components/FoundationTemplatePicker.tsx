import {useMemo,useState} from 'react';
import type {Spec} from '../domain/model';
import {applyFoundationTemplate,foundationTemplateSummary,templateHasStage2,type FoundationTemplate} from '../domain/foundationTemplates';
import {pilePositions,type FoundationInput} from '../domain/elementInput';
import {Modal} from './EditorControls';

/** Plan sketch of a foundation type: outline, piles (dashed), stirrup band and columns (hatched). */
export function FoundationTemplatePlan({t,size=150}:{t:FoundationTemplate;size?:number}){
 const f=t.fields,W=f.width||1,L=f.length||1,k=size/Math.max(W,L),w=W*k,h=L*k,pad=4,y=(v:number)=>pad+h-v*k;
 const piles=f.foundationType==='pile'?pilePositions({...f,column:{type:'none'},extraColumns:[]} as unknown as FoundationInput):[];
 const st=f.rebar.stirrups?.enabled?f.rebar.stirrups:undefined;
 return <svg className="ft-plan" width={w+2*pad} height={h+2*pad} viewBox={`0 0 ${w+2*pad} ${h+2*pad}`} aria-hidden>
  <rect x={pad} y={pad} width={w} height={h} className="ft-outline"/>
  {(f.cuts||[]).map((b,n)=><rect key={`c${n}`} x={pad+b.x0*k} y={y(b.y1)} width={(b.x1-b.x0)*k} height={(b.y1-b.y0)*k} className={b.z0<=.5&&b.z1>=f.thickness-1?"ft-open":"ft-cut"}/>)}
  {(f.blocks||[]).map((b,n)=><rect key={`b${n}`} x={pad+b.x0*k} y={y(b.y1)} width={(b.x1-b.x0)*k} height={(b.y1-b.y0)*k} className="ft-block"/>)}
  {st&&(st.dir==='x'?<rect x={pad} y={pad+h/2-st.width*k/2} width={w} height={st.width*k} className="ft-band"/>:<rect x={pad+w/2-st.width*k/2} y={pad} width={st.width*k} height={h} className="ft-band"/>)}
  {piles.map(([px,py],n)=><circle key={n} cx={pad+px*k} cy={y(py)} r={f.pile.size*k/2} className="ft-pile"/>)}
  {(f.walls||[]).map((b,n)=><rect key={`w${n}`} x={pad+b.x0*k} y={y(b.y1)} width={(b.x1-b.x0)*k} height={(b.y1-b.y0)*k} className="ft-wall"/>)}
  {t.columns.map((c,n)=><rect key={n} x={pad+(W/2+c.offsetX-c.width/2)*k} y={y(L/2+c.offsetY+c.depth/2)} width={c.width*k} height={c.depth*k} className="ft-col"/>)}
 </svg>;
}

/** Pick a Project Foundation Template (spec.foundationTemplates) for a footing: cards per group with the plan sketch
 * and a summary; applying fills the footing input (geometry, piles, bars, pours, levels, column positions). */
export function FoundationTemplatePicker({spec,input,onApply,onClose}:{spec:Spec;input:FoundationInput;onApply:(next:FoundationInput)=>void;onClose:()=>void}){
 const list=spec.foundationTemplates||[],[q,setQ]=useState(''),[sel,setSel]=useState(input.template?.id||''),[stage1,setStage1]=useState(!!input.template?.stage1);
 const shown=list.filter(t=>!q.trim()||`${t.name} ${t.group}`.toUpperCase().includes(q.trim().toUpperCase()));
 const groups=useMemo(()=>[...new Set(shown.map(t=>t.group||''))],[shown]);
 const t=list.find(x=>x.id===sel);
 return <Modal title="Foundation Template · ฐานรากตามแบบของโครงการ" onClose={onClose}>
  <div className="ft-picker">
   {!list.length?<p className="notice warning">General Spec ของโครงการยังไม่มี Foundation Template · นำเข้าไฟล์ Spec (form-spec-import) ที่มี foundationTemplates ในหน้า General Spec แล้วกดบันทึก</p>:<>
   <div className="ct-viewbar"><input type="search" placeholder="ค้นหาชื่อฐาน" value={q} onChange={e=>setQ(e.target.value)} aria-label="ค้นหาชื่อฐาน"/><span className="muted">{list.length} แบบ · คลิกเลือก แล้วกด “ใช้กับฐานนี้”</span></div>
   {groups.map(g=><section key={g||'-'}><h5>{g||'ไม่ระบุกลุ่ม'}</h5><div className="ft-grid">{shown.filter(x=>(x.group||'')===g).map(x=><button key={x.id} type="button" className={`ft-card${x.id===sel?' active':''}`} onClick={()=>setSel(x.id)} onDoubleClick={()=>{onApply(applyFoundationTemplate(input,x,stage1));onClose();}}>
    <b>{x.name}</b><FoundationTemplatePlan t={x} size={110}/><small>{x.fields.width}×{x.fields.length}×{x.fields.thickness}</small></button>)}</div></section>)}
   {t&&<div className="ft-detail"><FoundationTemplatePlan t={t} size={190}/><div><h4>{t.name}</h4><p>{foundationTemplateSummary(t)}</p>{templateHasStage2(t)&&<div className="ft-stages"><span>การเทคอนกรีต</span><label className="check"><input type="radio" name="ft-stage" checked={!stage1} onChange={()=>setStage1(false)}/>ตามแบบ {t.fields.pour.count} Stage ({t.fields.thickness} mm)</label><label className="check"><input type="radio" name="ft-stage" checked={stage1} onChange={()=>setStage1(true)}/>Stage 1 อย่างเดียว ({t.fields.pour.heights[0]} mm · ตะแกรงที่รอยต่อเป็นเหล็กบน · ไม่มีพื้น)</label></div>}{t.note&&<p className="muted">{t.note}</p>}{t.source&&<p className="muted">ที่มา: {t.source}</p>}
    <p className="muted">ใช้แล้วจะแทน ขนาด/ความสูงฐาน เสาเข็ม (คงความยาวเข็มเดิม) เหล็กล่าง/บน LOOPS เหล็กข้าง เหล็กปลอก ระดับ และตำแหน่งเสา · หน้าตัดเสาและ Starter bar คงเดิม (เลือกจากตารางหน้าตัดเสาในข้อ 5)</p></div></div>}</>}
   <footer className="actions"><button type="button" onClick={onClose}>ปิด</button><button type="button" className="primary" disabled={!t} onClick={()=>{if(t){onApply(applyFoundationTemplate(input,t,stage1));onClose();}}}>ใช้กับฐานนี้</button></footer>
  </div>
 </Modal>;
}
