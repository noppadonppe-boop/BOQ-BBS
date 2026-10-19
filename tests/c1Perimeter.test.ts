import {describe,it,expect} from 'vitest';
import {c1Bars,c1Spec} from './c1-perimeter-fixture';
import {takeoff,validateMember} from '../src/domain/engine';
import {currentStarterSpec,memberSchema} from '../src/domain/model';
import {BAR_PLACEMENT_POLICY} from '../src/domain/barPlacement';
describe('Supplied C1 dimensions with explicit provisional main-bar inputs',()=>{
 it('uses actual700x700x6600 and quantity1, excludes provisional adjoining concrete from3.234m3 BOQ, and counts24 bars once',()=>{const m=c1Bars(),q=takeoff(m,c1Spec);expect(memberSchema.safeParse(m).success).toBe(true);expect(validateMember(m,c1Spec)).toEqual([]);expect(q.quantity).toBe(1);expect(q.concrete).toBeCloseTo(3.234,12);expect(q.rows[0].count).toBe(24);expect(q.rows[0].cutLength).toBe(7300);expect(q.rows[0].paths).toHaveLength(24);expect(q.rows[0].paths[0][0]).toEqual([74.5,74.5,50]);expect(q.rows[0].paths[1][0][2]).toBe(750);expect(m.bars[0].bsType).toBeUndefined();expect(m.bars[0].bsDimensionsConfirmed).toBe(false);expect(m.bars[0].placementConfirmed).toBe(false);expect(q.rows[0].standard.problems.length).toBeGreaterThan(0);});
 it('fails the legacy cap check at50mm without altering the stored geometry or quantities',()=>{const m=c1Bars(),legacy={...currentStarterSpec,barPlacementPolicy:BAR_PLACEMENT_POLICY};expect(validateMember(m,legacy).join()).toMatch(/cover/);expect(takeoff(m,legacy)).toEqual(takeoff(m,c1Spec));});
 it('also fails new policy when the adjoining bound is removed or an actual radial cover is insufficient',()=>{const m=c1Bars();expect(validateMember({...m,placementContext:undefined},c1Spec).join()).toMatch(/นอกคอนกรีต/);m.bars[0].placementLayout!.anchor[0]=50;expect(validateMember(m,c1Spec).join()).toMatch(/cover/);});
});
