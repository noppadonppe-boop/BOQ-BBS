import {describe,it,expect} from 'vitest';
import {blankBar,blankMember,starterSpec,currentStarterSpec,defaultSpec,bs2000V1Spec} from '../src/domain/model';
import {schedule} from '../src/domain/engine';
import {bsToleranceReference,toleranceRange,BS_TOLERANCE_REFERENCE} from '../src/domain/bsTolerances';

const member=()=>{const m=blankMember('Custom','T4');m.bars=[{...blankBar('01'),shape:'polyline',shapeCode:'11',lengthMethod:'bs8666',bsType:'T',outsideDiameter:16,bsDimensionsConfirmed:true,radius:40,count:1,points:[[100,100,100],[602,100,100],[602,352,100]],distributionStart:100,distributionEnd:100}];return m;};
describe('supplied Table 4 informational ranges',()=>{
 it('preserves cutting plus/minus25 independently of the bending bands',()=>{
  for(const nominal of [500,1000,1000.001,2000,2000.001,12000])expect(toleranceRange(nominal,'cut')).toEqual({nominal,minus:25,plus:25,lower:nominal-25,upper:nominal+25});
 });
 it('uses exact inclusive1000/2000 bending boundaries without rounding the nominal',()=>{
  for(const [nominal,minus] of [[999.999,5],[1000,5],[1000.001,10],[2000,10],[2000.001,25]])expect(toleranceRange(nominal,'bend')).toEqual({nominal,minus,plus:5,lower:nominal-minus,upper:nominal+5});
 });
 it('rejects invalid dimensions instead of displaying a false range',()=>{
  for(const n of [0,-1,NaN,Infinity,-Infinity])expect(()=>toleranceRange(n,'bend')).toThrow();
 });
 it('keeps nominal cut, outside/free dimensions and original inputs unchanged',()=>{
  const m=member(),before=JSON.stringify(m),row=schedule(m,starterSpec)[0],reference=bsToleranceReference(starterSpec,row)!;
  expect(reference.cut).toEqual({nominal:750,minus:25,plus:25,lower:725,upper:775});
  expect(reference.dimensions.map(d=>[d.label,d.nominal,d.free,d.lower,d.upper])).toEqual([['A',260,false,255,265],['B',510,true,505,515]]);
  expect(reference.notes.join(' ')).toContain('ค่าคลาดเคลื่อนสะสม');expect(JSON.stringify(m)).toBe(before);expect(schedule(m,starterSpec)[0].cutLength).toBe(750);
 });
 it('keeps all three historical numerical policies and custom specifications distinct',()=>{
  const m=member();for(const s of [bs2000V1Spec,starterSpec,currentStarterSpec])expect(bsToleranceReference(s,schedule(m,s)[0])!.cut!.nominal).toBe(750);
  expect(bsToleranceReference(defaultSpec,schedule(m,defaultSpec)[0])).toBeNull();expect(BS_TOLERANCE_REFERENCE.source).toContain('PDF p.17');
 });
 it('does not turn a straight bar length into an outside bending dimension',()=>{
  const m=member();m.bars[0]={...m.bars[0],shapeCode:'00',points:[[100,100,100],[600,100,100]],radius:0};
  const reference=bsToleranceReference(starterSpec,schedule(m,starterSpec)[0])!;expect(reference.cut!.nominal).toBe(500);expect(reference.dimensions).toEqual([]);
 });
 it('leaves unsupported99 coordinates and proposed dimensions unmapped',()=>{
  const m=member();m.bars[0]={...m.bars[0],shapeCode:'99',lengthMethod:'centerline',freeDimensionLeg:1,dimensions:{A:9999},spatialDimensions:[{label:'A',from:[100,100,100],to:[600,100,100],axis:'X',basis:'reference',source:'Synthetic',free:true}] as any};
  const reference=bsToleranceReference(starterSpec,schedule(m,starterSpec)[0])!;expect(reference.dimensions).toEqual([]);expect(reference.notes.join(' ')).toContain('ไม่ใช้ Lxx');
 });
 it('reports manual cut, pending checks and below-minimum endpoint risk without altering them',()=>{
  const m=member();m.bars[0]={...m.bars[0],cutOverride:25,bsDimensionsConfirmed:false,points:[[100,100,100],[222,100,100],[222,352,100]]};
  const reference=bsToleranceReference(starterSpec,schedule(m,starterSpec)[0])!;expect(reference.cut!.lower).toBe(0);const notes=reference.notes.join(' ');expect(notes).toContain('ระบุเอง');expect(notes).toContain('ไม่เป็นบวก');expect(notes).toContain('Table 3');expect(notes).toContain('ไม่ทำให้ผ่าน');
 });
 it('includes derived oblique dimensions and the standard free label without stacking allowances',()=>{
  const m=member();m.bars[0]={...m.bars[0],shapeCode:'26',points:[[100,100,100],[300,100,100],[500,100,300],[800,100,300]]};
  const row=schedule(m,currentStarterSpec)[0],reference=bsToleranceReference(currentStarterSpec,row)!;
  expect(reference.dimensions.map(d=>[d.label,d.free])).toEqual([['A',false],['B',false],['C',true],['D',false]]);expect(reference.cut!.nominal).toBe(row.cutLength);
 });
 it('keeps invalid transient editor values pending instead of crashing the preview',()=>{
  const row=schedule(member(),starterSpec)[0],reference=bsToleranceReference(starterSpec,{...row,cutLength:0})!;
  expect(reference.cut).toBeNull();expect(reference.notes.join(' ')).toContain('ยังไม่ถูกต้อง');
 });
 it('does not display false plus/minus25 bounds beyond floating point precision',()=>{
  expect(()=>toleranceRange(1e18,'cut')).toThrow('ความละเอียด');const row=schedule(member(),starterSpec)[0],reference=bsToleranceReference(starterSpec,{...row,cutLength:1e18})!;
  expect(reference.cut).toBeNull();expect(reference.notes.join(' ')).toContain('ความละเอียด');
 });
});
