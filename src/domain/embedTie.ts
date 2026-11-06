import {z} from 'zod';

// Ties round column bars embedded in a footing (pedestal / starter bars, Custom column parts on a footing part):
// the project standard (General Spec), the choice per column type (Column Template) and the resolved values.
// zod only: imported by the detailing schema (elementInput), column templates and specDetailing.

/** Project standard (typical column detail): spacing ≤ `spacing`, top tie at least `top` under the footing top,
 * diameter 0 = the column tie size. `enabled` = default for columns placed on a footing / types left “standard”. */
export const embedTieStandardSchema=z.object({
 enabled:z.boolean(),
 diameter:z.number().finite().min(0).max(60),
 spacing:z.number().finite().min(50).max(2000),
 top:z.number().finite().min(0).max(1000),
 /** drawing the standard was taken from (display) */
 source:z.string().trim().max(200).optional(),
}).strict();
export type EmbedTieStandard=z.infer<typeof embedTieStandardSchema>;
export const DEFAULT_EMBED_TIE_STANDARD:EmbedTieStandard={enabled:true,diameter:0,spacing:500,top:100};

/** Per column type: std = the project standard, own = own size / spacing, off = none (absent = std). */
export const embedTieTypeSchema=z.object({mode:z.enum(['std','own','off']),diameter:z.number().finite().min(0).max(60),spacing:z.number().finite().min(0).max(2000)}).strict();
export type EmbedTieType=z.infer<typeof embedTieTypeSchema>;

/** Stored on a footing column: values + where they come from (spec = the standard, read live from the detailing;
 * type = the column type, re-resolved by the spec-change job; absent = own values). */
export type FootingEmbedTie={diameter:number;spacing:number;link?:'spec'|'type'};
export type ResolvedEmbedTie={diameter:number;spacing:number;top:number;from:'spec'|'type'|'own'};

/** Values used for the bars: a `spec` link reads the standard (diameter 0 = column tie `tieD`). */
export function resolveEmbedTie(et:FootingEmbedTie|undefined,tieD:number,std?:EmbedTieStandard):ResolvedEmbedTie|undefined{
 if(!et)return;
 const top=std?.top??100;
 const r:ResolvedEmbedTie=et.link==='spec'&&std?{diameter:std.diameter||tieD||et.diameter,spacing:std.spacing,top,from:'spec' as const}:{diameter:et.diameter,spacing:et.spacing,top,from:et.link??'own'};
 return r.diameter>0&&r.spacing>0?r:undefined;
}
/** Embedded tie of a column built from a column type: undefined = none, null = no standard to decide by (keep the column's own). */
export function embedTieFromType(type:EmbedTieType|undefined,tieD:number,std?:EmbedTieStandard):FootingEmbedTie|undefined|null{
 const mode=type?.mode??'std';
 if(mode==='off')return undefined;
 if(mode==='own')return type!.diameter>0&&type!.spacing>0?{diameter:type!.diameter,spacing:type!.spacing,link:'type'}:undefined;
 if(!std)return null;
 return std.enabled?{diameter:std.diameter||tieD,spacing:std.spacing,link:'type'}:undefined;
}
/** Linked to the standard (new column on a footing when the standard is on). */
export function standardEmbedTie(tieD:number,std?:EmbedTieStandard):FootingEmbedTie|undefined{
 return std?.enabled?{diameter:std.diameter||tieD,spacing:std.spacing,link:'spec'}:undefined;
}
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
export function embedTieText(r:ResolvedEmbedTie|undefined){return r?`${barName(r.diameter)} @ ≤ ${r.spacing} · บนสุด −${r.top}`:'ไม่ใส่';}
export function standardText(std:EmbedTieStandard){return `${std.diameter?barName(std.diameter):'ขนาด = ปลอกเสา'} @ ≤ ${std.spacing} · ปลอกบนสุดต่ำกว่าผิวบนฐาน ${std.top} mm`;}
export const embedTieFromLabel={spec:'ตามมาตรฐาน Spec',type:'ตาม Type',own:'กำหนดเอง'} as const;
