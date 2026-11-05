import {drawSheetInfo,sheetPageCount,type SheetData} from './bbsSheet';
import {drawingModelHash} from './drawingEdits';
import {lostAnchors} from './elementViews';

/** Status of a member's edited drawing (Drawing Edit P4, Tekla "drawing up to date"):
 * - `auto`: no Drawing Edit layer (the sheet is fully automatic, always up to date)
 * - `ok`: the model is the one the drawing was last saved / confirmed with, every anchor and override still finds its target
 * - `check`: the model changed since (`modelChanged`), user objects lost their bar (`lost`) or overrides of automatic
 *   annotations no longer find them (`stale`, hidden ones excluded) → open “แก้ไขแบบ”, check and save to confirm. */
export type DrawingStatus={state:'auto'|'ok'|'check';modelChanged:boolean;lost:number;stale:number;checkedAt?:string};
export function drawingStatus(s:SheetData):DrawingStatus{
 const e=s.member.drawingEdits;if(!e)return {state:'auto',modelChanged:false,lost:0,stale:0};
 const modelChanged=!e.check||e.check.hash!==drawingModelHash(s.member as unknown as Record<string,unknown>);
 let lost=0,stale=0;const drawn=new Map<string,Set<string>>();
 for(let p=0;p<sheetPageCount(s);p++){const info=drawSheetInfo(s,p);
  for(const v of info.views){if(!v.key)continue;const set=drawn.get(v.key)||new Set<string>();for(const q of info.prims)if(q.view===v.id&&q.key)set.add(q.key);drawn.set(v.key,set);
   if(v.data)lost+=lostAnchors(v.data,e.views[v.key]).length;}}
 for(const [vk,ve] of Object.entries(e.views)){const set=drawn.get(vk);if(!set)continue;for(const [key,o] of Object.entries(ve.over||{}))if(!o.hidden&&!set.has(key))stale++;}
 return {state:modelChanged||lost||stale?'check':'ok',modelChanged,lost,stale,...(e.check?{checkedAt:e.check.at}:{})};
}
/** Short Thai label of a status (pill text) and its details (tooltip / panel). */
export function drawingStatusText(d:DrawingStatus){
 if(d.state==='auto')return {label:'แบบอัตโนมัติ',detail:'ยังไม่มีการแก้ไขแบบ · ตรงกับโมเดลเสมอ'};
 const parts=[d.modelChanged?'โมเดลเปลี่ยนหลังตรวจแบบครั้งล่าสุด':'',d.lost?`หลุดจุดยึด ${d.lost}`:'',d.stale?`การแก้ที่หาเป้าหมายไม่พบ ${d.stale}`:''].filter(Boolean);
 return d.state==='ok'?{label:'แบบตรงกับโมเดล',detail:`ตรวจล่าสุด ${d.checkedAt?.slice(0,10)||'—'}`}:{label:'แบบต้องตรวจ',detail:parts.join(' · ')};
}
