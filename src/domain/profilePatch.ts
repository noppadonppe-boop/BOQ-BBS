import {z} from 'zod';
import {approvalStatuses,userRoles} from './auth';
import {projectRoles} from './projectAccess';

const projectId=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).refine(id=>!/^__.*__$/.test(id),'รหัสนี้เป็นรหัสสงวนของ Firestore');
const unique=(values:readonly string[])=>new Set(values).size===values.length;
const projectRoleList=z.array(z.enum(projectRoles)).min(1).max(5).refine(unique,'Role ของโครงการต้องไม่ซ้ำ');
// Validate every requested key before building own data properties. Reserved
// Firestore IDs are rejected, and valid names such as constructor stay literal.
// A malformed scope must never silently become the account's broader fallback.
const projectRoleMap=z.custom<Record<string,unknown>>(v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null))
 .transform(v=>Object.entries(v)).pipe(z.array(z.tuple([projectId,projectRoleList])).max(500)).transform(v=>Object.fromEntries(v));
export function setProfileProjectRoles(target:Record<string,import('./model').Role[]>,id:string,roles:import('./model').Role[]){
 Object.defineProperty(target,id,{value:[...roles],enumerable:true,configurable:true,writable:true});
}
const fields={
 profileVersion:z.number().int().positive(),
 firstName:z.string().max(200).optional(),lastName:z.string().max(200).optional(),
 position:z.string().max(200).optional(),department:z.string().max(200).optional(),
 photoURL:z.string().max(2000).optional(),
};
// Historical identity/Timestamp fields may accompany a patch; they are never
// copied into the update. Existing own-profile behavior ignores access fields.
export const ownProfilePatchSchema=z.object(fields).passthrough();
const profileEmail=z.string().trim().toLowerCase().regex(z.regexes.html5Email).max(320).refine(value=>{
 const [local,domain]=value.split('@');
 return !!domain?.includes('.')&&!/[\/\\]/.test(value)&&!local.startsWith('.')&&!local.endsWith('.')&&!local.includes('..');
},'อีเมลต้องเป็นข้อมูลบัญชีในเอกสารเดียว ไม่ใช่เส้นทางย่อย');
export const adminProfilePatchSchema=z.object({
 ...fields,email:profileEmail,
 roles:z.array(z.enum(userRoles)).min(1).max(9).refine(unique,'Role ต้องไม่ซ้ำ').optional(),
 status:z.enum(approvalStatuses).optional(),
 assignedProjects:z.array(projectId).max(500).optional(),
 projectRoles:projectRoleMap.optional(),
}).passthrough();
