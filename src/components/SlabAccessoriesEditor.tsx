import type {Spec} from '../domain/model';
import {DEFAULT_SLAB_ACCESSORIES,type SlabAccessories} from '../domain/slabFloorSchema';
import {NumInput} from './EditorControls';
import {HelpButton} from './HelpCenter';

/** Chairs under the top bars and concrete spacers of slab floors as BOQ items (General Spec, default off). Slab floors take
 * them on apply (and in the spec-change job): chairs per m² of panels with top bars, spacers per m² of every panel. */
export function SlabAccessoriesEditor({spec,disabled,onChange}:{spec:Spec;disabled:boolean;onChange:(s:Spec)=>void}){
 const a=spec.slabAccessories||DEFAULT_SLAB_ACCESSORIES;
 const store=(next:SlabAccessories)=>{const {slabAccessories:_,...rest}=spec;onChange(next.chair.enabled||next.spacer.enabled?{...rest,slabAccessories:next}:rest);};
 const num=(v:number,on:(v:number)=>void,label:string,step:number|'any'=1)=><NumInput aria-label={label} type="number" min={0} step={step} style={{width:72}} value={v} disabled={disabled} onChange={e=>on(Math.max(0,Number(e.target.value)||0))}/>;
 return <section className="slab-accessories" aria-label="เหล็กรองเหล็กบน (Chair) และลูกปูน"><h3>พื้นทั้งชั้น · Chair และลูกปูน (รายการ BOQ) <HelpButton topic="slab-floor-sheet"/></h3>
  <p className="muted">ค่าเริ่มต้นปิด · เปิดแล้วพื้นทั้งชั้นคิดรายการเพิ่มใน BOQ ตอนสร้างเหล็ก: Chair ต่อ m² ของแผงที่มีเหล็กบน · ลูกปูนต่อ m² ของทุกแผง</p>
  <div className="form-grid">
   <label className="check"><input type="checkbox" disabled={disabled} checked={a.chair.enabled} onChange={e=>store({...a,chair:{...a.chair,enabled:e.target.checked}})}/>เหล็กรองเหล็กบน (Chair)</label>
   <label className="field"><span>ขนาด (mm)</span>{num(a.chair.diameter,v=>store({...a,chair:{...a.chair,diameter:v}}),'ขนาด Chair')}</label>
   <label className="field"><span>รูปแบบ</span><select disabled={disabled} value={a.chair.shape} onChange={e=>store({...a,chair:{...a.chair,shape:e.target.value as SlabAccessories['chair']['shape']}})}><option value="U">U (ขาตั้ง 2 ขา)</option><option value="Z">Z</option><option value="continuous">ต่อเนื่อง (1 m ต่อตัว)</option></select></label>
   <label className="field"><span>ตัว / m²</span>{num(a.chair.perM2,v=>store({...a,chair:{...a.chair,perM2:v}}),'Chair ต่อ m²','any')}</label>
   <label className="check"><input type="checkbox" disabled={disabled} checked={a.spacer.enabled} onChange={e=>store({...a,spacer:{...a.spacer,enabled:e.target.checked}})}/>ลูกปูนรองเหล็ก</label>
   <label className="field"><span>ก้อน / m²</span>{num(a.spacer.perM2,v=>store({...a,spacer:{...a.spacer,perM2:v}}),'ลูกปูนต่อ m²','any')}</label>
  </div></section>;
}
