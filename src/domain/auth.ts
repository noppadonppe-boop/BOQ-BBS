import type {Timestamp} from 'firebase/firestore';

const viteEnv=(import.meta as ImportMeta&{env?:Record<string,string|undefined>}).env||{};
export const APP_NAME=viteEnv.VITE_APP_NAME||'my-boq-app';

export const userRoles=['MasterAdmin','SuperAdmin','Admin','admin','Staff','qs','checker','approver','viewer'] as const;
export type UserRole=typeof userRoles[number];
export const roleLabels:Record<UserRole,string>={
 // stored value 'SuperAdmin' is kept for existing accounts; it is shown as ProjectAdmin
 MasterAdmin:'MasterAdmin',SuperAdmin:'ProjectAdmin',Admin:'Admin (เดิม)',admin:'ผู้ดูแลโครงการ',Staff:'Staff',
 qs:'ผู้ถอดปริมาณ',checker:'ผู้ตรวจ',approver:'ผู้อนุมัติ',viewer:'ผู้อ่าน'
};
export const roleDescriptions:Record<UserRole,string>={
 MasterAdmin:'ดูแลระบบทั้งหมด · อนุมัติผู้ใช้ กำหนด Role / โครงการ · จัดการ API · ทำได้ทุกอย่างในทุกโครงการ',
 SuperAdmin:'ผู้ดูแลโครงการที่ได้รับมอบหมาย · สร้างโครงการ · จัดการ General Spec ส่วนกลาง · ทีม สิทธิ์ และ Backup ของโครงการ',
 Admin:'เหมือน ProjectAdmin (ชื่อ Role แบบเดิม)',admin:'เหมือน ProjectAdmin (ชื่อ Role แบบเดิม)',
 Staff:'ผู้ใช้งานทั่วไป · อ่านข้อมูลในโครงการที่ได้รับมอบหมาย จนกว่าจะกำหนด Role งาน',
 qs:'เพิ่มและแก้สมาชิก แบบอ้างอิง BOQ และ BBS',
 checker:'ตรวจข้อมูลและยืนยันสถานะ Checked',
 approver:'ตรวจและอนุมัติสมาชิกตามขั้นตอนของโครงการ',
 viewer:'อ่านข้อมูลและดาวน์โหลดไฟล์ตามสิทธิ์โครงการ'
};
export const approvalStatuses=['pending','approved','rejected'] as const;
export type ApprovalStatus=typeof approvalStatuses[number];
export interface UserProfile{
 uid:string;
 email:string;
 firstName:string;
 lastName:string;
 position:string;
 department?:string;
 role?:UserRole;
 roles:UserRole[];
 status:ApprovalStatus;
 assignedProjects:string[];
 projectRoles?:Record<string,import('./model').Role[]>;
 createdAt:Timestamp;
 profileVersion?:number;
 photoURL?:string;
 isFirstUser:boolean;
}
export interface AppMetaConfig{firstUserRegistered:boolean;totalUsers:number;createdAt:Timestamp;}
export const userCollectionPath=`${APP_NAME}/root/users`;
export const userDocPath=(email:string)=>`${userCollectionPath}/${email.trim().toLowerCase()}`;
export const appMetaConfigPath=`${APP_NAME}/root/appMeta/config`;
export const activityLogsPath=`${APP_NAME}/root/activityLogs`;
export const isMasterAdmin=(profile:Pick<UserProfile,'roles'|'status'>|null|undefined)=>profile?.status==='approved'&&profile.roles.includes('MasterAdmin');
export const isAdminUser=(profile:Pick<UserProfile,'roles'|'status'>|null|undefined)=>!!profile?.roles.some(role=>['MasterAdmin','SuperAdmin','Admin','admin'].includes(role));
export const displayName=(profile:Pick<UserProfile,'firstName'|'lastName'|'email'>|null|undefined)=>{
 if(!profile)return 'ผู้ใช้งาน';
 const name=`${profile.firstName||''} ${profile.lastName||''}`.trim();
 return name||profile.email;
};
export const initials=(profile:Pick<UserProfile,'firstName'|'lastName'|'email'>|null|undefined)=>{
 const name=displayName(profile).trim();
 return name.split(/\s+/).map(v=>v[0]).join('').slice(0,2).toUpperCase()||'US';
};
