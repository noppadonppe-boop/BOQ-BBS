import {it,expect} from 'vitest';
import {blankMember,currentStarterSpec,type Attachment} from '../src/domain/model';
import {startSourceBar} from '../src/domain/sourceBarStarter';
import {previewSourceBar} from '../src/domain/sourceBarPreview';
function fixture(){
 const member=blankMember('Custom','PREVIEW');member.occurrences[0].quantity=5;const sha='a'.repeat(64);
 member.sourceSchedule={version:1,attachmentId:'A',sha256:sha,page:1,basis:'allOccurrences',note:'Synthetic preview only',rows:[{id:'ROW',mark:'R1',diameter:12,grade:'SD40',count:10,cutLength:790,unitWeight:.7,weight:7,note:''}]};
 const attachment={id:'A',name:'Source.pdf',revision:'0A',sha256:sha,pageCount:1,contentType:'application/pdf',memberId:''} as Attachment,draft=startSourceBar(member,'ROW',[attachment]),points='[[100,100,100],[900,100,100]]';draft.bar.distributionStart=100;draft.bar.distributionEnd=200;
 return {member,attachment,draft,points};
}
it('Calculates a disposable candidate without copying printed cut or changing source/mapping/BOQ input',()=>{
 const {member,attachment,draft,points}=fixture(),before=structuredClone(member),p=previewSourceBar(member,draft,draft.bar,points,currentStarterSpec,[attachment]);
 expect(p.problems).toEqual([]);expect(p.canApply).toBe(true);expect(member).toEqual(before);expect(member.bars).toHaveLength(0);expect(member.sourceSchedule!.rows[0].barId).toBeUndefined();
 expect('barRow' in p&&p.barRow.cutLength).toBe(800);expect('comparison' in p&&p.comparison.actualCount).toBe(10);expect('comparison' in p&&p.comparison.differences).toContain('ยาวตัด');
 expect('candidateBar' in p&&p.candidateBar.points).toEqual([[100,100,100],[900,100,100]]);expect(draft.bar.points).toEqual([]);expect(p.standardProblems.length).toBeGreaterThan(0);
});
it('Shows per-piece weight independently of the full-member source count',()=>{
 const {member,attachment,draft,points}=fixture(),p=previewSourceBar(member,draft,draft.bar,points,currentStarterSpec,[attachment]);expect(p.canApply).toBe(true);expect('comparison' in p&&p.comparison.actualWeight).toBeCloseTo(('comparison' in p?p.comparison.actualUnitWeight!:0)*10);
 const one=structuredClone(member);one.occurrences[0].quantity=1;one.sourceSchedule!.rows[0].count=2;const d=startSourceBar(one,'ROW',[attachment]);d.bar.distributionStart=100;d.bar.distributionEnd=200;const q=previewSourceBar(one,d,d.bar,points,currentStarterSpec,[attachment]);expect(q.canApply).toBe(true);expect('comparison' in q&&q.comparison.actualUnitWeight).toBe('comparison' in p&&p.comparison.actualUnitWeight);
});
it.each(['not json','{}','[[100,100],[900,100]]','[[100,100,100],[9000,100,100]]'])('Does not publish stale/zero geometry as a ready candidate for %s',points=>{
 const {member,attachment,draft}=fixture(),p=previewSourceBar(member,draft,draft.bar,points,currentStarterSpec,[attachment]);expect(p.canApply).toBe(false);expect('barRow' in p).toBe(false);expect(p.problems.length).toBeGreaterThan(0);
});
it('Pending dimension/placement edits withhold previous geometry and statistics',()=>{const {member,attachment,draft,points}=fixture(),p=previewSourceBar(member,draft,draft.bar,points,currentStarterSpec,[attachment],true);expect(p.canApply).toBe(false);expect('barRow' in p).toBe(false);expect(p.problems[0]).toContain('ยังมีมิติ');});
it('Stale member/source identity is rejected before a candidate is published',()=>{const {member,attachment,draft,points}=fixture();member.sourceSchedule!.rows[0].cutLength=800;expect(previewSourceBar(member,draft,draft.bar,points,currentStarterSpec,[attachment]).canApply).toBe(false);});
it('Superseded source and a different candidate bar identity are rejected',()=>{const {member,attachment,draft,points}=fixture();expect(previewSourceBar(member,draft,draft.bar,points,currentStarterSpec,[{...attachment,sourceStatus:'Superseded'}]).canApply).toBe(false);expect(previewSourceBar(member,draft,{...draft.bar,id:'OTHER'},points,currentStarterSpec,[attachment]).canApply).toBe(false);});
