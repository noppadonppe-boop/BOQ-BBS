import {z} from 'zod';
import type {Member,Project,SnapshotBundle,DrawingLayout} from './model';
const text=(n:number)=>z.string().trim().max(n);
export const drawingSetupSchema=z.object({number:text(80),revision:text(16),title:text(120),numberKey:text(200).optional()});
export type DrawingSetup=z.infer<typeof drawingSetupSchema>;
export const drawingProfileSchema=z.object({template:z.literal('owner-v1'),language:z.enum(['th','en']),projectName:text(80).min(1),company:text(80),owner:text(80),location:text(80),contract:text(50),discipline:text(50),preparedBy:text(60),checkedBy:text(60),indexNumber:text(80),indexRevision:text(16)});
export type DrawingProfile=z.infer<typeof drawingProfileSchema>;
export const titleBlockSchema=z.object({company:z.string().max(300),drawnBy:z.string().max(200),checkedBy:z.string().max(200),drawingPrefix:z.string().max(80)});
export const drawingNumberKey=(s:string)=>s.normalize('NFC').trim().toLowerCase();
export function drawingReferences(b:SnapshotBundle,layout:DrawingLayout){
 if(!b.project.drawingProfile)return [];
 const refs=b.members.map(m=>({memberId:m.id,memberCode:m.code,number:m.drawingSetup?.number||'',revision:m.drawingSetup?.revision||'',title:m.drawingSetup?.title||''}));
 if(layout==='source-v9')refs.push({memberId:'',memberCode:'Source index',number:b.project.drawingProfile.indexNumber,revision:b.project.drawingProfile.indexRevision,title:'Source Mark index'});
 for(const r of refs)if(!r.number||!r.revision||!r.title)throw Error(`${r.memberCode}: ระบุเลขแบบ BBS, Revision และชื่อแบบให้ครบ`);
 const used=new Set<string>();for(const r of refs){const key=drawingNumberKey(r.number);if(used.has(key))throw Error(`เลขแบบ BBS ซ้ำ: ${r.number}`);used.add(key);}return refs;
}
export function validateDrawingNumbers(members:Member[]){const used=new Map<string,string>();for(const m of members){if(!m.drawingSetup?.number)continue;const key=drawingNumberKey(m.drawingSetup.number);if(used.has(key))throw Error(`เลขแบบ BBS ซ้ำ: ${used.get(key)} / ${m.code}`);used.set(key,m.code);}}
export function drawingProfileDraft(p:Project):DrawingProfile{return {template:'owner-v1',language:'th',projectName:p.name,company:p.titleBlock.company,owner:p.owner,location:p.location,contract:'',discipline:'Civil / Reinforcement',preparedBy:p.titleBlock.drawnBy,checkedBy:p.titleBlock.checkedBy,indexNumber:'',indexRevision:''};}
export type DrawingReference=ReturnType<typeof drawingReferences>[number];

export function drawingLabels(language:'th'|'en'){return language==='en'?{owner:'Owner',site:'Site',contract:'Contract',discipline:'Discipline',title:'Drawing title',number:'Drawing No.',rev:'Drawing Rev.',by:'Prepared',check:'Checked name',sheet:'Sheet',qty:'Member qty'}:{owner:'เจ้าของ',site:'ที่ตั้ง',contract:'สัญญา',discipline:'งาน',title:'ชื่อแบบ',number:'เลขแบบ',rev:'Revision แบบ',by:'เขียนแบบ',check:'ชื่อผู้ตรวจ',sheet:'แผ่น',qty:'จำนวนสมาชิก'};}
