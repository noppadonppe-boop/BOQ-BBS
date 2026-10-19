import {z} from 'zod';
import {sourceShapeReferenceSchema} from './sourceRegions';
import type {Member,Attachment} from './model';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const mm=z.number().finite().positive().max(200000);
export const sourceScheduleSchema=z.object({version:z.union([z.literal(1),z.literal(2),z.literal(3)]),attachmentId:id,sha256:z.string().regex(/^[a-f0-9]{64}$/),page:z.number().int().min(1).max(9999),basis:z.enum(['perElement','allOccurrences']),note:z.string().trim().min(1).max(500),statedTotalWeight:z.number().finite().positive().max(1e17).optional(),pageTables:z.array(z.object({page:z.number().int().min(1).max(9999),statedTotalWeight:z.number().finite().positive().max(1e17).optional(),note:z.string().trim().min(1).max(500)}).strict()).min(2).max(20).optional(),rows:z.array(z.object({id,mark:z.string().trim().min(1).max(32),diameter:z.number().finite().positive().max(100),grade:z.string().trim().min(1).max(40),count:z.number().int().min(1).max(200000000),cutLength:mm,unitWeight:z.number().finite().nonnegative().max(1e15).optional(),weight:z.number().finite().positive().max(1e15).optional(),barId:id.optional(),note:z.string().max(500),shapeReference:sourceShapeReferenceSchema.optional(),sourcePage:z.number().int().min(1).max(9999).optional()}).strict()).min(1).max(300)}).strict().superRefine((s,ctx)=>{
 const ids=new Set<string>(),marks=new Set<string>(),bars=new Set<string>();
 if(s.version===3){if(!s.pageTables||s.statedTotalWeight!==undefined)ctx.addIssue({code:'custom',message:'ตารางหลายหน้าต้องมีข้อมูลแยกหน้า ห้ามใช้ Total เดี่ยวแทนทุกหน้า'});const pages=s.pageTables?.map(t=>t.page)||[];if(new Set(pages).size!==pages.length||s.page!==pages[0])ctx.addIssue({code:'custom',message:'หน้าตารางซ้ำหรือหน้าหลักไม่ตรงทะเบียน'});for(const [i,r]of s.rows.entries()){if(!r.sourcePage||!pages.includes(r.sourcePage))ctx.addIssue({code:'custom',path:['rows',i],message:'หน้าแถวไม่ตรงทะเบียนหน้าตาราง'});}if(pages.some(page=>!s.rows.some(r=>r.sourcePage===page)))ctx.addIssue({code:'custom',message:'ทะเบียนหน้ามีหน้าที่ไม่มีรายการ'});}else if(s.pageTables||s.rows.some(r=>r.sourcePage!==undefined))ctx.addIssue({code:'custom',message:'ข้อมูลหลายหน้าต้องใช้ตารางรุ่น3'});
 s.rows.forEach((r,i)=>{const mark=r.mark.toLocaleUpperCase('en-US');if(ids.has(r.id)||marks.has(mark)||r.barId&&bars.has(r.barId))ctx.addIssue({code:'custom',path:['rows',i],message:'รหัส/Mark จากแบบหรือการจับคู่ BBS ซ้ำ'});ids.add(r.id);marks.add(mark);if(r.barId)bars.add(r.barId);});
 s.rows.forEach((r,i)=>{if(r.shapeReference){if(s.version===1)ctx.addIssue({code:'custom',path:['rows',i,'shapeReference'],message:'รูปดัดต้นทางต้องใช้ตารางตรวจเทียบรุ่น2หรือ3'});if(r.shapeReference.sha256!==s.sha256)ctx.addIssue({code:'custom',path:['rows',i,'shapeReference'],message:'รูปดัดต้นทางอ้างไฟล์คนละฉบับกับตาราง'});}});
});
export type SourceSchedule=z.infer<typeof sourceScheduleSchema>;
export type SourceScheduleRow=SourceSchedule['rows'][number];
type CalculatedBar={id:string;mark:string;diameter:number;grade:string;count:number;cutLength:number;weight:number;eachWeight?:number};
export function sourceWeightComparisonText(row:{source:{weight?:number};weightDifference?:number},language:'th'|'en'='th'){
 if(row.source.weight===undefined)return language==='th'?'ไม่ได้กรอกน้ำหนักต้นทาง':'Source weight not entered';
 if(row.weightDifference===undefined)return language==='th'?`น้ำหนัก BBS ยังไม่พร้อม · แบบ ${row.source.weight} kg`:`BBS weight pending / source ${row.source.weight} kg`;
 return row.weightDifference.toFixed(6);
}

