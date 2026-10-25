import {useMemo,useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {labels,type Member,type Project} from '../domain/model';
import {takeoff,validateMember} from '../domain/engine';
import {civilInputSchema,type CivilInput} from '../domain/civilInputSchema';
import {applyCivilInput,civilMeasures,defaultCivilInput,isCivilCategory} from '../domain/civilInput';
import {Field,number} from './EditorControls';

type Key=string;
const fieldLabels:Record<Key,string>={length:'ความยาว (mm)',innerWidth:'กว้างภายใน (mm)',innerHeight:'ลึก / สูงภายใน (mm)',wall:'ผนังหนา (mm)',base:'พื้นหนา (mm)',cover:'ฝาหนา (mm · 0 = ไม่มีฝา)',topWidth:'กว้างบน (mm)',bottomWidth:'กว้างก้น (mm · 0 = รูปตัว V)',depth:'ลึก (mm)',lining:'ความหนาดาด (mm)',innerLength:'ยาวภายใน (mm)',toe:'ฐานยื่นจากผนัง (mm)',openingLength:'ช่องเปิดฝา ยาว (mm)',openingWidth:'ช่องเปิดฝา กว้าง (mm)',width:'กว้าง (mm)',thickness:'หนา (mm)',diameter:'ขนาดท่อ (mm)',outerDiameter:'Ø ภายนอก (mm)',pieceLength:'ความยาวต่อท่อน (mm)',trenchWidth:'ร่องกว้าง (mm)',trenchDepth:'ร่องลึก (mm)',sideSlope:'ผนังร่องลาด (H:V)',bedding:'ทรายรองท่อหนา (mm)'};
const fieldOrder:Record<CivilInput['kind'],Key[]>={channel:['length','innerWidth','innerHeight','wall','base','cover'],vchannel:['length','topWidth','bottomWidth','depth','lining'],box:['innerLength','innerWidth','innerHeight','wall','base','toe','cover','openingLength','openingWidth'],paving:['length','width','thickness'],asphalt:['length','width'],pipe:['length','diameter','outerDiameter','pieceLength','trenchWidth','trenchDepth','sideSlope','bedding']};

/** Tab “รูปทรงสำเร็จรูป” of Civil Work members: dimensions → geometry (shape model / prism) or asphalt layers. */
export function CivilForm({member,project,readOnly,onApply}:{member:Member;project:Project;readOnly:boolean;onApply:(m:Member)=>void}){
 const category=member.category;
 const [input,setInput]=useState<CivilInput>(()=>member.civilInput||(isCivilCategory(category)?defaultCivilInput(category):defaultCivilInput('UDitch')));
 const set=(k:Key,v:number)=>setInput({...input,[k]:Number.isFinite(v)?v:0} as CivilInput);
 const check=civilInputSchema.safeParse(input);
 const preview=useMemo(()=>{if(!check.success)return null;try{const next=applyCivilInput(member,input),problems=validateMember(next,project.spec);if(problems.length)return {error:problems.join(' · ')};const q=takeoff(next,project.spec);return {next,q,measures:civilMeasures(next)};}catch(e:any){return {error:String(e?.message||e)};}},[member,input,project.spec]);
 const site='site' in input?input.site:undefined;
 return <section className="civil-form">
  <div className="section-heading"><div><h3>รูปทรงสำเร็จรูป · {labels[category]}</h3><p className="muted">กรอกขนาดตามแบบ → ระบบสร้างรูปทรงให้ (ใช้แบบ BBS A3 เดียวกับงาน RC) · {input.kind==='pipe'?'ท่อสำเร็จรูปคิดเป็นความยาว / จำนวนท่อน + งานดิน ไม่มีคอนกรีตและเหล็ก':input.kind==='asphalt'?'ผิวทางแอสฟัลต์คิดเป็นปริมาณต่อชั้น ไม่มีคอนกรีต':'เหล็กเสริมใส่ต่อในแท็บ “ใส่เหล็ก (วาดบนรูปตัด)” หรือจาก Note ในแบบ'}</p></div></div>
  <fieldset disabled={readOnly}><div className="form-grid">
   {fieldOrder[input.kind].map(k=><Field key={k} label={fieldLabels[k]} type="number" value={(input as unknown as Record<string,number>)[k]} onChange={v=>set(k,v)}/>)}
  {input.kind==='pipe'&&<><label className="field"><span>ชั้นคุณภาพท่อ</span><input maxLength={60} value={input.pipeClass} onChange={e=>setInput({...input,pipeClass:e.target.value})} placeholder="มอก. 128 ชั้น 3 / PE100 PN10"/></label><label className="check full"><input type="checkbox" checked={input.excavation} onChange={e=>setInput({...input,excavation:e.target.checked})}/>คิดงานขุดร่อง ทรายรองท่อ และถมกลับ</label></>}
  </div>
  {site&&<div className="form-grid civil-site"><label className="check full"><input type="checkbox" checked={site.excavation} onChange={e=>setInput({...input,site:{...site,excavation:e.target.checked}} as CivilInput)}/>ขุดดินถึงใต้ชั้นคอนกรีตหยาบ (โครงสร้างฝังดิน)</label>
   <Field label="ระยะทำงานรอบนอก (mm)" type="number" value={site.workingSpace} onChange={v=>setInput({...input,site:{...site,workingSpace:v||0}} as CivilInput)}/>
   <Field label="คอนกรีตหยาบหนา (mm)" type="number" value={site.leanThickness} onChange={v=>setInput({...input,site:{...site,leanThickness:v||0}} as CivilInput)}/>
   <Field label="คอนกรีตหยาบยื่น (mm)" type="number" value={site.leanProjection} onChange={v=>setInput({...input,site:{...site,leanProjection:v||0}} as CivilInput)}/></div>}
  {input.kind==='asphalt'&&<div className="table-scroll"><table className="civil-layers"><thead><tr><th>ชั้นวัสดุ</th><th className="num">หนา (mm)</th><th>หน่วย BOQ</th><th/></tr></thead><tbody>
   {input.layers.map((l,i)=><tr key={l.id}><td><input aria-label={`ชั้น ${i+1}`} maxLength={100} value={l.label} onChange={e=>setInput({...input,layers:input.layers.map(x=>x.id===l.id?{...x,label:e.target.value}:x)})}/></td>
    <td><input aria-label={`หนา ${i+1}`} type="number" min={0} value={l.thickness} onChange={e=>setInput({...input,layers:input.layers.map(x=>x.id===l.id?{...x,thickness:Math.max(0,Number(e.target.value)||0)}:x)})}/></td>
    <td><select aria-label={`หน่วย ${i+1}`} value={l.unit} onChange={e=>setInput({...input,layers:input.layers.map(x=>x.id===l.id?{...x,unit:e.target.value as 'm²'|'m³'}:x)})}><option>m²</option><option>m³</option></select></td>
    <td><button type="button" aria-label="ลบชั้น" disabled={input.layers.length===1} onClick={()=>setInput({...input,layers:input.layers.filter(x=>x.id!==l.id)})}><Trash2 size={14}/></button></td></tr>)}
  </tbody></table><button type="button" disabled={input.layers.length>=8} onClick={()=>setInput({...input,layers:[...input.layers,{id:crypto.randomUUID().replace(/-/g,'').slice(0,12),label:'ชั้นวัสดุใหม่',thickness:0,unit:'m²'}]})}><Plus size={14}/>เพิ่มชั้น</button></div>}
  </fieldset>
  {!check.success?<p role="alert" className="notice danger">กรอกขนาดเป็นตัวเลขบวกให้ครบ ({check.error.issues[0]?.path.join('.')})</p>
   :preview&&'error' in preview?<p role="alert" className="notice danger">{preview.error}</p>
   :preview&&<div className="kpis compact">{[
     ...(preview.measures.pieces?[['จำนวนท่อน',`${preview.measures.pieces} ท่อน`],['ทรายรองท่อ',`${number(preview.q.sand)} m³`],['ถมกลับ',`${number(preview.q.backfill)} m³`]]:[]),
     ...(input.kind==='asphalt'||input.kind==='pipe'?[]:[['คอนกรีต',`${number(preview.q.concrete)} m³`],['แบบหล่อ',`${number(preview.q.formwork)} m²`]]),
     ...(preview.q.excavation?[['ขุดดิน',`${number(preview.q.excavation)} m³`],['คอนกรีตหยาบ',`${number(preview.q.lean)} m³`]]:[]),
     ...(preview.measures.length?[['ความยาว',`${number(preview.measures.length,2)} m`]]:[]),...(preview.measures.area?[['พื้นที่',`${number(preview.measures.area,2)} m²`]]:[]),
     ...(input.kind==='asphalt'?preview.next.siteWork?.items.filter(i=>i.id.startsWith('asph-')).map(i=>[i.label,`${number(i.quantity,2)} ${i.unit}`])||[]:[]),
    ].map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}<span className="muted">ต่อ 1 ชิ้น / ช่วง · ใน BOQ คูณจำนวนตำแหน่ง</span></div>}
  <footer className="actions"><button className="primary" disabled={readOnly||!preview||'error' in preview} onClick={()=>preview&&!('error' in preview)&&onApply(preview.next)}>สร้างรูปทรงจากขนาดนี้</button>{member.civilInput&&<span className="muted">สร้างใหม่จะแทนรูปทรงเดิม · เหล็กที่วาดไว้ต้องตรวจตำแหน่งใหม่</span>}</footer>
 </section>;
}
