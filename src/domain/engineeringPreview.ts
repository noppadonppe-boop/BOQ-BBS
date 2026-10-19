import {engineeringDraftSchema,type EngineeringDraft} from './engineeringDraft';
import {fixtureCalculation,fixtureMetricKeys,fixtureMetricLabels,fixtureExpectedSchema,fixtureToleranceSchema} from './engineeringFixtures';
import {steelCoverage,type SteelCoverage} from './reinforcementCoverage';
import type {Attachment} from './model';
export type PreviewRow={field:string;label:string;unit:string;expected?:number;actual?:number;bound?:number;difference?:number;state:'Missing'|'Invalid'|'Unavailable'|'Different'|'Match'};
export type SourceVerification={state:'Verified'|'Pending';messages:string[];checkedAt:string;sha256?:string;bytes?:number;pageCount?:number};
const number=(s:string)=>s.trim()?Number(s):undefined;
export function evaluateEngineeringPreview(input:EngineeringDraft,attachments:Attachment[]){
 const d=engineeringDraftSchema.parse(input),{diagnostics,q,actual:rawActual}=fixtureCalculation(d.member,d.spec),rows:PreviewRow[]=[],form=d.form;
 const coverage:SteelCoverage=steelCoverage(d.member,{project:{spec:d.spec},attachments});
 const actual={...rawActual,...(!coverage.complete?{rebar:undefined}:{})};
 const add=(field:string,label:string,unit:string,text:string,measured:number|undefined,boundText:string,valid:(n:number)=>boolean,boundValid:(n:number)=>boolean)=>{
  const expected=number(text),bound=number(boundText),available=Number.isFinite(measured)?measured:undefined,difference=expected!==undefined&&available!==undefined?available-expected:undefined;
  const epsilon=Number.EPSILON*Math.max(1,Math.abs(expected||0),Math.abs(available||0))*16;
  const state=expected===undefined||bound===undefined?'Missing':!valid(expected)||!boundValid(bound)?'Invalid':available===undefined?'Unavailable':Math.abs(difference!)<=bound+epsilon?'Match':'Different';
  rows.push({field,label,unit,expected,actual:available,bound,difference,state});
 };
 if(form.outcome==='valid'){
  for(const key of fixtureMetricKeys){const count=key==='quantity',area=key==='formwork',mass=key==='rebar',boundKey=area?'area':mass?'weight':'volume';add(key,fixtureMetricLabels[key],count?'pcs':area?'m²':mass?'kg':'m³',form.numbers[key],actual[key],count?'0':form.tolerance[boundKey],n=>fixtureExpectedSchema.shape[key].safeParse(n).success,n=>count?n===0:fixtureToleranceSchema.shape[boundKey].safeParse(n).success);}
  for(const b of d.member.bars){const measured=q.rows.find(r=>r.id===b.id),values=form.barNumbers[b.id];for(const key of ['cutLength','totalCount','weight'] as const){const count=key==='totalCount',cut=key==='cutLength',expectedSchema=fixtureExpectedSchema.shape.bars.element.shape[key],boundKey=cut?'cut':'weight';add(b.id+'/'+key,b.mark+' / '+(count?'รวมชิ้น':cut?'ยาวตัด':'รวม kg'),count?'pcs':cut?'mm':'kg',values?.[key]??'',measured?cut?measured.cutLength:count?measured.count*q.quantity:measured.weight*q.quantity:undefined,count?'0':form.tolerance[boundKey],n=>expectedSchema.safeParse(n).success,n=>count?n===0:fixtureToleranceSchema.shape[boundKey].safeParse(n).success);}}
 }
 const expectedErrors=form.expectedErrors.split('\n').map(s=>s.trim()).filter(Boolean),errorsValid=expectedErrors.length>0&&expectedErrors.length<=50&&expectedErrors.every(s=>s.length<=300);
 const validationState=form.outcome==='valid'?(diagnostics.length?'Different':'Match'):!errorsValid?'Missing':diagnostics.length>0&&expectedErrors.every(e=>diagnostics.some(s=>s.includes(e)))&&diagnostics.every(s=>expectedErrors.some(e=>s.includes(e)))?'Match':'Different';
 const complete=form.outcome==='valid'?rows.every(r=>r.state==='Match'||r.state==='Different'):errorsValid;
 return {rows,actual,diagnostics,expectedErrors,validationState,complete,coverage,numbersMatch:form.outcome==='invalid'||rows.every(r=>r.state==='Match'),referenceComplete:!!form.label.trim()&&!!form.reference.trim(),engineeringApproved:false as const};
}
export type EngineeringPreview=ReturnType<typeof evaluateEngineeringPreview>;
export function previewDecision(result:EngineeringPreview,source:SourceVerification,contextProblems:string[]):'Pending'|'Compared'|'Review'{
 if(!result.complete||!result.referenceComplete||contextProblems.length||source.state!=='Verified')return 'Pending' as const;
 return result.validationState==='Match'&&result.numbersMatch?'Compared':'Review' as const;
}
