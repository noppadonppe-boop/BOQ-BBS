import {z} from 'zod';

// Buildings of a project's spec (spec.buildings): code + name per building, e.g. J-074 ISB / GIS / LNG. Template groups
// (foundation / beam) that equal a building code are shown under that building, and the project WBS page adds the
// spec's buildings as WBS roots (same code), so drawings uploaded per building keep one code throughout.
export const specBuildingSchema=z.object({
 code:z.string().regex(/^[A-Z0-9+._-]{1,20}$/,'รหัสอาคารใช้ A–Z 0–9 + . _ - ไม่เกิน 20 ตัว'),
 name:z.string().trim().min(1).max(120),
 note:z.string().max(500).default(''),
}).strict();
export type SpecBuilding=z.infer<typeof specBuildingSchema>;
export const specBuildingsSchema=z.array(specBuildingSchema).max(50)
 .superRefine((list,ctx)=>{const seen=new Set<string>();list.forEach((b,i)=>{if(seen.has(b.code))ctx.addIssue({code:'custom',path:[i,'code'],message:`รหัสอาคาร ${b.code} ซ้ำ`});seen.add(b.code);});});

/** Heading of a template group: “ISB · Instrument Substation Building” when the group is a spec building code. */
export function groupLabel(buildings:SpecBuilding[]|undefined,group:string){
 if(!group)return 'ไม่ระบุกลุ่ม';const b=buildings?.find(x=>x.code===group.trim().toUpperCase());return b?`${b.code} · ${b.name}`:group;
}
/** Template groups in building order first (spec order), then the other groups as they come. */
export function orderGroups(buildings:SpecBuilding[]|undefined,groups:string[]){
 const rank=(g:string)=>{const i=(buildings||[]).findIndex(b=>b.code===g.trim().toUpperCase());return i<0?Infinity:i;};
 return groups.map((g,i)=>({g,i})).sort((a,b)=>rank(a.g)-rank(b.g)||a.i-b.i).map(x=>x.g);
}
/** Merge imported buildings by code (imported rows replace, others kept, spec order then new ones). */
export function mergeBuildings(current:SpecBuilding[]|undefined,incoming:SpecBuilding[]){
 const m=new Map((current||[]).map(b=>[b.code,b]));incoming.forEach(b=>m.set(b.code,b));return [...m.values()];
}
