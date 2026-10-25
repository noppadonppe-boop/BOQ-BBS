import {z} from 'zod';
import {currentStarterSpec,specSchema,type Spec} from './model';
import {APP_NAME} from './auth';
import {codeDataSchema,codeValues,designCodeIdSchema,lapConcrete,lapGrades,type DesignCodeId} from './designCodes';
import type {ProjectDesign} from './specDetailing';
import {concreteSpecSchema} from './concreteMixes';
export {DEFAULT_DESIGN,designOf,detailingFromSpec,specLabel,type ProjectDesign} from './specDetailing';

// General Spec profiles live outside projects (workspace level). A project picks one profile
// plus its own f'c / steel grade; project.spec is the resolved copy of that profile and carries
// spec.profileRef so every project using a profile can be found and re-synced (live link).
export const specProfilesPath=`${APP_NAME}/root/specProfiles`;
export type SpecProfile={id:string;name:string;description:string;spec:Spec;version:number;createdAt:string;updatedAt:string;updatedBy:string;archived?:boolean};
export const specProfileInput=z.object({name:z.string().trim().min(1).max(120),description:z.string().max(1000).default(''),spec:specSchema});
export const designConcrete=lapConcrete;
export const designGrades=lapGrades;

/** Profile-owned part of a spec (no project link / project design / approval evidence). */
export function profileSpec(spec:Spec):Spec{
 const {profileRef:_r,projectDesign:_d,...rest}=spec;
 return {...rest,approved:false,evidenceFileId:''};
}
/** The spec a project uses for `profile` with its own f'c / grade. */
export function projectSpecFrom(profile:Pick<SpecProfile,'id'|'name'|'version'|'spec'>,design:ProjectDesign):Spec{
 return {...profileSpec(profile.spec),profileRef:{id:profile.id,version:profile.version,name:profile.name.slice(0,120)},projectDesign:design};
}
/** Linked profile has a newer version than the project's copy. */
export const specOutdated=(spec:Spec,profiles:SpecProfile[])=>{const p=spec.profileRef&&profiles.find(x=>x.id===spec.profileRef!.id);return !!p&&p.version>spec.profileRef!.version;};
export const starterProfileSpec=():Spec=>({...currentStarterSpec,designCode:'ACI'});

// Spec import file (e.g. values read from a project's General Notes): per code, lap rows are merged by
// bar size into the current table, beam / grades replace, provisions are merged by id.
const importCodeSchema=z.object({lapRows:codeDataSchema.shape.lap,beam:codeDataSchema.shape.beam,grades:codeDataSchema.shape.grades,provisions:codeDataSchema.shape.provisions}).strict();
export const specImportSchema=z.object({format:z.literal('form-spec-import'),source:z.string().max(300).default(''),description:z.string().max(1000).optional(),aciEdition:z.string().max(60).optional(),
 codes:z.partialRecord(designCodeIdSchema,importCodeSchema),
 /** concrete mixes + member types (replaces the spec's) */
 concrete:concreteSpecSchema.optional()}).strict();
export type SpecImport=z.infer<typeof specImportSchema>;
/** Apply an import file to a spec; returns the new spec and a short list of what changed. */
export function applySpecImport(spec:Spec,input:SpecImport){
 const codeData={...spec.codeData},notes:string[]=[];
 for(const [code,part] of Object.entries(input.codes) as [DesignCodeId,z.infer<typeof importCodeSchema>][]){
  const v=codeValues(spec.codeData,code),own={...codeData[code]};
  if(part.lapRows){own.lap={...own.lap};for(const [key,rows] of Object.entries(part.lapRows)){const m=new Map((v.lap[key]||[]).map(r=>[r.bar,r]));rows.forEach(r=>m.set(r.bar,r));own.lap[key]=[...m.values()].sort((a,b)=>a.bar-b.bar);}notes.push(`ระยะทาบ ${Object.keys(part.lapRows).length} ตาราง`);}
  if(part.beam){own.beam=part.beam;notes.push('การเสริมเหล็กคาน');}
  if(part.grades){own.grades=part.grades;notes.push(`เกรดเหล็ก ${part.grades.length} ขนาด`);}
  if(part.provisions){const m=new Map((own.provisions||[]).map(p=>[p.id,p]));part.provisions.forEach(p=>m.set(p.id,p));own.provisions=[...m.values()];notes.push(`ข้อกำหนดเพิ่มเติม ${part.provisions.length} ข้อ`);}
  codeData[code]=own;
 }
 if(input.concrete)notes.push(`คอนกรีต ${input.concrete.mixes.length} Mix · ${input.concrete.uses.length} ประเภทชิ้นส่วน`);
 return {spec:{...spec,codeData,...(input.aciEdition?{aciEdition:input.aciEdition}:{}),...(input.concrete?{concrete:input.concrete}:{})},notes};
}
