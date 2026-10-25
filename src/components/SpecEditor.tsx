import type {Spec} from '../domain/model';
import {currentStarterSpec} from '../domain/model';
import {BS2000,BS2000V2,BS2000V3,BS2000V4,BS2000V5,BS2000V6,BS2000V7,BS2000V8,bsProfile} from '../domain/bs8666';
import {DesignCodeLibrary} from './DesignCodeLibrary';
import {ProjectMaterialsEditor} from './ProjectMaterials';
import {ConcreteMixEditor} from './ConcreteMixEditor';
import {FlatEndCoverPolicy} from './FlatEndCover';
import {PrismPolicy} from './PrismEditor';
import {BarPlacementPolicy} from './BarPlacements';
import {EarthworkPolicy} from './FoundationEarthwork';
import {Field} from './EditorControls';

/** Full General Spec editor (design code library, BS 8666 rule set, editions, measurement
 * rules, materials and policies). Used for workspace spec profiles. */
export function SpecEditor({spec:s,readOnly,onChange,onSave}:{spec:Spec;readOnly:boolean;onChange:(next:Spec)=>void;onSave?:(next:Spec)=>void}){
 const bs=<div className="code-bs"><h3>ชุดกฎตัด/ดัดเหล็ก (BS 8666)</h3><p>BS 8666:2000 รวม Amendments 1/2 · ข้อ 7.1 ปัดยาวตัดขึ้นทีละ 25 mm · ชุดกฎรุ่น 7: เพิ่มรูปปลอก 51 มิติ A/B/C/(D) โดย C=D และตรวจปลาย 10d; คงรูปและสูตรรุ่นก่อน · รายละเอียดปิดปลายซ้อนและการผลิตยังรอตรวจ · เลือกรุ่น 8 เพิ่มสูตรรูป 33 และแนวฉายวงรีได้โดยไม่เปลี่ยนรุ่นเริ่มต้น</p>
  <p className="muted">ที่มา: {BS2000.source} · SHA256 {BS2000.sha256}</p>
  <label className="field"><span>ชุดกฎขั้นต่ำ</span><select aria-label="ชุดกฎขั้นต่ำ" disabled={readOnly} value={s.minimumStandard||''} onChange={e=>{if(e.target.value){const profile=bsProfile({minimumStandard:e.target.value} as Spec);onChange({...s,minimumStandard:profile.id,bsEdition:profile.edition,rounding:25,ruleSource:currentStarterSpec.ruleSource,ruleVersion:profile.version});}else{const {minimumStandard:_m,...custom}=s;onChange(custom);}}}>
   <option value="">ข้อกำหนดโครงการ / legacy (ยังไม่มีตัวตรวจขั้นต่ำ)</option><option value={BS2000.id}>BS 8666:2000 · รุ่น 1 (00/11/12/21)</option><option value={BS2000V2.id}>BS 8666:2000 · รุ่น 2 (เพิ่ม 31/41/44)</option><option value={BS2000V3.id}>BS 8666:2000 · รุ่น 3 (เพิ่ม 15/25/26/46)</option><option value={BS2000V4.id}>BS 8666:2000 · รุ่น 4 (เพิ่ม 13 ครึ่งวงกลม)</option><option value={BS2000V5.id}>BS 8666:2000 · รุ่น 5 (เพิ่ม 67 ส่วนโค้งจริง)</option><option value={BS2000V6.id}>BS 8666:2000 · รุ่น 6 (เพิ่ม 77 เกลียวสามมิติ)</option><option value={BS2000V7.id}>BS 8666:2000 · รุ่น 7 (เพิ่ม 51 ปลอกสี่เหลี่ยม / รอตรวจปิดปลาย)</option><option value={BS2000V8.id}>BS 8666:2000 · รุ่น 8 (เพิ่ม 33 วงรี / รอตรวจปิดปลาย)</option></select></label>
  <button disabled={readOnly} onClick={()=>onChange({...s,...currentStarterSpec,designCode:s.designCode,codeData:s.codeData,density:s.density,measurementNotes:s.measurementNotes,aciEdition:s.aciEdition})}>ใช้ BS 8666 รุ่น 8 เป็นค่าเริ่มต้น</button>
  <p className="muted">ไม่เทียบ SD40 กับเกรด BS อัตโนมัติ · รุ่น 8 เพิ่มสูตรรูป 33 แต่รูป 33/51 ยังรอตรวจปิดปลาย · ยังรอตรวจรับวิศวกรรม</p></div>;
 const fields:Record<string,string>={bsEdition:'BS 8666 ปีฉบับ',aciEdition:'ACI 318 ปีฉบับ',density:'ความหนาแน่นเหล็ก kg/m³',rounding:'ปัดความยาวตัดขึ้นทีละ mm',ruleSource:'เอกสาร / ข้อกำหนดที่มา',ruleVersion:'รุ่นกฎ',engineer:'ผู้รับผิดชอบวิศวกรรม',fixtureReferences:'กรณีอ้างอิงที่ผ่านการตรวจ'};
 return <>
  <DesignCodeLibrary spec={s} readOnly={readOnly} onChange={onChange} bs={bs} onSave={onSave}/>
  <section className="panel padded">
   <h3>ปีฉบับ · กฎวัดปริมาณ · นโยบาย</h3>
   <label className="check"><input aria-label="ขั้นตอนตรวจรับ Code99" type="checkbox" disabled={readOnly} checked={s.code99ReviewPolicy==='code99-review-1.0'} onChange={e=>{if(e.target.checked)onChange({...s,code99ReviewPolicy:'code99-review-1.0'});else{const {code99ReviewPolicy:_c,...next}=s;onChange(next);}}}/>ขั้นตอนตรวจรับ Code99 · ผู้อนุมัติรับรองรูป/หลักฐานที่ผูกกับข้อมูล · แก้ Spec แล้วต้องตรวจใหม่</label>
   <div className="form-grid">{Object.entries(fields).map(([k,label])=><Field disabled={readOnly} key={k} label={label} value={s[k as keyof Spec] as string|number} type={['density','rounding'].includes(k)?'number':'text'} onChange={v=>onChange({...s,[k]:v})}/>)}
    <label className="field full"><span>หลักการวัดปริมาณ / ownership รอยต่อ / รายการหัก</span><textarea disabled={readOnly} value={s.measurementNotes} onChange={e=>onChange({...s,measurementNotes:e.target.value})}/></label></div>
   <ConcreteMixEditor spec={s} disabled={readOnly} onChange={onChange}/>
   <ProjectMaterialsEditor spec={s} disabled={readOnly} onChange={onChange}/>
   <PrismPolicy spec={s} disabled={readOnly} onChange={onChange}/>
   <BarPlacementPolicy spec={s} disabled={readOnly} onChange={onChange}/>
   <FlatEndCoverPolicy spec={s} disabled={readOnly} onChange={onChange}/>
   <EarthworkPolicy spec={s} disabled={readOnly} onChange={onChange}/>
  </section>
 </>;
}
