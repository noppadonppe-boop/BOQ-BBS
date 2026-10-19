import type {Role} from './model';

export const projectRoles:Role[]=['admin','qs','checker','approver','viewer'];
export const roleLabels:Record<Role,string>={admin:'ผู้ดูแลโครงการ',qs:'ผู้ถอดปริมาณ',checker:'ผู้ตรวจ',approver:'ผู้อนุมัติ',viewer:'ผู้อ่าน'};
export const roleDescriptions:Record<Role,string>={
 admin:'จัดการข้อมูลโครงการ ทีม และสิทธิ์ผู้ใช้',
 qs:'เพิ่มและแก้สมาชิก แบบอ้างอิง BOQ และ BBS',
 checker:'ตรวจข้อมูลและยืนยันสถานะ Checked',
 approver:'ตรวจและอนุมัติสมาชิกตามขั้นตอนของโครงการ',
 viewer:'อ่านข้อมูลและดาวน์โหลดไฟล์ตามสิทธิ์โครงการ'
};
export const roleLabel=(role:string|null|undefined)=>role&&projectRoles.includes(role as Role)?roleLabels[role as Role]:role?'บทบาทไม่รองรับ':'ไม่มีสิทธิ์';
export type AccessUser={uid:string;role:string;roles?:Role[];email?:string;displayName?:string;accountState:'active'|'disabled'|'missing';self:boolean};
export type AccessRoster={users:AccessUser[];total:number;digest:string;nextCursor?:string};
export type AccessEvent={id:string;actorUid:string;targetUid:string;beforeRole:string|null;afterRole:string|null;reason:string;createdAt:string;beforeDigest:string;afterDigest:string;legacy:boolean};
export type DisplayAccessEvent=AccessEvent&{actorLabel:string;targetLabel:string};
export type AccessEventPage={events:DisplayAccessEvent[];nextCursor?:{at:string;id:string}};
// A pure policy shared by server checks and UI explanation. Authentication and
// actual account lookup remain server responsibilities.
export function planProjectAccess(acl:Record<string,string>,actor:string,target:string,next:Role|'remove',systemAdmin=false){
 if(!systemAdmin&&(!Object.hasOwn(acl,actor)||acl[actor]!=='admin'))throw Error('เฉพาะผู้ดูแลโครงการเท่านั้น');
 if(!target||target.length>128||target.includes('/'))throw Error('รหัสบัญชีไม่ถูกต้อง');
 if(!projectRoles.includes(next as Role)&&next!=='remove')throw Error('บทบาทไม่รองรับ');
 if(target===actor)throw Error('ให้ผู้ดูแลอีกคนเปลี่ยนสิทธิ์ของคุณ');
 const beforeRole=Object.hasOwn(acl,target)?acl[target]:null,afterRole=next==='remove'?null:next;
 const updated={...acl};if(afterRole===null)delete updated[target];else Object.defineProperty(updated,target,{value:afterRole,enumerable:true,configurable:true,writable:true});
 if(!Object.values(updated).includes('admin'))throw Error('ต้องมีผู้ดูแลโครงการอย่างน้อยหนึ่งคน');
 return {acl:updated,beforeRole,afterRole,changed:beforeRole!==afterRole};
}
