import type {Role} from './model';
import {projectRoles} from './projectAccess';
export type AccessProfile={uid:string;email:string;roles:string[];role?:string;status:string;assignedProjects:string[];projectRoles?:Record<string,Role[]>};
export const normalizedRoles=(roles:readonly string[]):Role[]=>projectRoles.filter(r=>roles.includes(r)||r==='admin'&&roles.some(x=>['Admin','SuperAdmin'].includes(x)));
export const profileApproved=(p:AccessProfile|undefined|null,uid:string,email:string)=>!!p&&p.uid===uid&&p.email.toLowerCase()===email.toLowerCase()&&p.status==='approved';
const profileRoles=(p:AccessProfile)=>Array.isArray(p.roles)?p.roles:p.role?[p.role]:[];
export const profileMaster=(p:AccessProfile|undefined|null)=>p?.status==='approved'&&profileRoles(p).includes('MasterAdmin')||false;
export function assignedRoles(p:AccessProfile,pid:string):Role[]{
 if(p.status!=='approved')return [];
 if(profileMaster(p))return [...projectRoles];
 if(!p.assignedProjects.includes(pid))return [];
 const roles=Object.hasOwn(p.projectRoles||{},pid)?normalizedRoles(p.projectRoles![pid]):normalizedRoles(profileRoles(p));
 return roles.length?roles:['viewer'];
}
export const hasRoles=(roles:readonly string[],allowed:readonly string[])=>roles.some(r=>allowed.includes(r));
export function projectProfileRoles(roles:readonly string[]):Role[]{if(roles.includes('MasterAdmin'))return ['admin'];const result=normalizedRoles(roles);return result.length?result:['viewer'];}
