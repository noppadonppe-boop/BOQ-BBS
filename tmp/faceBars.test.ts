import {describe,expect,it} from 'vitest';
import {blankMember,defaultSpec} from '../src/domain/model';
import {applyElementInput,defaultElementInput,elementInputSchema,footingFaceBars,type ElementInput} from '../src/domain/elementInput';
import {validateMember} from '../src/domain/engine';

const spec={...defaultSpec,rounding:25};
function run(sx:string,sy:string,faces:any,split=false){
 const f=defaultElementInput('Foundation') as any;
 Object.assign(f,{width:3000,length:2000,thickness:1200});
 f.rebar.bottomX={...f.rebar.bottomX,shape:sx};f.rebar.bottomY={...f.rebar.bottomY,shape:sy};
 f.rebar.sideBars={...f.rebar.sideBars,enabled:true,diameter:16,spacing:200,...(faces===undefined?{faces:undefined}:{faces}),...(split?{y:{diameter:12,spacing:150}}:{})};
 const input=elementInputSchema.parse(f) as ElementInput;
 const r=applyElementInput({...blankMember('Foundation','F1'),version:1},input,{rounding:25});
 const vert=r.generated.filter(b=>/side-vertical/.test(b.id));
 return {input,vert,count:vert.reduce((s,b)=>s+b.count,0),errors:validateMember(r.member,spec)};
}
describe('footing face bars per face',()=>{
 it('absent = both (old data unchanged)',()=>{const a=run('41','41',undefined);expect(a.count).toBeGreaterThan(0);expect(a.vert).toHaveLength(1);});
 it('auto closes faces at Shape 41 legs',()=>{
  expect(run('41','41','auto').count).toBe(0);
  const x41=run('41','21','auto');expect(x41.vert.every(b=>b.note.includes('ผิวด้าน X'))).toBe(true);
  const y41=run('21','41','auto');expect(y41.vert.every(b=>b.note.includes('ผิวด้าน Y'))).toBe(true);
  expect(run('21','21','auto').vert).toHaveLength(1);
  console.log(x41.vert.map(b=>`${b.id} n=${b.count} ${b.note}`));
  console.log(y41.vert.map(b=>`${b.id} n=${b.count} ${b.note}`));
 });
 it('explicit x / y, split sizes',()=>{
  const x=run('21','21','x',true);expect(x.vert.every(b=>b.diameter===16&&b.note.includes('ผิวด้าน X'))).toBe(true);
  const y=run('21','21','y',true);expect(y.vert.every(b=>b.diameter===12&&b.note.includes('ผิวด้าน Y'))).toBe(true);
  const both=run('21','21','both',true);expect(new Set(both.vert.map(b=>b.diameter))).toEqual(new Set([16,12]));
  for(const r of [x,y,both])expect(r.errors).toEqual([]);
 });
 it('resolver',()=>{const fb=footingFaceBars(run('41','21','auto').input as any);expect(fb).toMatchObject({x:true,y:false,closed:{x:false,y:true}});});
});
