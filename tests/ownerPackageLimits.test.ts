import {describe,it,expect} from 'vitest';
import {validatePackageDrawingReferences} from '../src/domain/submissions';
const ref=(number:string)=>({number,revision:'0A',title:'Reinforcement',memberCode:'F1',memberId:'fixture'});
describe('owner submission drawing register bounds',()=>{
 it('accepts 120 distinct drawing identities without truncation',()=>expect(validatePackageDrawingReferences(Array.from({length:120},(_,i)=>ref('BBS-'+i)))).toBe(120));
 it('requires a separate package above 120 drawings',()=>expect(()=>validatePackageDrawingReferences(Array.from({length:121},(_,i)=>ref('BBS-'+i)))).toThrow(/เกิน120/));
 it('rejects equivalent numbers despite different revision or case',()=>expect(()=>validatePackageDrawingReferences([ref('BBS-é'),{...ref(' bbs-é '),revision:'B'}])).toThrow(/เลขแบบเดียวกัน/));
});
