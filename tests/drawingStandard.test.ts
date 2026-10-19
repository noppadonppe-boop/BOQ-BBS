import {describe,it,expect} from 'vitest';
import {blankMember} from '../src/domain/model';
import {drawingSetupSchema,drawingProfileSchema,drawingNumberKey,drawingReferences,validateDrawingNumbers} from '../src/domain/drawingStandard';
const profile={template:'owner-v1',language:'th',projectName:'Project',company:'QS',owner:'Owner',location:'Site',contract:'C001',discipline:'Rebar',preparedBy:'Draftsman',checkedBy:'Checker name',indexNumber:'IDX-001',indexRevision:'0A'};
const member=()=>({...blankMember('Beam','B01'),drawingSetup:{number:'BBS-001',revision:'0A',title:'Beam reinforcement'}}),bundle=(ms:any[],p:any=profile)=>({project:{drawingProfile:p},members:ms}) as any;
describe('explicit owner drawing metadata',()=>{
 it('legacy snapshots produce no invented owner references',()=>expect(drawingReferences(bundle([member()],null),'details-v2')).toEqual([]));
 it('member reference carries exact number/revision/title independent of A4 source reference',()=>{const m={...member(),scheduleSetup:{drawingNumber:'SOURCE-999',revisionLetter:'B',startNumber:1}};expect(drawingReferences(bundle([m]),'details-v2')[0]).toMatchObject({number:'BBS-001',revision:'0A',title:'Beam reinforcement'});expect(m.scheduleSetup.drawingNumber).toBe('SOURCE-999');});
 it('missing number/revision/title blocks an owner drawing',()=>{for(const field of ['number','revision','title'])expect(()=>drawingReferences(bundle([{...member(),drawingSetup:{...member().drawingSetup,[field]:''}}]),'details-v2')).toThrow(/ให้ครบ/);});
 it('NFC/case/outer whitespace normalize document identities',()=>expect(drawingNumberKey(' BBS-É001 ')).toBe(drawingNumberKey('bbs-e\u0301001')));
 it('different revision does not make duplicate member drawing numbers safe',()=>{const a=member(),b={...member(),code:'B02',drawingSetup:{number:' bbs-001 ',revision:'B',title:'Other'}};expect(()=>validateDrawingNumbers([a,b])).toThrow(/ซ้ำ/);});
 it('source package records a distinct named project index',()=>expect(drawingReferences(bundle([member()]),'source-v9')[1]).toMatchObject({memberId:'',number:'IDX-001',revision:'0A'}));
 it('index number conflicting with member drawing refuses source generation',()=>expect(()=>drawingReferences(bundle([member()],{...profile,indexNumber:'bbs-001'}),'source-v9')).toThrow(/ซ้ำ/));
 it('missing index revision blocks source package while ordinary owner drawing remains allowed',()=>{const b=bundle([member()],{...profile,indexRevision:''});expect(drawingReferences(b,'details-v2')).toHaveLength(1);expect(()=>drawingReferences(b,'source-v9')).toThrow(/ให้ครบ/);});
 it('profile lengths and supported template/language are explicit',()=>{expect(drawingProfileSchema.safeParse(profile).success).toBe(true);for(const patch of [{projectName:''},{company:'W'.repeat(81)},{indexRevision:'A'.repeat(17)},{template:'construction-approved'},{language:'xx'}])expect(drawingProfileSchema.safeParse({...profile,...patch}).success).toBe(false);});
 it('setup limits reject oversized official fields',()=>{expect(drawingSetupSchema.safeParse(member().drawingSetup).success).toBe(true);for(const patch of [{number:'X'.repeat(81)},{title:'X'.repeat(121)},{revision:'A'.repeat(17)}])expect(drawingSetupSchema.safeParse({...member().drawingSetup,...patch}).success).toBe(false);});
});
