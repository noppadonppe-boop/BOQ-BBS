import {describe,it,expect} from 'vitest';
import {blankBar,blankMember,bs2000V7Spec as currentStarterSpec,barSchema,type Vec3} from '../src/domain/model';
import {BAR_PLACEMENT_POLICY} from '../src/domain/barPlacement';
import {planarInputPoints,type PlanarPathInput} from '../src/domain/planarPathInput';
import {buildPlanarPath} from '../src/domain/planarPathBuilder';
import {tangentBar,tangentSketch} from '../src/domain/tangentBar';
import {schedule} from '../src/domain/engine';
import {calculationEngine} from '../src/domain/version';
import {copyMemberInputs} from '../src/domain/memberCopy';

const spec={...currentStarterSpec,barPlacementPolicy:BAR_PLACEMENT_POLICY};
const member=()=>({...blankMember('Custom','SUPPORT-QA'),x:5000,y:5000,z:5000});
const input=(patch:Partial<PlanarPathInput>={}):PlanarPathInput=>({version:1,plane:'XY',basis:'support',startAngle:270,outsideDiameter:12,innerRadius:24,reference:'Explicit geometric interpretation only / source and engineering confirmation pending',legs:[{length:111,turn:0},{length:600,turn:90},{length:111,turn:135}],...patch});
function bar(d=input()){const m=member(),b=buildPlanarPath(m,{...blankBar('M4'),diameter:12,count:1},spec,d,[2000,2000,2000],2000);return {m,b};}
const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);

