import {Plus,Trash2} from 'lucide-react';
import type {SiteItem} from '../domain/siteWork';

const units=['m³','m²','m','kg','ตัน','ชิ้น','จุด','ชุด','ลบ.ม.','ตร.ม.','เหมา'];
const suggestions=['ทรายถมปรับระดับ','หินคลุก','ดินถมเพิ่ม (นำเข้า)','สูบน้ำ / Dewatering','ค้ำยันดิน / Sheet pile','Waterproofing','ขนดินทิ้ง'];
/** Manual BOQ items of one element (per piece; reports multiply by the element quantity). */
export function SiteItemsEditor({items,onChange,readOnly}:{items:SiteItem[];onChange:(items:SiteItem[])=>void;readOnly:boolean}){
 const edit=(i:number,patch:Partial<SiteItem>)=>onChange(items.map((it,k)=>k===i?{...it,...patch}:it));
 return <div className="site-items">
  <h4>รายการ BOQ เพิ่มเอง (Manual) · ต่อ 1 ชิ้น</h4>
  {items.length>0&&<table className="subbase-table"><thead><tr><th>รายการ</th><th>หน่วย</th><th className="num">ปริมาณ / ชิ้น</th><th>หมายเหตุ</th><th/></tr></thead><tbody>{items.map((it,i)=><tr key={it.id}>
   <td><input aria-label="ชื่อรายการ" list="site-item-names" maxLength={120} disabled={readOnly} value={it.label} onChange={e=>edit(i,{label:e.target.value})}/></td>
   <td><input aria-label="หน่วย" list="site-item-units" maxLength={12} disabled={readOnly} value={it.unit} onChange={e=>edit(i,{unit:e.target.value})}/></td>
   <td><input aria-label="ปริมาณ" type="number" min={0} step="any" disabled={readOnly} value={it.quantity} onChange={e=>edit(i,{quantity:Math.max(0,Number(e.target.value)||0)})}/></td>
   <td><input aria-label="หมายเหตุ" maxLength={200} disabled={readOnly} value={it.note||''} onChange={e=>edit(i,{note:e.target.value||undefined})}/></td>
   <td><button className="icon-button" disabled={readOnly} aria-label="ลบรายการ" onClick={()=>onChange(items.filter((_,k)=>k!==i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table>}
  <datalist id="site-item-names">{suggestions.map(s=><option key={s} value={s}/>)}</datalist><datalist id="site-item-units">{units.map(u=><option key={u} value={u}/>)}</datalist>
  <button disabled={readOnly||items.length>=30} onClick={()=>onChange([...items,{id:crypto.randomUUID(),label:'',unit:'m³',quantity:0}])}><Plus size={14}/>เพิ่มรายการ</button>
  {items.some(it=>!it.label.trim()||!it.unit.trim())&&<p className="warn-text">ใส่ชื่อรายการและหน่วยให้ครบก่อนบันทึก</p>}
 </div>;
}
