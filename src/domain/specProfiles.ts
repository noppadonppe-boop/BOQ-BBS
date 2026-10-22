import {z} from 'zod';
import {currentStarterSpec,specSchema,type Spec} from './model';
import {APP_NAME} from './auth';
import {lapConcrete,lapGrades} from './designCodes';
import type {ProjectDesign} from './specDetailing';
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
