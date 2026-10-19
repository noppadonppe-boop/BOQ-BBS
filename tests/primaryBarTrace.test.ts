import {describe,it,expect} from 'vitest';
import {primaryBarTrace} from '../src/domain/projection';
import type {Vec3} from '../src/domain/model';
describe('end-on bars in the primary drawing',()=>{
 it.each([[0,1],[0,2],[1,2]] as [number,number][])('preserves every physical bar dot in plane %s/%s',(...axes)=>{
  const normal=[0,1,2].find(a=>!axes.includes(a))!,paths=Array.from({length:8},(_,i)=>{const a:Vec3=[10*i,20*i,30*i],b=[...a] as Vec3;b[normal]+=2900;return [a,b];});
  const t=primaryBarTrace(paths,axes);expect(t.lines).toEqual([]);expect(t.points).toEqual(paths.map(p=>p[0]));
 });
 it('retains oblique and bent paths instead of reducing closed paths to dots',()=>{
  const paths:Vec3[][]=[[[0,0,0],[1,0,100]],[[0,0,0],[10,10,0],[0,0,0]]];expect(primaryBarTrace(paths,[0,1])).toEqual({lines:paths,points:[]});
 });
 it('keeps coincident pieces separate and leaves the input untouched',()=>{
  const paths:Vec3[][]=[[[10,20,30],[10,20,100]],[[10,20,200],[10,20,300]],[]],before=JSON.stringify(paths);
  expect(primaryBarTrace(paths,[0,1]).points).toHaveLength(2);expect(JSON.stringify(paths)).toBe(before);
 });
});
