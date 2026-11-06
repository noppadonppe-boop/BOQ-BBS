import {command} from './firebase';
import type {Attachment,Member,Project} from '../domain/model';
import {aiAllowed,aiFloorProposalSchema,aiScheduleSchema,parseAi,type AiFloorProposal,type AiSchedule,type AiSendLogEntry,type ViewFrame} from '../domain/aiSlabPlan';
import type {CadDoc} from '../domain/cadEntities';
import type {FloorProposal} from '../domain/slabPlanImport';
import {aiDrawingAnalysisConfigured,type AiAnalysisProgress} from './aiDrawingAnalysis';
import {aiGateway} from './aiShapeAnalysis';
import type {DrawingView} from './drawingViews';

// S4b: AI help for the slab-floor import — the views of the chosen window (overview + tiles, never the whole file), the page
// texts / pseudo-layers / rule result as text, the project consent check, the send log, and the schema check of the answer.
export type SlabAiPart='plan'|'schedule';
export type SlabAiText={id:string;text:string;x:number;y:number};
export type SlabAiRequest={project:Project;member:Member;attachment:Attachment;page:number;box:[number,number,number,number];views:DrawingView[];frames:ViewFrame[];
 texts:SlabAiText[];layers:{name:string;count:number;role?:string}[];ruleSummary?:string;answers?:{question:string;answer:string}[];part:SlabAiPart;scheduleKind?:'slab'|'beam';
 provider:{id:string;model:string};signal?:AbortSignal;onProgress?:(p:AiAnalysisProgress)=>void};
export type SlabAiIO={log:(entry:Omit<AiSendLogEntry,'at'|'uid'|'email'>)=>Promise<unknown>;send:(extra:Record<string,unknown>,expect:string)=>Promise<unknown>};
const defaultIO=(r:SlabAiRequest):SlabAiIO=>({
 log:entry=>command('logAiSend',r.project.id,{entry}),
 send:(extra,expect)=>aiGateway('slabPlan',{attachment:r.attachment,member:r.member,project:r.project,views:r.views,signal:r.signal,onProgress:r.onProgress},extra,expect)});
/** Sends one window to the AI (after the user confirmed provider / model / file / page / window). Consent off → error and no
 * call; the send is logged on the project first; the answer must match the schema. */
export async function requestSlabAI(r:SlabAiRequest&{part:'plan'},io?:SlabAiIO):Promise<AiFloorProposal>;
export async function requestSlabAI(r:SlabAiRequest&{part:'schedule'},io?:SlabAiIO):Promise<AiSchedule>;
export async function requestSlabAI(r:SlabAiRequest,io:SlabAiIO=defaultIO(r)):Promise<AiFloorProposal|AiSchedule>{
 if(!aiAllowed(r.project))throw Error('โครงการนี้ยังไม่อนุญาตส่งแบบให้ AI · ผู้ดูแลโครงการเปิดได้ที่ ตั้งค่าโครงการ › “อนุญาตส่งแบบให้ AI”');
 if(!r.views.length)throw Error('ไม่มีภาพของกรอบที่เลือก');
 const task=r.part==='schedule'?'slabSchedule':'slabPlan';
 await io.log({task,attachmentId:r.attachment.id,fileName:r.attachment.name,page:r.page,box:r.box,views:r.views.length,provider:r.provider.id,model:r.provider.model,memberId:r.member.id});
 const raw=await io.send({part:r.part,scheduleKind:r.scheduleKind,page:r.page,frames:r.frames.map(f=>({label:f.label,px:f.px,box:f.box})),texts:r.texts.slice(0,2500),layers:r.layers.slice(0,120),ruleSummary:r.ruleSummary,answers:r.answers},task);
 return r.part==='schedule'?parseAi(aiScheduleSchema,raw,'ตาราง'):parseAi(aiFloorProposalSchema,raw,'แปลนพื้น');
}
/** Why the AI button is off ('' = available): consent, gateway URL, provider / key in “จัดการ API”. */
export async function slabAiAvailability(project:Project):Promise<{reason:string;provider?:{id:string;model:string}}>{
 if(!aiAllowed(project))return {reason:'โครงการนี้ยังไม่อนุญาตส่งแบบให้ AI (ผู้ดูแลโครงการเปิดได้ที่ ตั้งค่าโครงการ)'};
 if(!aiDrawingAnalysisConfigured())return {reason:'ยังไม่ได้ตั้งค่าบริการ AI (VITE_AI_DRAWING_ANALYSIS_ENDPOINT) · ส่วนที่ไม่ใช้ AI ใช้ได้ครบ'};
 try{const a=await command('getActiveAiProvider',undefined);if(!a?.activeProvider||!a.settings?.model||!a.settings.hasApiKey)return {reason:'ยังไม่ได้เลือกค่าย AI / API Key ในหน้า จัดการ API'};
  return {reason:'',provider:{id:String(a.activeProvider),model:String(a.settings.model)}};}
 catch(e){return {reason:`ตรวจการตั้งค่า AI ไม่ได้: ${e instanceof Error?e.message:String(e)}`};}
}

