import {getDoc} from 'firebase/firestore';
import {z} from 'zod';
import {recordRef,must,fail} from './direct/common';

const idSchema=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
type Data=Record<string,any>;
async function singleSource(action:string,pid:string,data:Data,id:string){
 await (await import('./direct/specJobs')).beginDirectSpec(action,pid,data,id);let current=(await getDoc(recordRef(pid,'specChangeJobs',id))).data()!;
 while(['Applying','RollingBack'].includes(current.status))current=await (await import('./direct/specJobs')).advanceDirectSpec('advanceSpecChange',pid,{jobId:id},`${id}-step-${current.completed}-${current.rollbackCompleted||0}`);
 must(current.status==='Complete','งานรับแบบถูกยกเลิกแล้ว');return {id:data.attachment.id,jobId:id,status:current.status,completed:current.completed,total:current.total,...(data.previousAttachmentId?{previousId:data.previousAttachmentId}:{})};
}
// Commands execute locally through Firebase Web SDK transactions. Firebase Rules
// enforce identity, role, project scope and protected fields independently of UI.
export async function command(action:string,projectId:string|undefined,data:Data={},requestId:string=crypto.randomUUID()):Promise<any>{
 idSchema.parse(requestId);
 if(action==='updateOwnProfile'||action==='updateUserProfile'){must(data.profile&&typeof data.profile==='object','ข้อมูลโปรไฟล์ไม่ถูกต้อง','invalid-argument');return (await import('./direct/profiles')).updateDirectProfile(action,{profile:data.profile},requestId);}
 if(action==='createProject')return (await import('./direct/projects')).createDirectProject(data,requestId);
 if(action==='getApiProviders')return (await import('./direct/apiProviders')).getDirectApiProviders();
 if(action==='getActiveAiProvider')return (await import('./direct/apiProviders')).getDirectActiveAiProvider();
 if(action==='saveApiProviders')return (await import('./direct/apiProviders')).saveDirectApiProviders(data,requestId);
 if(action==='deleteApiProviderKey')return (await import('./direct/apiProviders')).deleteDirectApiProvider(data,requestId);
 must(projectId,'ต้องระบุโครงการ','invalid-argument');const pid=idSchema.parse(projectId);
 if(action==='listProjectAccess')return (await import('./direct/access')).listDirectAccess(pid,data);
 if(action==='listProjectAccessEvents')return (await import('./direct/access')).listDirectAccessEvents(pid,data);
 if(action==='setProjectAccess')return (await import('./direct/access')).setDirectAccess(pid,data,requestId);
 if(action==='setRole'){const roster=await (await import('./direct/access')).listDirectAccess(pid,{});return (await import('./direct/access')).setDirectAccess(pid,{target:{email:data.email},role:data.role,reason:'คำขอเปลี่ยนสิทธิ์จากรุ่นเดิม',expectedDigest:roster.digest,legacy:true},requestId);}
 if(action==='saveProject')return (await import('./direct/projects')).saveDirectProject(pid,data,requestId);
 if(action==='renumberDrawings')return (await import('./direct/drawingNumbers')).renumberDirectDrawings(pid,data,requestId);
 if(action==='deleteProject')return (await import('./direct/projects')).deleteDirectProject(pid,data,requestId);
 if(action==='copyMember')return (await import('./direct/memberCopy')).copyDirectMember(pid,data,requestId);
 if(action==='savePricing')return (await import('./direct/pricing')).saveDirectPricing(pid,data,requestId);
 if(action==='beginAreaChange')return (await import('./direct/areaChanges')).beginAreaChange(pid,data,requestId);
 if(action==='beginOccurrenceBatch')return (await import('./direct/occurrenceBatches')).beginOccurrenceBatch(pid,data,requestId);
 if(action==='revokeCode99Detail')return (await import('./direct/code99Reviews')).revokeCode99Detail(pid,data,requestId);
 if(action==='acceptCode99Detail')return (await import('./direct/code99Reviews')).acceptCode99Detail(pid,data,requestId);
 if(['saveMember','deleteMember','reviewMember'].includes(action))return (await import('./direct/members')).directMember(action,pid,data,requestId);
 if(['exportSnapshot','freezeRevision'].includes(action))return (await import('./direct/snapshotCommands')).directSnapshot(action,pid,data,requestId);
 if(['startExport','finishExport','failExport'].includes(action))return (await import('./direct/snapshotCommands')).directExport(action,pid,data,requestId);
 if(['addStock','planCutting','reserveCutting','consumeCutting','cancelCutting'].includes(action))return (await import('./direct/stock')).directStock(action,pid,data,requestId);
 if(['attach','replaceSource'].includes(action)&&data.attachment?.memberId)return (await import('./direct/sources')).directMemberSource(action,pid,data,requestId);
 if(['attach','replaceSource'].includes(action))return singleSource(action,pid,data,requestId);
 if(['annotate','reviewSource','reviewGeneralSource'].includes(action))return (await import('./direct/sources')).directSource(action,pid,data,requestId);
 if(['beginSpecChange','beginGeneralSourceRevision','beginGeneralSourceBatch','beginMemberSourceBatch','beginSourceAdoption'].includes(action))return (await import('./direct/specJobs')).beginDirectSpec(action,pid,data,requestId);
 if(['advanceSpecChange','cancelSpecChange'].includes(action))return (await import('./direct/specJobs')).advanceDirectSpec(action,pid,data,requestId);
 if(action==='beginRestore')return (await import('./direct/restoreJobs')).beginDirectRestore(pid,data,requestId);
 if(['advanceRestore','cancelRestore'].includes(action))return (await import('./direct/restoreJobs')).advanceDirectRestore(action,pid,data,requestId);
 if(action==='prepareSubmission')return (await import('./direct/submissionCommands')).prepareDirectSubmission(pid,data,requestId);
 if(['startSubmission','finishSubmission','failSubmission'].includes(action))return (await import('./direct/submissionCommands')).directSubmission(action,pid,data,requestId);
 if(action==='supersedeRevision')return (await import('./direct/submissionCommands')).supersedeDirectRevision(pid,data,requestId);
 if(action==='createEngineeringFixture')return (await import('./direct/engineeringFixtures')).createEngineeringFixture(pid,data,requestId);
 if(action==='runEngineeringFixtures')return (await import('./direct/engineeringFixtures')).runEngineeringFixtures(pid,data,requestId);
 if(action==='approveEngineeringSpec')return (await import('./direct/release')).approveEngineeringSpec(pid,data,requestId);
 if(action==='prepareIssue')return (await import('./direct/release')).prepareIssue(pid,data,requestId);
 if(action==='inspectIssue')return (await import('./releaseReview')).inspectRelease(pid,idSchema.parse(data.revisionId)).then(r=>r.report);
 if(action==='issue')return (await import('./direct/release')).issueRevision(pid,data,requestId);
 fail('ไม่รองรับคำสั่ง '+action,'invalid-argument');
}
