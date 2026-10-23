import {auth,command} from './firebase';
import type {Attachment,Member,Project} from '../domain/model';
import {apiProviderDefinitions,modelDefinition} from '../domain/apiProviders';
import {aiDrawingAnalysisConfigured,readGatewayStream,type AiAnalysisProgress} from './aiDrawingAnalysis';
import type {ShapeProposal} from '../domain/shapeProposal';
import type {DrawingView} from './drawingViews';

export const aiShapeConfigured=aiDrawingAnalysisConfigured;
/** Sends one drawing file to the AI gateway (task "shape"); `current` = proposal from the previous files to refine. */
export async function analyseShapeWithAI({attachment,member,project,role,current,views,signal,onProgress}:{attachment:Attachment;member:Member;project:Project;role:string;current?:ShapeProposal;views?:DrawingView[];signal?:AbortSignal;onProgress?:(p:AiAnalysisProgress)=>void}):Promise<ShapeProposal>{
 const url=String(import.meta.env.VITE_AI_DRAWING_ANALYSIS_ENDPOINT||'').trim();
 if(!url)throw Error('ยังไม่ได้ตั้งค่า VITE_AI_DRAWING_ANALYSIS_ENDPOINT สำหรับบริการวิเคราะห์แบบด้วย AI');
 const user=auth.currentUser;if(!user)throw Error('กรุณาเข้าสู่ระบบก่อนส่งแบบให้ AI');
 const token=await user.getIdToken(),active=await command('getActiveAiProvider',undefined);
 if(!active?.activeProvider||!active.settings?.model||!active.settings.hasApiKey)throw Error('ยังไม่ได้เลือกค่าย AI และตั้งค่า API Key ในหน้า จัดการ API');
 const def=apiProviderDefinitions.find(d=>d.id===active.activeProvider),model=modelDefinition(active.activeProvider,active.settings.model);
 const context={task:'shape',drawingRole:role,views,currentShape:current?{parts:current.parts,piles:current.piles,site:current.site}:undefined,
  projectId:project.id,memberId:member.id,memberCode:member.code,category:member.category,attachmentId:attachment.id,fileName:attachment.name,pages:attachment.pageCount||1,contentType:attachment.contentType,
  aiProvider:active.activeProvider,aiModel:active.settings.model,aiThinking:active.settings.thinking,aiThinkingParameter:def?.thinkingParameter,aiModelThinkingOptions:model?.thinking.map(o=>o.setting)};
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({context}),signal:signal||AbortSignal.timeout(540000)});
 const body=await readGatewayStream(response,onProgress||(()=>{}));
 if(body?.task!=='shape')throw Error('บริการ AI ยังไม่รองรับการอ่านรูปทรง · ผู้ดูแลระบบต้อง Deploy Cloud Function analyseDrawing รุ่นใหม่');
 return body as ShapeProposal;
}