/** Overview of the window + up to 3 × 2 tiles (JPEG) cut from the page image; frames map view pixels back to the page. */
export async function windowViews(image:{href:string;box:[number,number,number,number]},win:[number,number,number,number]):Promise<{views:DrawingView[];frames:ViewFrame[]}>{
 const img=await new Promise<HTMLImageElement>((ok,bad)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>bad(Error('อ่านภาพแบบไม่ได้'));i.src=image.href;});
 const [bx0,by0,bx1,by1]=image.box,sx=img.naturalWidth/(bx1-bx0),sy=img.naturalHeight/(by1-by0);
 const cut=(b:[number,number,number,number],long:number,label:string):{view:DrawingView;frame:ViewFrame}=>{
  const px0=(b[0]-bx0)*sx,py0=(by1-b[3])*sy,pw=(b[2]-b[0])*sx,ph=(b[3]-b[1])*sy,k=Math.min(1,long/Math.max(pw,ph)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(pw*k));c.height=Math.max(1,Math.round(ph*k));const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,px0,py0,pw,ph,0,0,c.width,c.height);
  return {view:{label,mimeType:'image/jpeg',data:c.toDataURL('image/jpeg',0.85).split(',')[1]},frame:{label,box:b,px:[c.width,c.height]}};};
 const out=[cut(win,1800,'ภาพรวมกรอบที่เลือก')],W=win[2]-win[0],H=win[3]-win[1],cols=W>=H?3:2,rows=W>=H?2:3,o=0.08;
 for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){const x0=win[0]+W*(k/cols-o/cols),x1=win[0]+W*((k+1)/cols+o/cols),y1=win[3]-H*(r/rows-o/rows),y0=win[3]-H*((r+1)/rows+o/rows);
  out.push(cut([Math.max(win[0],x0),Math.max(win[1],y0),Math.min(win[2],x1),Math.min(win[3],y1)],1800,`ส่วนขยาย แถว ${r+1} คอลัมน์ ${k+1}`));}
 return {views:out.map(x=>x.view),frames:out.map(x=>x.frame)};
}
/** Page texts inside the window with their view-0 pixel position (ids t1, t2 … cited by the AI). */
export function textsForAi(doc:CadDoc|undefined,frame:ViewFrame):SlabAiText[]{
 if(!doc)return [];const [x0,y0,x1,y1]=frame.box;let n=0;
 return doc.ents.flatMap(e=>e.k==='text'&&e.at[0]>=x0&&e.at[0]<=x1&&e.at[1]>=y0&&e.at[1]<=y1?[{id:`t${++n}`,text:e.text,x:Math.round((e.at[0]-x0)/(x1-x0)*frame.px[0]),y:Math.round((y1-e.at[1])/(y1-y0)*frame.px[1])}]:[]);
}
/** The rule result as short text for the AI (labels / marks / sizes; positions in floor mm). */
export function ruleSummary(p:FloorProposal|null):string{
 if(!p)return '';
 return [`กริด X: ${p.grids.filter(g=>g.axis==='X').map(g=>`${g.label}@${g.at}`).join(', ')||'-'}`,`กริด Y: ${p.grids.filter(g=>g.axis==='Y').map(g=>`${g.label}@${g.at}`).join(', ')||'-'}`,
  `คาน: ${p.beams.map(b=>`${b.mark} ${b.width}x${b.depth} แนว ${b.along} บนกริด ${b.line} (${b.from}-${b.to})${b.confidence<0.6?' [ไม่มั่นใจ]':''}`).join('; ')||'-'}`,
  `เสา: ${p.columns.length} ต้น`,`ช่องเปิด: ${p.openings.map(o=>`${o.label} ${o.w}x${o.h}`).join(', ')||'-'}`,`ป้ายเบอร์พื้น: ${p.panelMarks.map(m=>m.mark).join(', ')||'-'}`,
  ...(p.warnings.length?[`คำเตือนจากกฎ: ${p.warnings.join(' | ')}`]:[])].join('\n');
}
