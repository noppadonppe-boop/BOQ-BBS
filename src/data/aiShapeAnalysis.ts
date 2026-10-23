import {auth,command} from './firebase';
import type {Attachment,Member,Project} from '../domain/model';
import {apiProviderDefinitions,modelDefinition} from '../domain/apiProviders';
import {aiDrawingAnalysisConfigured,readGatewayStream,type AiAnalysisProgress} from './aiDrawingAnalysis';
import type {ElementInventory,InventoryElement,ShapeAnswer,ShapeProposal} from '../domain/shapeProposal';
import type {DrawingView} from './drawingViews';

export const aiShapeConfigured=aiDrawingAnalysisConfigured;
type Common={attachment:Attachment;member:Member;project:Project;views?:DrawingView[];cadText?:string;signal?:AbortSignal;onProgress?:(p:AiAnalysisProgress)=>void};
/** One gateway request for a custom-element task ("shape" / "inventory") on one drawing file. */
async function gateway(task:'shape'|'inventory',{attachment,member,project,views,cadText,signal,onProgress}:Common,extra:Record<string,unknown>){
 const url=String(import.meta.env.VITE_AI_DRAWING_ANALYSIS_ENDPOINT||'').trim();
 if(!url)throw Error('ยังไม่ได้ตั้งค่า VITE_AI_DRAWING_ANALYSIS_ENDPOINT สำหรับบริการวิเคราะห์แบบด้วย AI');
 const user=auth.currentUser;if(!user)throw Error('กรุณาเข้าสู่ระบบก่อนส่งแบบให้ AI');
 const token=await user.getIdToken(),active=await command('getActiveAiProvider',undefined);
 if(!active?.activeProvider||!active.settings?.model||!active.settings.hasApiKey)throw Error('ยังไม่ได้เลือกค่าย AI และตั้งค่า API Key ในหน้า จัดการ API');
 const def=apiProviderDefinitions.find(d=>d.id===active.activeProvider),model=modelDefinition(active.activeProvider,active.settings.model);
 const context={task,views,cadText,...extra,
  projectId:project.id,memberId:member.id,memberCode:member.code,category:member.category,attachmentId:attachment.id,fileName:attachment.name,pages:attachment.pageCount||1,contentType:attachment.contentType,
  aiProvider:active.activeProvider,aiModel:active.settings.model,aiThinking:active.settings.thinking,aiThinkingParameter:def?.thinkingParameter,aiModelThinkingOptions:model?.thinking.map(o=>o.setting)};
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({context}),signal:signal||AbortSignal.timeout(540000)});
 const body=await readGatewayStream(response,onProgress||(()=>{}));
 if(body?.task!==task)throw Error(`บริการ AI ยังไม่รองรับงาน "${task}" · ผู้ดูแลระบบต้อง Deploy Cloud Function analyseDrawing รุ่นใหม่`);
 return body;
}
/** Sends one drawing file to the AI gateway (task "shape"); `current` = proposal from the previous files to refine; `target` = the element mark to model. */
export async function analyseShapeWithAI({role,current,answers,target,...common}:Common&{role:string;current?:ShapeProposal;answers?:ShapeAnswer[];target?:InventoryElement}):Promise<ShapeProposal>{
 return await gateway('shape',common,{drawingRole:role,answers,currentShape:current?{parts:current.parts,piles:current.piles,site:current.site,levels:current.levels,rebarNotes:current.rebarNotes}:undefined,
  ...(target?{targetMark:target.mark,targetInfo:[target.title,target.size,target.levels,target.pages.length?`หน้า ${target.pages.join(', ')}`:'',target.views.map(v=>v.name).join(' / ')].filter(Boolean).join(' · ')}:{})}) as ShapeProposal;
}
/** Lists the element marks in one drawing file and whether each has enough data to model (task "inventory"). */
export async function inventoryWithAI(common:Common):Promise<ElementInventory>{
 return await gateway('inventory',common,{}) as ElementInventory;
}
