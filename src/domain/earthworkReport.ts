import type {SnapshotBundle} from './model';
import {takeoff} from './engine';
import {buriedConcreteBasis} from './earthwork';
// Inputs and quantities always come from the same captured revision and scope.
export function earthworkRows(b:SnapshotBundle){
 return b.members.filter(m=>m.category==='Foundation').map(m=>{
  const q=b.calculations?.[m.id]||takeoff(m,b.project.spec),input=buriedConcreteBasis(m,b.project.spec,q.concrete);
  if(input.problems.length)throw Error(`${m.code}: ${input.problems.join(' / ')}`);
  if(q.quantity!==m.occurrences.reduce((n,o)=>n+o.quantity,0))throw Error(`${m.code}: จำนวนฐานรากไม่ตรง Snapshot`);
  if([q.excavation,q.lean,input.volume,q.backfill].some(n=>!Number.isFinite(n)))throw Error(`${m.code}: ปริมาณงานดินไม่อยู่ในช่วงตัวเลข`);
  const expected=q.excavation-q.lean-input.volume;
  if(Math.abs(expected-q.backfill)>1e-10*Math.max(1,Math.abs(expected)))throw Error(`${m.code}: ปริมาณถมกลับไม่ตรงวิธีวัดที่ตรึง`);
  return {memberId:m.id,code:m.code,quantity:q.quantity,mode:input.mode,basis:input.basis,concrete:q.concrete,excavation:q.excavation,lean:q.lean,buried:input.volume,backfill:q.backfill,locations:m.occurrences.map(o=>`${o.zone||'—'} / ${o.floor||'—'} / ${o.grid||'—'} × ${o.quantity}`).join('\n')};
 });
}
