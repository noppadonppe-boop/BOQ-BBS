import {it,expect} from 'vitest';
import {blankMember,blankBar,currentStarterSpec,type SnapshotBundle} from '../src/domain/model';
import {provisionalQuantityBasis} from '../src/domain/quantityBasis';
import {quantityReport,BOQ_READINESS_POLICY} from '../src/domain/quantityReport';
import {memberRegister} from '../src/domain/memberRegister';
const barMember=(code='QA')=>({...blankMember('Beam',code),bars:[{...blankBar('QA-BAR'),shapeCode:'00',count:1}]});
const bundle=(members:ReturnType<typeof barMember>[])=>({project:{id:'p',code:'P',spec:currentStarterSpec},members,attachments:[],status:'Draft',version:1} as SnapshotBundle);
const entered={version:1 as const,state:'Entered' as const,reference:'Software input QA only',reviewToken:'qty-review'};
it('Provisional element counts hold all complete totals including entered BBS, while raw quantities/steel stay unchanged and review remains distinct from engineering',()=>{
 const m={...barMember(),quantityBasis:provisionalQuantityBasis()};m.occurrences[0].quantity=3;const q=quantityReport(bundle([m]));expect(q.coverage.complete).toBe(true);expect(q.totals[0]).toBe(3);expect(q.totals[6]).toBeGreaterThan(0);expect(q.completeTotals).toEqual(Array(7).fill(null));expect(q.completeRebar).toBeNull();expect(q.rows[0].completeValues).toEqual(Array(7).fill(null));expect(q.readinessPolicy).toBe(BOQ_READINESS_POLICY);
 const ready=quantityReport(bundle([{...m,quantityBasis:entered}]));expect(ready.completeTotals).toEqual(q.totals);expect(ready.rebar).toEqual(q.rebar);expect(ready.coverage.complete).toBe(true);expect(bundle([m]).project.spec.approved).toBe(false);
});
it.each(['Member','Category','Zone','Floor','Summary'] as const)('Holds only selected groups with provisional input, and keeps raw quantities without multiplying occurrences twice: %s',group=>{
 const a={...barMember('PENDING'),quantityBasis:provisionalQuantityBasis()},b={...barMember('READY'),quantityBasis:entered};a.occurrences[0]={id:'a',zone:'North',floor:'L1',grid:'',quantity:2};b.occurrences[0]={id:'b',zone:'South',floor:'L2',grid:'',quantity:3};const q=quantityReport(bundle([a,b]),group);expect(q.totals[0]).toBe(5);expect(q.completeTotals[0]).toBeNull();expect(q.completeRebar).toBeNull();expect(q.rows.filter(r=>r.pendingQuantityMembers).every(r=>r.completeRebar===null&&r.completeValues.every(v=>v===null))).toBe(true);if(['Member','Zone','Floor'].includes(group)){const ready=q.rows.find(r=>!r.pendingQuantityMembers)!;expect(ready.completeValues).toEqual(ready.values);expect(ready.completeValues[0]).toBe(3);}
});
it('Legacy inputs retain their original raw and complete reporting while explicit unknown/zero steel scope remains pending with provisional counts',()=>{
 const legacy=barMember(),old=quantityReport(bundle([legacy]));expect(old.completeTotals).toEqual(old.totals);const zero={...barMember(),bars:[],noRebar:{version:1 as const,basis:'Synthetic no-rebar scope, not design approval'},quantityBasis:provisionalQuantityBasis()},q=quantityReport(bundle([zero]));expect(q.totals[6]).toBe(0);expect(q.completeRebar).toBeNull();expect(q.completeTotals[0]).toBeNull();
});
it('Member register uses actual filtered occurrences for readiness and preserves raw preview quantities',()=>{
 const a={...barMember('PENDING'),quantityBasis:provisionalQuantityBasis()},b={...barMember('READY'),quantityBasis:entered};a.occurrences[0].zone='North';b.occurrences[0].zone='South';const all=memberRegister(bundle([a,b]));expect(all.quantity).toBe(2);expect(all.completeQuantity).toBeNull();expect(all.completeConcrete).toBeNull();expect(all.completeFormwork).toBeNull();expect(all.completeRebar).toBeNull();const ready=memberRegister(bundle([a,b]),{zone:'South'});expect(ready.completeQuantity).toBe(1);expect(ready.completeConcrete).toBe(ready.concrete);expect(ready.completeRebar).toBe(ready.enteredRebar);
});