// A transcription is reference data, never a second source of BOQ/cutting demand.
// Stable bar IDs require an explicit user mapping; matching Mark text alone does
// not silently bind/repair rows after a rename, removal or source replacement.
export function compareSourceSchedule(member:Member,calculated:CalculatedBar[],attachments:Attachment[],referenceQuantity?:number){
 const s=member.sourceSchedule;if(!s)return undefined;
 const attachment=attachments.find(a=>a.id===s.attachmentId),sourceProblems=sourceScheduleFileProblems(member,attachments);
 if(attachment?.sourceStatus==='Superseded')sourceProblems.push('ตารางอ้างอิงแบบ Superseded ต้องตรวจเทียบฉบับปัจจุบันใหม่');
 const selectedQuantity=member.occurrences.reduce((n,o)=>n+o.quantity,0),quantity=referenceQuantity??selectedQuantity,multiplier=s.basis==='allOccurrences'?quantity:1;
 if(!Number.isSafeInteger(quantity)||quantity<selectedQuantity||quantity<=0)throw Error('จำนวนอ้างอิงตารางต้นทางไม่ตรงขอบเขต');
 const rows=s.rows.map(source=>{const bar=calculated.find(b=>b.id===source.barId),differences:string[]=[];
  if(bar){if(source.mark!==bar.mark)differences.push('Mark');if(source.diameter!==bar.diameter)differences.push('ขนาด');if(source.grade.trim().toUpperCase()!==bar.grade.trim().toUpperCase())differences.push('เกรด');if(source.count!==bar.count*multiplier)differences.push('จำนวน');if(Math.abs(source.cutLength-bar.cutLength)>1e-6)differences.push('ยาวตัด');}
  const actualUnitWeight=bar?(bar.eachWeight??(bar.count>0?bar.weight/bar.count:undefined)):undefined;
  const sourceProductWeight=source.unitWeight===undefined?undefined:source.unitWeight*source.count;
  return {source,bar,differences,status:!source.barId?'Unmapped':!bar?'Missing bar':differences.length?'Differences':'Matched',actualCount:bar?bar.count*multiplier:undefined,actualWeight:bar?bar.weight*multiplier:undefined,weightDifference:bar&&source.weight!==undefined?bar.weight*multiplier-source.weight:undefined,actualUnitWeight,unitWeightDifference:actualUnitWeight!==undefined&&source.unitWeight!==undefined?actualUnitWeight-source.unitWeight:undefined,sourceProductWeight,sourceRowProductDifference:source.weight!==undefined&&sourceProductWeight!==undefined?source.weight-sourceProductWeight:undefined};
 });
 const mapped=new Set(s.rows.map(r=>r.barId)),extraBars=calculated.filter(b=>!mapped.has(b.id));
 const pageWeights=sourceSchedulePages(s).map(table=>{const pageRows=s.rows.filter(r=>sourceRowPage(s,r)===table.page),complete=pageRows.every(r=>r.weight!==undefined),weight=pageRows.reduce((n,r)=>n+(r.weight||0),0);return {...table,rows:pageRows.length,weightComplete:complete,rowWeight:weight,difference:complete&&table.statedTotalWeight!==undefined?weight-table.statedTotalWeight:undefined};});
 return {source:s,pageWeights,attachment,sourceProblems,quantity,selectedQuantity,multiplier,rows,extraBars,coreMatched:!sourceProblems.length&&rows.every(r=>r.status==='Matched')&&!extraBars.length,sourceWeightComplete:s.rows.every(r=>r.weight!==undefined),sourceWeight:s.rows.reduce((n,r)=>n+(r.weight||0),0),actualWeight:calculated.reduce((n,b)=>n+b.weight*multiplier,0)};
}
export function sourceScheduleFileProblems(member:Member,attachments:Attachment[]){
 const s=member.sourceSchedule;if(!s)return [];
 const a=attachments.find(a=>a.id===s.attachmentId),problems:string[]=[];
 if(!a)return ['ไม่พบไฟล์ต้นทางของตารางเทียบ BBS'];
 if(a.memberId&&a.memberId!==member.id)problems.push('ไฟล์ตารางเทียบ BBS เป็นของสมาชิกอื่น');
 if(a.sha256!==s.sha256)problems.push('SHA256 แบบต้นทางไม่ตรงตารางที่ถอดไว้');
 if(!a.pageCount||s.page>a.pageCount)problems.push('หน้าตารางเทียบ BBS เกินจำนวนหน้าที่ตรวจแล้ว');
 if(s.version===3){for(const table of s.pageTables||[])if(!a.pageCount||table.page>a.pageCount)problems.push('หน้าตาราง '+table.page+' เกินไฟล์ที่ตรวจแล้ว');const valid=sourceScheduleSchema.safeParse(s);if(!valid.success)problems.push(...valid.error.issues.map(i=>i.message));}
 for(const row of s.rows){if(row.shapeReference){const r=sourceShapeReferenceSchema.safeParse(row.shapeReference);if(!r.success||s.version===1)problems.push(row.mark+': กรอบรูปดัดต้นทางไม่ถูกต้อง');else{if(r.data.sha256!==s.sha256||r.data.sha256!==a.sha256)problems.push(row.mark+': รูปดัดต้นทางอ้างไฟล์คนละฉบับ');if(!a.pageCount||r.data.page>a.pageCount||a.contentType!=='application/pdf'&&r.data.page!==1)problems.push(row.mark+': หน้ารูปดัดต้นทางไม่ตรงไฟล์');}}}
 return problems;
}
export function sourceScheduleReviewProblems(member:Member,calculated:CalculatedBar[],attachments:Attachment[]){const result=compareSourceSchedule(member,calculated,attachments);if(!result)return [];return [...result.sourceProblems,...result.rows.filter(r=>r.status!=='Matched').map(r=>`ตารางจากแบบ ${r.source.mark}: ${r.status==='Unmapped'?'ยังไม่จับคู่ BBS':r.status==='Missing bar'?'BBS ที่จับคู่ถูกลบ':r.differences.join(' / ')+' ต่างจาก BBS'}`),...result.extraBars.map(b=>`${b.mark}: ยังไม่มีรายการเทียบจากตารางต้นทาง`)];}

export const sourceRowPage=(s:SourceSchedule,r:SourceScheduleRow)=>s.version===3?r.sourcePage!:s.page;
export const sourceSchedulePages=(s:SourceSchedule)=>s.version===3?s.pageTables!:[{page:s.page,statedTotalWeight:s.statedTotalWeight,note:s.note}];
export const sourcePagesLabel=(s:SourceSchedule)=>sourceSchedulePages(s).map(t=>t.page).join(', ');
