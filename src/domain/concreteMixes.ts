import {z} from 'zod';

// Concrete mixes of a spec (e.g. General Notes "Schedule of cylindrical compressive strength"): strengths in ksc
// (cylinder), and which member types use which mix. Kept free of runtime imports from model / elementInput.
export const KSC_TO_MPA=0.0980665;
export const concreteCategories=['Foundation','Beam','Column','Slab','Wall'] as const;
export const concreteCategoryLabels:Record<typeof concreteCategories[number],string>={Foundation:'ฐานราก / Pile cap',Beam:'คาน',Column:'เสา',Slab:'พื้น',Wall:'ผนัง'};
const ksc=z.number().finite().min(0).max(2000);
export const concreteMixSchema=z.object({
 id:z.string().trim().min(1).max(24),
 name:z.string().trim().min(1).max(80),
 /** f'c cylinder at 28 days (ksc) */
 fc:z.number().finite().min(50).max(2000),
 /** strength at 14 / 7 days (ksc, 0 = not specified) */
 fc14:ksc.default(0),fc7:ksc.default(0),
 /** max water / cement ratio (0 = not specified) */
 wc:z.number().finite().min(0).max(1).default(0),
 /** max shrinkage strain at 3 days (microstrain, 0 = not specified) */
 shrinkage:z.number().finite().min(0).max(5000).default(0),
 note:z.string().max(300).default(''),
}).strict();
export const concreteUseSchema=z.object({
 id:z.string().trim().min(1).max(24),
 /** member types as written in the notes */
 description:z.string().max(300),
 /** member categories that take this mix by default (first matching row wins) */
 categories:z.array(z.enum(concreteCategories)).max(5),
 mix:z.string().trim().min(1).max(24),
}).strict();
export const concreteSpecSchema=z.object({mixes:z.array(concreteMixSchema).min(1).max(20),uses:z.array(concreteUseSchema).max(40)}).strict()
 .superRefine((c,ctx)=>{const ids=new Set<string>();c.mixes.forEach((m,i)=>{if(ids.has(m.id))ctx.addIssue({code:'custom',path:['mixes',i,'id'],message:'รหัส Mix ซ้ำ'});ids.add(m.id);});
  c.uses.forEach((u,i)=>{if(!ids.has(u.mix))ctx.addIssue({code:'custom',path:['uses',i,'mix'],message:`ไม่พบ Mix ${u.mix}`});});});
export type ConcreteMix=z.infer<typeof concreteMixSchema>;
export type ConcreteUse=z.infer<typeof concreteUseSchema>;
export type ConcreteSpec=z.infer<typeof concreteSpecSchema>;

export const kscToMpa=(v:number)=>v*KSC_TO_MPA;
/** Mix of a member: its own choice (mix id) first, else the first use row of its category. */
export function concreteMixFor(c:ConcreteSpec|undefined,category?:string,mix?:string):ConcreteMix|undefined{
 if(!c)return;
 if(mix){const own=c.mixes.find(m=>m.id===mix);if(own)return own;}
 const use=category?c.uses.find(u=>(u.categories as string[]).includes(category)):undefined;
 return use&&c.mixes.find(m=>m.id===use.mix);
}
/** Lap-table concrete (MPa key) for a strength in ksc: the nearest table within 3 % (350 ksc → 35, 450 → 45),
 * else the largest table not above it (conservative), else the lowest table. */
export function lapConcreteFor(fcKsc:number,tables:number[]){
 const fc=kscToMpa(fcKsc),sorted=[...tables].sort((a,b)=>a-b);if(!sorted.length)return undefined;
 const near=sorted.find(t=>Math.abs(t-fc)<=.03*t);if(near!==undefined)return near;
 return [...sorted].reverse().find(t=>t<=fc)??sorted[0];
}
/** Concrete description of a member for BOQ lines: mix + f'c from its element-input detailing ('' = none). */
export const memberConcrete=(m:{elementInput?:{detailing?:{concrete?:{name:string;fc:number}}}|null}):string=>{const c=m.elementInput?.detailing?.concrete;return c?`${c.name} (f'c ${c.fc} ksc)`:'';};
/** Drawing note: mix, f'c (cylinder 28 days) and the other limits of the mix in the spec. */
export function concreteNote(c:{mix:string;name:string;fc:number},spec?:ConcreteSpec){
 const m=spec?.mixes.find(x=>x.id===c.mix);
 return [`${c.name}: f'c = ${c.fc} ksc (cylinder, 28 days)`,m?.fc14?`14 days ${m.fc14} ksc`:'',m?.fc7?`7 days ${m.fc7} ksc`:'',m?.wc?`W/C ≤ ${m.wc}`:'',m?.shrinkage?`shrinkage at 3 days ≤ ${m.shrinkage} microstrain`:''].filter(Boolean).join(' · ');
}
export const mixText=(m:Pick<ConcreteMix,'name'|'fc'>)=>`${m.name} · f'c ${m.fc} ksc`;
