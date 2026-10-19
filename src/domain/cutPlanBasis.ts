import type {Project,Member,Attachment,Stock,ExportScope} from './model';
import {cuttingDemand} from './engine';
import {assertCutPlan,type CutPlan,type Cut} from './cutOptimizer';
import {steelCoverage,type SteelCoverage} from './reinforcementCoverage';
import {calculationEngine} from './version';
import {canonical} from './canonical';
import {selectedMembers} from './exportScope';
import {quantityBasisState} from './quantityBasis';
export type CutDemandRow=Cut&{quantity:number};
export type CutPlanBasis={version:1;project:{id:string;code:string;name:string;version:number};engineVersion:string;spec:Project['spec'];members:{id:string;code:string;version:number;quantity:number;sourceQuantity:number;coverage:SteelCoverage;quantityInput?:'Provisional'|'Entered'}[];sources:{id:string;sha256:string;path:string;size:number;name:string;revision:string}[];demand:CutDemandRow[];stock:Stock[]};
export const cutQuantityInput=(m:Member)=>m.quantityBasis===undefined?{}:{quantityInput:quantityBasisState(m)==='Entered'?'Entered' as const:'Provisional' as const};
export const cutQuantityPending=(basis:CutPlanBasis|undefined)=>basis?.members?.filter(m=>m.quantityInput!==undefined&&m.quantityInput!=='Entered')||[];
export const cutQuantityLabel=(m:CutPlanBasis['members'][number])=>m.quantityInput===undefined?'ข้อมูลเดิม / ไม่ได้บันทึกที่มาจำนวน':m.quantityInput==='Entered'?'ยืนยันข้อมูลจำนวนแล้ว / ไม่ใช่อนุมัติผลิต':'จำนวนสมาชิกชั่วคราว / รอยืนยัน';
export const cutSignature=(c:Cut)=>JSON.stringify([c.memberId||'',c.barId||'',c.member,c.mark,c.length,c.diameter,c.grade]);
export function aggregateDemand(demand:Cut[]):CutDemandRow[]{const rows=new Map<string,CutDemandRow>();for(const c of demand){const key=cutSignature(c),r=rows.get(key);if(r)r.quantity++;else rows.set(key,{...c,quantity:1});}return [...rows.values()];}
export function expandDemand(rows:CutDemandRow[]){let count=0;const result:Cut[]=[];for(const {quantity,...cut} of rows){if(!Number.isSafeInteger(quantity)||quantity<1||(count+=quantity)>100000)throw Error('ฐานแผนตัดเกิน100,000ชิ้นหรือจำนวนไม่ถูกต้อง');for(let i=0;i<quantity;i++)result.push(cut);}return result;}
export function captureCutBasis(project:Project,all:Member[],attachments:Attachment[],stock:Stock[],scope:ExportScope):CutPlanBasis{
 const members=selectedMembers(all,scope),original=new Map(all.map(m=>[m.id,m])),demand=aggregateDemand(cuttingDemand(members,project.spec)),keys=new Set(demand.map(d=>JSON.stringify([d.diameter,d.grade]))),sourceIds=new Set(members.flatMap(m=>m.sourceSchedule?[m.sourceSchedule.attachmentId]:[]));
 return {version:1,project:{id:project.id,code:project.code,name:project.name,version:project.version},engineVersion:calculationEngine(project.spec),spec:structuredClone(project.spec),members:members.map(m=>({id:m.id,code:m.code,version:m.version,...cutQuantityInput(original.get(m.id)!),quantity:m.occurrences.reduce((n,o)=>n+o.quantity,0),sourceQuantity:original.get(m.id)!.occurrences.reduce((n,o)=>n+o.quantity,0),coverage:steelCoverage(original.get(m.id)!,{project,attachments})})),sources:attachments.filter(a=>sourceIds.has(a.id)).map(a=>({id:a.id,sha256:a.sha256||'',path:a.path,size:a.size,name:a.name,revision:a.revision})),demand,stock:stock.filter(s=>keys.has(JSON.stringify([s.diameter,s.grade]))).map(s=>({...s}))};
}
export function validateCapturedCutPlan(plan:Pick<CutPlan,'patterns'|'unfilled'|'inputLength'|'cutLength'|'kerfLoss'|'scrap'|'offcut'>,basis:CutPlanBasis,kerf:number,min:number){
 if(basis?.version!==1||!Array.isArray(basis.members)||!Array.isArray(basis.demand)||!Array.isArray(basis.stock)||!Array.isArray(basis.sources)||!basis.members.length||basis.members.length>5000||basis.demand.length>100000||basis.stock.length>100000||basis.sources.length>5000)throw Error('ฐานแผนตัดไม่ครบหรือเกินขอบเขต');
 if(!basis.project?.id||!Number.isSafeInteger(basis.project.version)||basis.project.version<1||!basis.engineVersion||basis.members.some(m=>!m.id||!m.code||!Number.isSafeInteger(m.version)||m.version<1||!Number.isSafeInteger(m.quantity)||m.quantity<1||!Number.isSafeInteger(m.sourceQuantity)||m.sourceQuantity<m.quantity||m.coverage?.memberId!==m.id||m.coverage.memberCode!==m.code))throw Error('รุ่นหรือจำนวนสมาชิกในฐานแผนไม่ถูกต้อง');
 if(new Set(basis.members.map(m=>m.id)).size!==basis.members.length||new Set(basis.stock.map(s=>s.id)).size!==basis.stock.length)throw Error('ฐานสมาชิกหรือสต็อกซ้ำ');
 const byId=new Map(basis.members.map(m=>[m.id,m]));for(const d of basis.demand){const m=byId.get(d.memberId||'');if(!m||m.code!==d.member||!d.barId)throw Error('ชิ้นงานไม่ตรงสมาชิกหรือ Mark ในฐานแผน');}
 assertCutPlan(plan,expandDemand(basis.demand),basis.stock,kerf,min);
}
export function cutBasisReady(basis?:CutPlanBasis){return !!basis&&basis.version===1&&Array.isArray(basis.members)&&basis.members.length>0&&basis.members.every(m=>m.coverage?.complete===true)&&!cutQuantityPending(basis).length;}
export function verifyCurrentCutBasis(basis:CutPlanBasis,current:CutPlanBasis){
 if(basis.project.id!==current.project.id||basis.project.version!==current.project.version||basis.engineVersion!==current.engineVersion||canonical(basis.spec)!==canonical(current.spec)||canonical(basis.members)!==canonical(current.members)||canonical(basis.sources)!==canonical(current.sources)||canonical(basis.demand)!==canonical(current.demand))throw Error('ฐาน BBS/ขอบเขต/แบบหรือรุ่นคำนวณเปลี่ยนแล้ว คำนวณข้อเสนอใหม่');
 if(cutQuantityPending(current).length)throw Object.assign(Error('จำนวนสมาชิกยังเป็นข้อมูลชั่วคราว ยืนยันที่มาปริมาณก่อนจองสต็อก'),{code:'failed-precondition'});
 if(!cutBasisReady(current))throw Error('ขอบเขตแผนยังรอ BBS หรือเทียบแบบ เลือกขอบเขตที่กรอกครบก่อนจอง');
}