describe('Explicit support basis for chained Code99 geometry',()=>{
 it('keeps a source-shaped 111/600/111 interpretation distinct from the printed790 cut',()=>{
  const {m,b}=bar(),r=schedule({...m,bars:[b]},spec)[0],g=planarInputPoints(input());
  // Independent tangent straight lengths:75 +528 +75; arcs:30*(90+135)deg.
  expect(r.geometricLength).toBeCloseTo(678+30*5*Math.PI/4,9);
  expect(r.cutLength).toBe(800);expect(r.cutLength).not.toBe(790);
  expect(g.virtual).toEqual(expect.arrayContaining([expect.closeTo(105,9),expect.closeTo(630.426406871,8),expect.closeTo(147.426406871,8)]));
  expect(b.bsType).toBeUndefined();expect(b.bsDimensionsConfirmed).toBe(false);expect(b.placementConfirmed).toBe(false);
  expect(r.standard.problems.join(' ')).toContain('8.5');
 });
 it('locates independent incoming/outgoing tangent lines on the outer circular surface',()=>{
  const {m,b}=bar(),e=tangentBar(m,b);expect(e.available).toBe(true);if(!e.available)return;
  expect(e.dimensions.map(d=>d.label)).toEqual(['L01','L02','L03']);expect(e.dimensions.map(d=>d.value)).toEqual([expect.closeTo(111,8),expect.closeTo(600,8),expect.closeTo(111,8)]);
  expect(e.tangents.map(t=>t.label)).toEqual(['T02i','T02o']);
  for(const t of e.tangents){const c=e.centers[2]!,radial=t.touch.map((v,i)=>v-c[i]),line=t.to.map((v,i)=>v-t.from[i]);expect(Math.hypot(...radial)).toBeCloseTo(36,9);expect(dot(radial,line)).toBeCloseTo(0,6);}
  // Physical outline extremes in a frame aligned with the first leg.
  expect(Math.max(...e.outline.map(p=>p[0]))-Math.min(...e.outline.map(p=>p[0]))).toBeCloseTo(600,8);
 });
 it.each([105,120,135,150])('matches the physical single-bend circle-support span at %s degrees',turn=>{
  const {m,b}=bar(input({startAngle:0,legs:[{length:500,turn:0},{length:400,turn}]})),e=tangentBar(m,b);expect(e.available).toBe(true);if(!e.available)return;
  const incoming=[1,0],outgoing=[Math.cos(turn*Math.PI/180),-Math.sin(turn*Math.PI/180)],c=e.centers[1]!;
  expect(dot(e.tangents[0].touch,incoming)-dot(e.points[0],incoming)).toBeCloseTo(500,8);
  expect(dot(e.points[2],outgoing)-dot(e.tangents[1].touch,outgoing)).toBeCloseTo(400,8);
  expect(Math.hypot(...e.tangents[0].touch.map((v,i)=>v-c[i]))).toBeCloseTo(36,8);
 });
 it.each(['XY','XZ','YZ'] as const)('keeps source dimensions under plane %s and rigid rotation',plane=>{
  const {m,b}=bar(input({plane,templateRotation:[20,-15,35]})),e=tangentBar(m,{...b,freeDimensionLeg:3});expect(e.available).toBe(true);if(!e.available)return;
  expect(e.dimensions.map(d=>d.value)).toEqual([expect.closeTo(111,7),expect.closeTo(600,7),expect.closeTo(111,7)]);expect(e.dimensions.filter(d=>d.free).map(d=>d.label)).toEqual(['L03']);
 });
 it('supports opposite acute turns and paginates more than six leg dimensions',()=>{
  const d=input({startAngle:0,legs:Array.from({length:8},(_,i)=>({length:500,turn:i?(i%2?135:-135):0}))}),g=planarInputPoints(d),m=member(),b={...blankBar('CHAIN'),shape:'polyline' as const,shapeCode:'99',diameter:12,outsideDiameter:12,radius:g.centerRadius,points:g.points as Vec3[],pathInput:d},e=tangentBar(m,b);
  expect(e.available).toBe(true);if(!e.available)return;expect(e.tangents).toHaveLength(14);
  const a=tangentSketch(e),z=tangentSketch(e,760,440,1);expect(a.dimensions.map(d=>d.label)).toEqual(['L01','L02','L03','L04','L05','L06']);expect(z.dimensions.map(d=>d.label)).toEqual(['L07','L08']);expect(z.total).toBe(2);
  for(const s of [a,z])for(const p of [...s.outline,...s.dimensions.flatMap(d=>[d.a,d.b,d.labelAt])]){expect(p[0]).toBeGreaterThan(0);expect(p[0]).toBeLessThan(760);expect(p[1]).toBeGreaterThan(0);expect(p[1]).toBeLessThan(440);}
 });
 it('preserves legacy two-leg A/B/C and leaves unopted multiple acute geometry pending',()=>{
  const {m,b}=bar(input({startAngle:0,legs:[{length:500,turn:0},{length:400,turn:135}]}));const old=tangentBar(m,{...b,pathInput:undefined});expect(old.available).toBe(true);if(old.available)expect(old.dimensions.map(d=>d.label)).toEqual(['C','A','B']);
  const chained=bar();expect(tangentBar(chained.m,{...chained.b,pathInput:undefined}).available).toBe(false);
  expect(calculationEngine(spec)).toBe('geometry-2.2+bs8666-2000-v7+bar-placement-1.0');
 });
 it.each([90,-90])('draws the signed input plane for first turn %s, independently of physical template rotation',turn=>{
  const d=input({startAngle:turn<0?135:270,templateRotation:[20,-15,35],legs:[{length:300,turn:0},{length:600,turn},{length:300,turn:turn<0?-135:135}]}),g=planarInputPoints(d),{m,b}=bar(d),e=tangentBar(m,b);expect(e.available).toBe(true);if(!e.available)return;
  e.points.forEach((p,i)=>{expect(p[0]).toBeCloseTo(g.basePoints[i][0],7);expect(p[1]).toBeCloseTo(-g.basePoints[i][1],7);});
 });
 it('rejects overlapping bend trims and retains the planar surface touch guard',()=>{
  const m=member(),b={...blankBar('BAD'),diameter:12,count:1};expect(()=>buildPlanarPath(m,b,spec,input({legs:[{length:111,turn:0},{length:20,turn:90},{length:111,turn:135}]}),[2000,2000,2000],2000)).toThrow();
  const d=input({startAngle:0,legs:[{length:400,turn:0},{length:400,turn:90},{length:400,turn:90},{length:400,turn:90}]}),g=planarInputPoints(d),e=tangentBar(m,{...b,shape:'polyline',shapeCode:'99',outsideDiameter:12,radius:g.centerRadius,points:g.points as Vec3[],pathInput:d});expect(e.available).toBe(false);
 });
 it('retains metadata through schema/copy and rejects stale point or basis mutations',()=>{
  const {m,b}=bar();expect(barSchema.safeParse(b).success).toBe(true);expect(barSchema.safeParse({...b,pathInput:{...b.pathInput!,basis:'outside'}}).success).toBe(false);expect(barSchema.safeParse({...b,radius:31}).success).toBe(false);
  const copy=copyMemberInputs({...m,bars:[b]},{memberId:'COPY',code:'COPY',occurrences:m.occurrences});expect(copy.bars[0].pathInput).toEqual(b.pathInput);expect(copy.bars[0].bsDimensionsConfirmed).toBe(false);
 });
});
