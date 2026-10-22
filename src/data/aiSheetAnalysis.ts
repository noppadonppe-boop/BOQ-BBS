import {auth,command} from './firebase';
import {readGatewayStream,type AiAnalysisProgress} from './aiDrawingAnalysis';
import {sheetGroupSchema,sheetDetailSchema,type SheetGroup,type SheetDetail} from '../domain/aiSheet';
import type {Attachment,Project} from '../domain/model';
export type SheetMap={page:number;pages:number;sourceDigest:string;groups:SheetGroup[];warnings:string[];preview:string};
export type SheetResult={result:SheetDetail;executionError:string;sourceDigest:string;provider:string;model:string;savedMember?:import('../domain/model').Member};
async function request(project:Project,attachment:Attachment,context:Record<string,unknown>,signal:AbortSignal,onProgress:(p:AiAnalysisProgress)=>void){
 const endpoint=String(import.meta.env.VITE_AI_DRAWING_ANALYSIS_ENDPOINT||'').trim();
 if(!endpoint)throw Error('ยังไม่ได้ตั้งค่าบริการ AI');
 if(!auth.currentUser)throw Error('กรุณาเข้าสู่ระบบ');
 const active=await command('getActiveAiProvider',undefined);
 if(!active?.activeProvider||!active.settings?.model||!active.settings.hasApiKey)throw Error('กรุณาเลือกค่าย AI และบันทึก API Key ในหน้า จัดการ API');
 onProgress({phase:'sending-request',label:'กำลังส่งคำขอวิเคราะห์',detail:`${active.activeProvider} · ${active.settings.model}`});
 const token=await auth.currentUser.getIdToken();
 const timeout=AbortSignal.timeout(480000);
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({context:{projectId:project.id,attachmentId:attachment.id,...context,aiProvider:active.activeProvider,aiModel:active.settings.model}}),signal:AbortSignal.any([signal,timeout])});
  return await readGatewayStream(response,onProgress);
 }catch(e){if(timeout.aborted&&!signal.aborted)throw Error('AI ไม่ส่งผลภายใน 8 นาที กรุณาลองใหม่หรือลดระดับการคิด');throw e;}
}
export async function mapSheet(project:Project,attachment:Attachment,page:number,sourceDigest:string|undefined,signal:AbortSignal,onProgress:(p:AiAnalysisProgress)=>void):Promise<SheetMap>{
 const r=await request(project,attachment,{task:'sheet-map',page,sourceDigest},signal,onProgress);
 if(r?.task!=='sheet-map')throw Error('Backend ยังไม่รองรับการแยกกลุ่มแบบ กรุณา Deploy รุ่นใหม่');
 if(!Number.isInteger(r.pages)||r.pages<1||r.page!==page||typeof r.sourceDigest!=='string'||!Array.isArray(r.groups))throw Error('ผลสำรวจหน้าไม่ถูกต้อง');
 return {...r,groups:r.groups.map((g:unknown)=>sheetGroupSchema.parse(g))};
}
export async function readSheetGroup(project:Project,attachment:Attachment,group:SheetGroup,sourceDigest:string,signal:AbortSignal,onProgress:(p:AiAnalysisProgress)=>void):Promise<SheetResult>{
 const r=await request(project,attachment,{task:'sheet-detail',group,sourceDigest},signal,onProgress);
 if(r?.task!=='sheet-detail'||r.sourceDigest!==sourceDigest)throw Error('ผลอ่านรายละเอียดไม่ตรงกับไฟล์');
 return {...r,result:sheetDetailSchema.parse(r.result)};
}
