import {provisionalQuantityBasis} from './quantityBasis';
import {z} from 'zod';
import {memberSchema,memberFieldsSchema,type Member} from './model';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const memberCopyRequestSchema=z.object({
 sourceProjectId:id,sourceMemberId:id,
 sourceProjectVersion:z.number().int().nonnegative(),sourceMemberVersion:z.number().int().positive(),
 targetProjectVersion:z.number().int().nonnegative(),memberId:id,
 code:memberFieldsSchema.shape.code,occurrences:memberFieldsSchema.shape.occurrences,
}).strict();
export type MemberCopyRequest=z.infer<typeof memberCopyRequestSchema>;

// Quantities and physical inputs are copied. Evidence, release numbering and
// confirmations belong to a particular member/position and must be entered anew.
export function copyMemberInputs(source:Member,input:Pick<MemberCopyRequest,'memberId'|'code'|'occurrences'>,newId:()=>string=()=>crypto.randomUUID()):Member{
 const m=structuredClone(memberSchema.parse(source));
 const solids=new Map<string,string>();
 const remapSolid=(old:string)=>{if(!solids.has(old))solids.set(old,newId());return solids.get(old)!;};
 if(m.geometry){
  m.geometry.solids.forEach(s=>{s.id=remapSolid(s.id);});
  m.geometry.voids.forEach(s=>{s.id=newId();});
 }
 // Beam span IDs are the IDs of the generated concrete solids.
 m.beamAssembly?.spans.forEach(s=>{s.id=remapSolid(s.id);});
 m.prismGeometry?.holes.forEach(h=>{h.id=newId();});
 m.placementContext?.regions.forEach(r=>{r.id=newId();});
 if(m.placementContext?.version===2)m.placementContext.regions.forEach(r=>r.openings.forEach(o=>{o.id=newId();}));
 m.drawingViews?.sections.forEach(s=>{s.id=newId();});
 m.bars.forEach(b=>{
  b.id=newId();b.placementLayout?.poses.forEach(p=>{p.id=newId();});if(b.targetSolidId&&m.geometry)b.targetSolidId=solids.get(b.targetSolidId)||b.targetSolidId;
  b.placementConfirmed=false;b.bsDimensionsConfirmed=false;
  delete b.fabricationInspections;delete b.scheduleRevisionLetter;
 });
 m.quantityBasis=provisionalQuantityBasis('คัดลอกมิติจาก '+source.code+' ต้องตรวจที่มาปริมาณปลายทางใหม่');
 m.id=input.memberId;m.code=input.code;m.version=0;m.status='Draft';
 m.occurrences=structuredClone(input.occurrences).map(o=>({...o,id:newId()}));
 delete m.inputEpoch;delete m.updatedAt;delete m.sourceSchedule;delete m.drawingExtraction;
 delete m.drawingSetup;delete m.scheduleSetup;delete m.copySource;delete m.pricing;delete m.noRebar;
 return memberSchema.parse(m);
}
