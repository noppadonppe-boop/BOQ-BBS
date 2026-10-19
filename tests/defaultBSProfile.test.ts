import {it,expect} from 'vitest';
import {currentStarterSpec,bs2000V7Spec,bs2000V8Spec,defaultSpec,blankMember,blankBar} from '../src/domain/model';
import {BS2000,bsFormulaCodes,bsGeneration} from '../src/domain/bs8666';
import {buildBSOvalLink} from '../src/domain/bsOvalLinkBuilder';
import {buildBSRectLink} from '../src/domain/bsRectLinkBuilder';
import {OVAL_CLOSURE_PENDING} from '../src/domain/bsOvalLink';
import {LINK_CLOSURE_PENDING} from '../src/domain/bsRectLink';
import {schedule,minimumProblems} from '../src/domain/engine';
import {calculationEngine,supportsBundle} from '../src/domain/version';
it('Starts new projects with all supplied Table1 formula codes including33 while retaining the exact source edition/hash',()=>{
 expect(currentStarterSpec).toEqual(bs2000V8Spec);expect(bsGeneration(currentStarterSpec)).toBe(8);
 expect(bsFormulaCodes(currentStarterSpec).split('/')).toEqual(['00','11','12','13','15','21','25','26','31','33','41','44','46','51','67','77']);
 expect(currentStarterSpec.ruleSource).toContain(BS2000.sha256);expect(currentStarterSpec.bsEdition).toBe('BS 8666:2000 + Amd 1/2');expect(currentStarterSpec.rounding).toBe(25);
});
it('Default minimum does not invent an ACI edition, engineer, approval, SD40 material mapping or special-detail acceptance',()=>{
 expect(currentStarterSpec.aciEdition).toBe('');expect(currentStarterSpec.engineer).toBe('');expect(currentStarterSpec.approved).toBe(false);expect(currentStarterSpec.evidenceFileId).toBe('');expect(currentStarterSpec.projectMaterials).toBeUndefined();expect(currentStarterSpec.code99ReviewPolicy).toBeUndefined();
});
it('Independently reproduces supplied Code33 equation1804mm rounded once to1825, while old v7 still uses its1800mm fallback',()=>{
 const m=blankMember('Custom','STARTER'),raw={...blankBar('33'),diameter:12,outsideDiameter:12,bsType:'T' as const,grade:'QA only'},b=buildBSOvalLink(m,raw,currentStarterSpec,500,200,250);m.bars=[b];
 const old=structuredClone(bs2000V7Spec),storedMember=structuredClone(m);
 expect(schedule(m,currentStarterSpec)[0].cutLength).toBe(1825);expect(schedule(m,currentStarterSpec)[0].standard.formulaLength).toBe(2*500+3*200+17*12);
 expect(schedule(m,old)[0].cutLength).toBe(1800);expect(schedule(m,old)[0].standard.ovalLink).toBeUndefined();expect(old).toEqual(bs2000V7Spec);expect(m).toEqual(storedMember);
 expect(calculationEngine(old)).toBe('geometry-2.2+bs8666-2000-v7');expect(calculationEngine(currentStarterSpec)).toBe('geometry-2.2+bs8666-2000-v8');
 expect(supportsBundle({engineVersion:calculationEngine(old),project:{spec:old}} as any)).toBe(true);expect(supportsBundle({engineVersion:calculationEngine(old),project:{spec:currentStarterSpec}} as any)).toBe(false);
});
it('Explicitly confirmed dimensions/placement never resolve33/51 physical closure just by adopting the default',()=>{
 const m=blankMember('Custom','PENDING'),raw={...blankBar('L'),diameter:12,outsideDiameter:12,bsType:'T' as const,grade:'QA only'};
 const oval={...buildBSOvalLink(m,raw,currentStarterSpec,500,200,250),bsDimensionsConfirmed:true,placementConfirmed:true};
 expect(minimumProblems({...m,bars:[oval]},currentStarterSpec).join(' ')).toContain(OVAL_CLOSURE_PENDING);
 const rect={...buildBSRectLink(m,raw,currentStarterSpec,500,400,200,24),bsDimensionsConfirmed:true,placementConfirmed:true};
 expect(minimumProblems({...m,bars:[rect]},currentStarterSpec).join(' ')).toContain(LINK_CLOSURE_PENDING);
});
it('Legacy unconfigured Spec and explicit v7 remain distinct stable records rather than inheriting new defaults',()=>{
 expect(defaultSpec.minimumStandard).toBeUndefined();expect(defaultSpec.rounding).toBe(1);expect(bs2000V7Spec.minimumStandard).toBe('bs8666-2000-v7');expect(bs2000V7Spec.ruleVersion).toBe('bs8666-2000-minimum-7.0');
});
