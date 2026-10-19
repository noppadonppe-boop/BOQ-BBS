import type {Spec} from './model';
import type {schedule} from './engine';
import type {FabricationInspection} from './fabricationInspectionSchema';
import {bsToleranceReference,BS_TOLERANCE_REFERENCE} from './bsTolerances';

type Row=ReturnType<typeof schedule>[number];
// A nominal signature, not an authenticity hash or approval. No quantities or
// geometry are changed by this record. Recorded pieces are never multiplied.
export function inspectionNominalBasis(spec:Spec,row:Row){
 return JSON.stringify({reference:BS_TOLERANCE_REFERENCE.id,policy:spec.minimumStandard,rounding:spec.rounding,
 mark:row.mark,diameter:row.diameter,grade:row.grade,shape:row.shape,code:row.shapeCode.trim(),cut:row.cutLength,
 basis:row.lengthBasis,calculated:row.calculatedLength,formula:row.standard.formula,dimensions:row.standard.dimensions,
 outside:row.standard.outsideDiameter,inner:row.standard.innerRadius,bsType:row.bsType,
 points:row.points,curve:row.curve,helix:row.helix,axis:row.axis,face:row.face,start:row.start,end:row.end,tail:row.tail,
 distributionStart:row.distributionStart,distributionEnd:row.distributionEnd,target:row.targetSolidId});
}
export type InspectionCriterion={label:string;nominal:number;lower:number;upper:number;measured?:number;result:'Within range'|'Outside range'|'Missing';endMinimum?:number};
export type InspectionStatus='Stale nominal'|'Outside listed limits'|'Incomplete'|'Within listed ranges';
const eps=1e-6;
export function recordedInspectionNominal(record:FabricationInspection){
 try{const value=JSON.parse(record.nominalBasis);if(!Number.isFinite(value.cut)||value.cut<=0||!Array.isArray(value.dimensions)||value.dimensions.length>26||value.dimensions.some((d:any)=>!d||!/^[A-Z]$/.test(d.label)||!Number.isFinite(d.value)||d.value<=0))return null;
  return {mark:String(value.mark||''),code:String(value.code||''),cut:value.cut as number,dimensions:value.dimensions as {label:string;value:number;free:boolean}[],policy:String(value.policy||''),inner:Number.isFinite(value.inner)?value.inner as number:undefined};
 }catch{return null;}
}
export function fabricationInspectionResult(spec:Spec,row:Row,record:FabricationInspection){
 const reference=bsToleranceReference(spec,row),notes:string[]=[],criteria:InspectionCriterion[]=[];
 if(reference?.cut)criteria.push({label:'Cut',...reference.cut,measured:record.measuredCut,result:record.measuredCut>=reference.cut.lower-eps&&record.measuredCut<=reference.cut.upper+eps?'Within range':'Outside range'});
 for(const dim of reference?.dimensions||[]){const measured=record.measuredDimensions[dim.label];criteria.push({...dim,measured,result:measured===undefined?'Missing':measured>=dim.lower-eps&&measured<=dim.upper+eps?'Within range':'Outside range'});}
 const unexpected=Object.keys(record.measuredDimensions).filter(label=>!reference?.dimensions.some(d=>d.label===label));
 const mapped=!!reference?.cut&&(row.shapeCode.trim()==='00'&&!row.standard.hasBends||!!reference?.dimensions.length);
 const minimumProblems=criteria.filter(c=>c.endMinimum!==undefined&&c.measured!==undefined&&c.measured<c.endMinimum-eps).map(c=>`${c.label}: measured below Table 3 end minimum ${c.endMinimum} mm`);
 if(record.measuredInnerRadius!==undefined&&row.standard.min&&record.measuredInnerRadius<row.standard.min.innerRadius-eps)minimumProblems.push('Measured inner radius below Table 3 minimum');
 if(unexpected.length)notes.push('Unmapped measured dimensions: '+unexpected.join(', '));
 if(!mapped)notes.push('Outside bending dimensions unavailable for this shape/policy; cut-only checks cannot establish a complete result');
 if(row.errors.length||row.standard.problems.length)notes.push('Nominal engineering/minimum checks remain pending');
 const balance=freeDimensionBalance(row,record);
 if(balance)notes.push('Free-dimension balance is an algebraic comparison to the Table 1 equation, not a permissible residual tolerance or a physical adjustment');
 const stale=record.nominalBasis!==inspectionNominalBasis(spec,row);
 const status:InspectionStatus=stale?'Stale nominal':criteria.some(c=>c.result==='Outside range')||minimumProblems.length?'Outside listed limits':!mapped||unexpected.length||criteria.some(c=>c.result==='Missing')?'Incomplete':'Within listed ranges';
 notes.push('One identified piece / user-recorded measurements only; not batch acceptance, ACI conformity, engineer approval or permission to fabricate');
 return {reference:reference?.reference||null,status,criteria,minimumProblems,notes,balance,stale,recordedNominal:recordedInspectionNominal(record)};
}

// The supplied standard does not prescribe a combined independent worst-case
// stack. Compare actual inputs only. Radius and d are explicit, not tolerance-
// assigned variables. Oblique/exact-note1, linked51, curves and99 stay unmapped.
function freeDimensionBalance(row:Row,record:FabricationInspection){
 const code=row.shapeCode.trim(),a=row.standard;
 if(!a.formula||!['11','12','13','21','31','41','44'].includes(code))return null;
 const free=a.dimensions.find(d=>d.free);if(!free)return null;
 const radiusFactor=code==='11'||code==='12'?0.5:code==='21'?1:code==='31'?1.5:code==='13'?0:2;
 const diameterFactor=code==='11'||code==='12'?1:code==='21'?2:code==='31'?3:code==='13'?1.57:4;
 const missing=a.dimensions.filter(d=>d.label!==free.label&&record.measuredDimensions[d.label]===undefined).map(d=>d.label);
 if(radiusFactor&&record.measuredInnerRadius===undefined)missing.push('measured inner radius');
 if(missing.length)return {freeLabel:free.label,available:false as const,missing};
 const radius=record.measuredInnerRadius||0;
 const fixed=a.dimensions.filter(d=>d.label!==free.label).reduce((sum,d)=>sum+(code==='13'&&d.label==='B'?.57:1)*record.measuredDimensions[d.label],0);
 const required=record.measuredCut-fixed+radiusFactor*radius+diameterFactor*row.diameter;
 const measured=record.measuredDimensions[free.label];
 if(!Number.isFinite(required)||Math.abs(required)>200000)return {freeLabel:free.label,available:false as const,missing:['balance outside supported numeric range']};
 return {freeLabel:free.label,available:true as const,required,measured,residual:measured===undefined?undefined:measured-required,
  withinFreeRange:required>=free.value-(free.value<=1000?5:free.value<=2000?10:25)-eps&&required<=free.value+5+eps};
}
