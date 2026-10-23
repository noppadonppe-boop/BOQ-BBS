import {z} from 'zod';

// Site / sub-base items of one element (per piece, × occurrences in reports):
// sand bed (volume), plastic sheet and compaction (areas) as plan rectangles centred on the
// element like the lean concrete, plus manual BOQ items entered by the quantity surveyor.
const mm=z.number().finite().nonnegative().max(200000);
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const siteItemSchema=z.object({id,label:z.string().trim().min(1).max(120),unit:z.string().trim().min(1).max(12),quantity:z.number().finite().nonnegative().max(1e9),note:z.string().max(200).optional()}).strict();
export type SiteItem=z.infer<typeof siteItemSchema>;
export const siteWorkSchema=z.object({
 sand:z.object({x:mm,y:mm,thickness:mm}).strict(),
 sheet:z.object({x:mm,y:mm}).strict(),
 compaction:z.object({x:mm,y:mm}).strict(),
 items:z.array(siteItemSchema).max(30),
}).strict();
export type SiteWork=z.infer<typeof siteWorkSchema>;
export const emptySiteWork=():SiteWork=>({sand:{x:0,y:0,thickness:0},sheet:{x:0,y:0},compaction:{x:0,y:0},items:[]});
/** Quantities per piece: sand m³, sheet m², compaction m². */
export function siteQuantities(s:SiteWork|undefined){
 if(!s)return {sand:0,sheet:0,compaction:0,items:[] as SiteItem[]};
 return {sand:s.sand.x*s.sand.y*s.sand.thickness/1e9,sheet:s.sheet.x*s.sheet.y/1e6,compaction:s.compaction.x*s.compaction.y/1e6,items:s.items};
}
/** Sub-base layer kinds shown in the BOQ next to the lean concrete. */
export const siteKinds=['sand','sheet','compaction'] as const;
export type SiteKind=typeof siteKinds[number];
export const siteUnits:Record<SiteKind,'m³'|'m²'>={sand:'m³',sheet:'m²',compaction:'m²'};
export const siteLabels:Record<SiteKind,string>={sand:'ทรายรองพื้น',sheet:'แผ่นพลาสติกรองพื้น',compaction:'บดอัดดินก้นหลุม / ใต้พื้น'};
/** Key of a manual item for pricing and report grouping (same label and unit = same item). */
export const siteItemKey=(i:Pick<SiteItem,'label'|'unit'>)=>`${i.label.trim()}|${i.unit.trim()}`;
/** Sets the member's site work, or removes the field when it carries nothing (keeps quantity review keys of old members). */
export function withSiteWork<T extends {siteWork?:SiteWork}>(m:T,sw:SiteWork|undefined):T{
 const {siteWork:_old,...rest}=m,empty=!sw||!sw.items.length&&sw.sand.thickness*sw.sand.x*sw.sand.y===0&&sw.sheet.x*sw.sheet.y===0&&sw.compaction.x*sw.compaction.y===0;
 return (empty?rest:{...rest,siteWork:sw}) as T;
}
