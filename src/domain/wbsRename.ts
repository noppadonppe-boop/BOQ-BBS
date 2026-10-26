import {z} from 'zod';
import type {Member} from './model';
import {canonical} from './canonical';
import {resetStaleQuantityBasis} from './quantityBasis';
import {resetStaleNoRebar} from './reinforcementCoverage';
import {locationNodeSchema,locationTree,parseLocations,type Locations} from './locations';

// Rename the code of a WBS node that member rows are linked to: the tree changes when the job completes, linked rows get
// the new label (building always; zone / floor only where the label still is the old code, i.e. it was synced).
export const wbsRenameSchema=z.object({
 version:z.number().int().nonnegative(),locationsVersion:z.number().int().nonnegative(),
 nodeId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),code:locationNodeSchema.shape.code,note:z.string().trim().min(1).max(500),
}).strict();
export type WbsRename=z.infer<typeof wbsRenameSchema>;
export function wbsRenamePlan(members:Member[],locations:Locations|undefined,input:WbsRename){
 const change=wbsRenameSchema.parse(input),node=locations?.nodes.find(n=>n.id===change.nodeId);
 if(!locations||!node)throw Error('ไม่พบตำแหน่ง WBS ที่จะเปลี่ยนรหัส');
 const from=node.code,to=change.code.trim().toUpperCase();if(from===to)throw Error('รหัสใหม่ต้องต่างจากรหัสเดิม');
 const next=parseLocations({...locations,nodes:locations.nodes.map(n=>n.id===node.id?{...n,code:to}:n)}); // duplicate codes throw
 const pairs=members.flatMap(before=>{
  let touched=false,relabelled=false;
  const occurrences=before.occurrences.map(o=>{
   const l=o.loc;if(!l||!Object.values(l).includes(node.id))return o;
   const n={...o};
   if(l.building===node.id)n.building=to;
   if((l.level===node.id||l.segment===node.id)&&o.floor===from){n.floor=to;relabelled=true;}
   if(l.zone===node.id&&o.zone===from){n.zone=to;relabelled=true;}
   if(l.room===node.id&&o.grid===from){n.grid=to;relabelled=true;}
   if(canonical(n)!==canonical(o))touched=true;return n;
  });
  if(!touched)return [];
  return [{id:before.id,before,after:resetStaleQuantityBasis(before,resetStaleNoRebar(before,{...structuredClone(before),occurrences})),relabelled}];
 });
 const rowCount=pairs.reduce((k,p)=>k+p.after.occurrences.filter((o,i)=>canonical(o)!==canonical(p.before.occurrences[i])).length,0);
 return {change,node,from,to,locations:next,pairs,memberCount:pairs.length,rowCount,relabelledCount:pairs.filter(p=>p.relabelled).length,path:node.parentId?`${locationTree(next).byId.get(node.parentId)?.code}-`:''};
}
/** Rows linked to a node (any level of the link). */
export const linkedRows=(members:Pick<Member,'occurrences'>[],nodeId:string)=>members.reduce((k,m)=>k+m.occurrences.filter(o=>o.loc&&Object.values(o.loc).includes(nodeId)).length,0);
