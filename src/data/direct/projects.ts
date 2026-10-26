import {doc,runTransaction} from 'firebase/firestore';
import {z} from 'zod';
import {db} from '../firebase';
import {currentStarterSpec,Project,specSchema} from '../../domain/model';
import {userDocPath} from '../../domain/auth';
import {projectProfileRoles,profileMaster} from '../../domain/authAccess';
import {drawingProfileSchema,sheetSizeSchema,viewScaleSchema} from '../../domain/drawingStandard';
import {parseLocations} from '../../domain/locations';
import {disciplines} from '../../domain/disciplines';
import {boqChaptersSchema} from '../../domain/boqChapters';
import {digestData} from '../snapshots';
import {actor,directory,directoryRef,profileOperationRef,projectRef,projectTransaction,encode,must,now} from './common';

const logo=z.object({path:z.string().regex(/^projects\/[a-zA-Z0-9_-]{1,80}\/branding\/[a-zA-Z0-9._-]{1,120}$/),name:z.string().min(1).max(250),contentType:z.enum(['image/png','image/jpeg']),size:z.number().int().positive().max(2*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
// code = Project No., owner = Client, notes = input note.
const input=z.object({code:z.string().trim().min(1).max(50),name:z.string().trim().min(1).max(200),location:z.string().max(300).default(''),owner:z.string().max(200).default(''),contractor:z.string().max(200).default(''),subcontractor:z.string().max(200).default(''),notes:z.string().max(10000).default(''),logo:logo.nullable().optional()});
const titleBlock=z.object({company:z.string().max(200),drawnBy:z.string().max(120),checkedBy:z.string().max(120),approvedBy:z.string().max(120).optional(),drawingPrefix:z.string().max(50),drawingSuffix:z.string().max(50).optional(),drawingParts:z.array(z.string().max(50)).max(8).optional(),sheetLanguage:z.enum(['th','en','zh']).optional(),sheetSize:sheetSizeSchema.optional(),viewScale:viewScaleSchema.optional()});
export async function createDirectProject(data:Record<string,any>,id:string){
 const parsed=input.extend({company:z.string().max(200).default(''),spec:specSchema.optional()}).parse(data.project),inputHash=await digestData({action:'createProject',data});
 if(parsed.logo)must(parsed.logo.path.startsWith(`projects/${id}/`),'ไฟล์โลโก้ไม่ตรงโครงการ','invalid-argument');
 return runTransaction(db,async tx=>{
  const u=await actor(tx);must(profileMaster(u)||projectProfileRoles(u.roles).includes('admin'),'เฉพาะผู้ดูแลที่ได้รับอนุมัติสร้างโครงการ','permission-denied');
  const or=profileOperationRef(id),os=await tx.get(or),pr=projectRef(id),ps=await tx.get(pr);
  if(os.exists()){must(os.data().uid===u.uid&&os.data().inputHash===inputHash,'รหัสคำขอถูกใช้แล้ว','aborted');return os.data().result;}
  must(!ps.exists(),'มีโครงการที่ใช้รหัสคำขอนี้แล้ว','aborted');
  const {company,spec,...fields}=parsed;
  // spec = resolved copy of the chosen workspace General Spec profile (+ project f'c / grade)
  const p:Project={...fields,logo:fields.logo||null,id,acl:{[u.uid]:'admin'},roleSets:{[u.uid]:['admin']},version:1,createdAt:now(),spec:spec?{...spec,approved:false,evidenceFileId:''}:currentStarterSpec,titleBlock:{company,drawnBy:'',checkedBy:'',drawingPrefix:parsed.code}},next={...u,assignedProjects:[...new Set([...u.assignedProjects,id])],projectRoles:{...u.projectRoles,[id]:['admin'] as const},profileVersion:(u.profileVersion||1)+1};
  tx.set(pr,encode(p));tx.update(doc(db,userDocPath(u.email)),{assignedProjects:next.assignedProjects,projectRoles:next.projectRoles,profileVersion:next.profileVersion,updatedAt:now(),accessChange:{projectId:id,operationId:id,kind:'CreateProject'}});
  tx.set(directoryRef(u.uid),directory({...next,projectRoles:{...u.projectRoles,[id]:['admin']}}));
  const result={id};tx.set(or,encode({id,uid:u.uid,email:u.email,action:'createProject',inputHash,createdAt:now(),result}));return result;
 });
}
export async function saveDirectProject(pid:string,data:Record<string,any>,id:string){
 const parsed=input.extend({titleBlock,drawingProfile:drawingProfileSchema.nullable().optional(),disciplines:z.array(z.enum(disciplines)).min(1).max(disciplines.length).optional()}).parse(data.project);
 if(parsed.logo)must(parsed.logo.path.startsWith(`projects/${pid}/`),'ไฟล์โลโก้ไม่ตรงโครงการ','invalid-argument');
 return projectTransaction('saveProject',pid,data,id,['admin'],async(tx,p)=>{must(p.version===data.version,'ข้อมูลเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนบันทึก','aborted');tx.update(projectRef(pid),encode({...parsed,logo:parsed.logo||null,version:p.version+1}));return {version:p.version+1};});
}
/** Project Location / WBS tree (buildings, external works, levels, zones, segments). */
export async function saveDirectLocations(pid:string,data:Record<string,any>,id:string){
 const locations=parseLocations(data.locations);
 return projectTransaction('saveLocations',pid,data,id,['admin','qs'],async(tx,p)=>{must(p.version===data.version,'ข้อมูลเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนบันทึก','aborted');tx.update(projectRef(pid),encode({locations:{...locations,version:(p.locations?.version||0)+1},version:p.version+1}));return {version:p.version+1};});
}
/** Owner / consultant BOQ chapters of the project (null clears them). */
export async function saveDirectBoqChapters(pid:string,data:Record<string,any>,id:string){
 const chapters=data.chapters===null?null:boqChaptersSchema.parse(data.chapters);
 return projectTransaction('saveBoqChapters',pid,data,id,['admin','qs'],async(tx,p)=>{must(p.version===data.version,'ข้อมูลเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนบันทึก','aborted');tx.update(projectRef(pid),encode({boqChapters:chapters?{...chapters,version:(p.boqChapters?.version||0)+1}:null,version:p.version+1}));return {version:p.version+1};});
}
/** Soft delete: the project is hidden from every list and becomes read-only; members,
 * files and history are kept so the deletion can be reviewed or reversed by an administrator. */
export async function deleteDirectProject(pid:string,data:Record<string,any>,id:string){
 const confirmCode=z.string().trim().min(1).max(50).parse(data.confirmCode),reason=z.string().trim().max(500).default('').parse(data.reason??'');
 return projectTransaction('deleteProject',pid,data,id,['admin'],async(tx,p,u)=>{
  must(p.version===data.version,'ข้อมูลเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนลบ','aborted');must(!p.deleted,'โครงการถูกลบแล้ว','aborted');
  must(confirmCode===p.code,'Project No. ที่ยืนยันไม่ตรงกับโครงการ','invalid-argument');
  tx.update(projectRef(pid),{deleted:{at:now(),by:u.uid,reason},version:p.version+1});return {version:p.version+1};
 });
}
