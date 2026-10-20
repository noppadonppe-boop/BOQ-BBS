import type {Category,Member} from './model';
import type {DrawingExtraction,ExtractedDimension,ExtractedReinforcement} from './drawingExtraction';

export type AiMemberFields={
  description?:string;
  x?:number;
  y?:number;
  z?:number;
  cover?:number;
  pedestal?:{x:number;y:number;z:number};
  lean?:{x:number;y:number;thickness:number};
  excavation?:{bottomX:number;bottomY:number;topX:number;topY:number;depth:number;buriedConcrete:number};
};

export type AiEvidence={page:number;field:string;quote:string};

export type AiDrawingAnalysis={
  version:1;
  attachmentId:string;
  fileName:string;
  pages:number;
  category:Category;
  provider?:string;
  model?:string;
  analysisId?:string;
  confidence:'High'|'Medium'|'Low';
  dimensions:ExtractedDimension[];
  reinforcement:ExtractedReinforcement[];
  fields?:AiMemberFields;
  calculated?:{concrete?:number;formwork?:number;rebar?:number;quantity?:number};
  evidence:AiEvidence[];
  textSample:string;
  warnings:string[];
};

const positive=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0;

function dimensionRows(input:AiDrawingAnalysis):ExtractedDimension[]{
  const rows=[...input.dimensions];
  const add=(axis:ExtractedDimension['axis'],value:unknown,label:string)=>{
    if(!positive(value)||rows.some(row=>row.axis===axis&&row.value===value))return;
    rows.push({axis,value:value as number,label,source:'AI · ตรวจจากหลักฐานในแบบ'});
  };
  const fields=input.fields;
  add('x',fields?.x,'X / length จากผล AI');
  add('y',fields?.y,'Y / width จากผล AI');
  add('z',fields?.z,'Z / height จากผล AI');
  add('cover',fields?.cover,'Cover จากผล AI');
  return rows;
}

export function aiAnalysisToExtraction(input:AiDrawingAnalysis,status:'Needs review'|'Applied'='Needs review'):DrawingExtraction{
  const extra:string[]=[];
  const fields=input.fields;
  if(fields?.description)extra.push(`AI ค่าอื่น · รายละเอียด: ${fields.description.slice(0,440)}`);
  if(fields?.cover!==undefined)extra.push(`AI ค่าอื่น · Cover: ${fields.cover} mm`);
  if(fields?.pedestal)extra.push(`AI ค่าอื่น · Pedestal: ${fields.pedestal.x} × ${fields.pedestal.y} × ${fields.pedestal.z} mm`);
  if(fields?.lean)extra.push(`AI ค่าอื่น · Lean: ${fields.lean.x} × ${fields.lean.y} × ${fields.lean.thickness} mm`);
  if(fields?.excavation)extra.push(`AI ค่าอื่น · Excavation: ${fields.excavation.bottomX} × ${fields.excavation.bottomY} × ลึก ${fields.excavation.depth} mm`);
  if(input.calculated){const q=input.calculated;extra.push(`AI preview เท่านั้น · คอนกรีต ${q.concrete??'-'} m³ · แบบหล่อ ${q.formwork??'-'} m² · เหล็ก ${q.rebar??'-'} kg · จำนวน ${q.quantity??'-'} ชิ้น`);}
  return {
    attachmentId:input.attachmentId,
    fileName:input.fileName,
    extractedAt:new Date().toISOString(),
    pages:input.pages,
    status,
    confidence:input.confidence,
    description:input.fields?.description,
    dimensions:dimensionRows(input),
    reinforcement:input.reinforcement,
    textSample:input.textSample,
    warnings:[...extra,...input.warnings].slice(0,50),
    fields:input.fields,
    calculated:input.calculated,
    evidence:input.evidence,
    source:'ai',
    provider:input.provider,
    model:input.model,
    analysisId:input.analysisId,
  };
}

export function aiMemberPatch(input:AiDrawingAnalysis,member:Member){
  const rows=dimensionRows(input),next={x:member.x,y:member.y,z:member.z,cover:member.cover};
  for(const row of rows){
    if(row.axis==='x'||row.axis==='y'||row.axis==='z'||row.axis==='cover')next[row.axis]=row.value;
  }
  return {dimensions:next,hasDimensionChanges:next.x!==member.x||next.y!==member.y||next.z!==member.z||next.cover!==member.cover};
}
