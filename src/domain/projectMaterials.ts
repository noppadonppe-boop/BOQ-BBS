import {z} from 'zod';

export const PROJECT_MATERIAL_POLICY='project-material-1.0';
export const materialGradeKey=(grade:string)=>grade.trim().toLocaleUpperCase('en-US');
// Explicit project limits for type X. No correspondence to R/T/B/S or a
// strength/ductility class is inferred from a grade name such as SD40.
export const projectMaterialRuleSchema=z.object({grade:z.string().trim().min(1).max(40),diameter:z.number().finite().positive().max(100),innerRadius:z.number().finite().positive().max(5000),formerDiameter:z.number().finite().positive().max(10000),endDimension:z.number().finite().positive().max(200000),reference:z.string().trim().min(1).max(300),basis:z.string().trim().min(1).max(1000)}).strict().superRefine((r,c)=>{if(Math.abs(r.formerDiameter-2*r.innerRadius)>1e-6)c.addIssue({code:'custom',path:['formerDiameter'],message:'ข้อกำหนด X นี้ต้องใช้เส้นผ่านศูนย์กลาง mandrel = 2 × รัศมีด้านใน ไม่อนุมานค่าที่ต่างกัน'});});
export const projectMaterialsSchema=z.object({version:z.literal(1),entries:z.array(projectMaterialRuleSchema).min(1).max(40)}).strict().superRefine((p,c)=>{const keys=new Set<string>();p.entries.forEach((r,i)=>{const key=materialGradeKey(r.grade)+'/'+r.diameter;if(keys.has(key))c.addIssue({code:'custom',path:['entries',i],message:'เกรดและขนาดของข้อกำหนด X ซ้ำ'});keys.add(key);});});
export type ProjectMaterials=z.infer<typeof projectMaterialsSchema>;
export type ProjectMaterialRule=z.infer<typeof projectMaterialRuleSchema>;
export function projectMaterialMinimum(materials:ProjectMaterials|undefined,grade:string|undefined,diameter:number){
 const parsed=projectMaterialsSchema.safeParse(materials);if(!parsed.success||!grade)return undefined;
 const rule=parsed.data.entries.find(r=>materialGradeKey(r.grade)===materialGradeKey(grade)&&r.diameter===diameter);
 return rule?{innerRadius:rule.innerRadius,formerDiameter:rule.formerDiameter,endDimension:rule.endDimension,source:`Project type X / ${rule.reference}`,projectRule:rule}:undefined;
}
