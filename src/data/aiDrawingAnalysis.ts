import {auth,command} from './firebase';
import type {Attachment,Member,Project} from '../domain/model';
import type {AiDrawingAnalysis} from '../domain/aiDrawingAnalysis';
import {apiProviderDefinitions,modelDefinition} from '../domain/apiProviders';

const endpoint=()=>String(import.meta.env.VITE_AI_DRAWING_ANALYSIS_ENDPOINT||'').trim();
export const aiDrawingAnalysisConfigured=()=>Boolean(endpoint());

export type AiAnalysisPhase='sending-request'|'loading-storage'|'sending-to-ai'|'analyzing'|'preparing-json'|'complete';
export type AiAnalysisProgress={phase:AiAnalysisPhase;label:string;detail?:string};

function normalise(raw:any,input:{attachment:Attachment;member:Member}){
  const result=raw?.analysis||raw?.result||raw||{};
  const confidence=String(result.confidence||'Low').toLowerCase();
  return {
    ...result,
    version:1,
    attachmentId:result.attachmentId||input.attachment.id,
    fileName:result.fileName||input.attachment.name,
    pages:Number(result.pages||input.attachment.pageCount||1),
    category:input.member.category,
    confidence:confidence==='high'?'High':confidence==='medium'?'Medium':'Low',
    dimensions:Array.isArray(result.dimensions)?result.dimensions:[],
    reinforcement:Array.isArray(result.reinforcement)?result.reinforcement:[],
    evidence:Array.isArray(result.evidence)?result.evidence:[],
    textSample:typeof result.textSample==='string'?result.textSample:'',
    warnings:Array.isArray(result.warnings)?result.warnings:[],
    fields:result.fields,
    calculated:result.calculated,
  };
}

function parseSseFrame(frame:string){
  const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n').trim();
  if(!data||data==='[DONE]')return undefined;
  try{return JSON.parse(data);}catch{throw Error('Gateway ส่งข้อมูล Stream ที่ไม่ถูกต้องกลับมา');}
}

async function readGatewayStream(response:Response,onProgress:(progress:AiAnalysisProgress)=>void){
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('text/event-stream')){
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body?.error?.message||body?.error||`บริการ AI ตอบกลับ ${response.status}`);
    return body;
  }
  if(!response.body)throw Error('เบราว์เซอร์ไม่รองรับการรับผลวิเคราะห์แบบ Stream');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result:any;
  const consume=async(frame:string)=>{const event=parseSseFrame(frame);if(!event)return;if(event.type==='progress'&&event.phase!=='validating-json')onProgress({phase:event.phase,label:event.label,detail:event.detail});if(event.type==='error')throw Error(event.message||'บริการ AI วิเคราะห์ไม่สำเร็จ');if(event.type==='result')result=event.result;};
  while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop()||'';for(const frame of frames)await consume(frame);}
  buffer+=decoder.decode();if(buffer.trim())await consume(buffer);
  if(!result)throw Error('Gateway ไม่ได้ส่งผลวิเคราะห์ JSON กลับมา');
  return result;
}

export async function analyseDrawingWithAI({attachment,member,project,signal,onProgress}:{attachment:Attachment;member:Member;project:Project;signal?:AbortSignal;onProgress?:(progress:AiAnalysisProgress)=>void}):Promise<AiDrawingAnalysis>{
  const url=endpoint();
  if(!url)throw Error('ยังไม่ได้ตั้งค่า VITE_AI_DRAWING_ANALYSIS_ENDPOINT สำหรับบริการวิเคราะห์แบบด้วย AI');
  const user=auth.currentUser;
  if(!user)throw Error('กรุณาเข้าสู่ระบบก่อนส่งแบบให้ AI');
  const token=await user.getIdToken();
  const active=await command('getActiveAiProvider',undefined);
  if(!active?.activeProvider||!active.settings?.model||!active.settings.hasApiKey)throw Error('ยังไม่ได้เลือกค่าย AI และตั้งค่า API Key ในหน้า จัดการ API');
  const providerDefinition=apiProviderDefinitions.find(item=>item.id===active.activeProvider);
  const selectedModel=modelDefinition(active.activeProvider,active.settings.model);
  const context={
    projectId:project.id,
    memberId:member.id,
    memberCode:member.code,
    category:member.category,
    attachmentId:attachment.id,
    fileName:attachment.name,
    pages:attachment.pageCount||1,
    contentType:attachment.contentType,
    currentMember:{x:member.x,y:member.y,z:member.z,cover:member.cover,description:member.description},
    requestedFields:['x','y','z','cover','description','pedestal','lean','excavation','reinforcement','quantity preview'],
    aiProvider:active.activeProvider,
    aiModel:active.settings.model,
    aiThinking:active.settings.thinking,
    aiThinkingParameter:providerDefinition?.thinkingParameter,
    aiModelThinkingOptions:selectedModel?.thinking.map(option=>option.setting),
  };
  const report=onProgress||(()=>{});
  report({phase:'sending-request',label:'กำลังส่งคำขอจากหน้าเว็บไปยัง Backend…',detail:'หน้าเว็บส่งเฉพาะรหัสไฟล์ ไม่ได้ส่งไฟล์ผ่าน Browser'});
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({context}),signal:signal||AbortSignal.timeout(300000)});
  const body=await readGatewayStream(response,report);
  const candidate=normalise(body,{attachment,member});
  return candidate as AiDrawingAnalysis;
}
