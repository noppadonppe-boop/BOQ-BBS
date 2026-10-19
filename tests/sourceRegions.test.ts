import {describe,it,expect} from 'vitest';
import {blankMember,blankBar,currentStarterSpec,memberSchema,type Attachment} from '../src/domain/model';
import {sourceShapeReferenceSchema,regionFromCorners,regionPixels,sourceRegionPlans} from '../src/domain/sourceRegions';
import {sourceScheduleSchema,compareSourceSchedule,sourceScheduleFileProblems} from '../src/domain/sourceSchedule';
import {takeoff,schedule} from '../src/domain/engine';
import {buildRestorePlan} from '../src/domain/restorePlan';
import {copyMemberInputs} from '../src/domain/memberCopy';

const sha='a'.repeat(64);
const reference=()=>({sha256:sha,page:2,rect:{x:.80,y:.10,width:.15,height:.20}});
function fixture(){
 const m=blankMember('Custom','REF-REGION');m.cover=50;m.bars=[{...blankBar('R01'),count:3,shapeCode:'00',outsideDiameter:16,bsType:'T',lengthMethod:'bs8666'}];m.occurrences[0].quantity=2;
 const a:Attachment={id:'source-1',memberId:m.id,name:'source.pdf',path:'p',kind:'Detail',revision:'0A',page:1,pageCount:2,size:100,contentType:'application/pdf',sha256:sha};
 const b=schedule(m,currentStarterSpec)[0];
 m.sourceSchedule={version:2,attachmentId:a.id,sha256:sha,page:1,basis:'perElement',note:'Manual source region review,not approval',rows:[{id:'row-1',mark:'R01',diameter:16,grade:'SD40',count:3,cutLength:b.cutLength,barId:b.id,note:'',shapeReference:reference()}]};
 return {m,a,b};
}
describe('Pinned source bending shape references',()=>{
 it('keeps legacy version1 data byte-equivalent and never assigns a default source rectangle',()=>{const {m}=fixture();const s={...m.sourceSchedule!,version:1 as const,rows:m.sourceSchedule!.rows.map(({shapeReference,...r})=>r)};expect(sourceScheduleSchema.parse(s)).toEqual(s);expect(sourceScheduleSchema.parse(s).rows[0].shapeReference).toBeUndefined();});
 it('requires version2 rather than accepting new region metadata under legacy version1',()=>{const {m}=fixture();expect(sourceScheduleSchema.safeParse({...m.sourceSchedule,version:1}).success).toBe(false);expect(sourceScheduleSchema.safeParse({...m.sourceSchedule,version:3}).success).toBe(false);});
 it.each([
  {x:-.01,y:.1,width:.2,height:.2},
  {x:.9,y:.1,width:.2,height:.2},
  {x:.1,y:.9,width:.2,height:.2},
  {x:.1,y:.1,width:0,height:.2},
  {x:.1,y:.1,width:.2,height:.0001},
  {x:NaN,y:.1,width:.2,height:.2},
 ])('rejects invalid/outside or empty rectangle %j',rect=>{expect(sourceShapeReferenceSchema.safeParse({...reference(),rect}).success).toBe(false);});
 it('rejects invalid page/hash and unknown rectangle fields',()=>{for(const patch of [{page:0},{page:10000},{page:1.5},{sha256:'wrong'},{rect:{...reference().rect,rotation:270}}])expect(sourceShapeReferenceSchema.safeParse({...reference(),...patch}).success).toBe(false);});
 it('requires source-region bytes to match the parent table,including normal member validation',()=>{const {m}=fixture();m.sourceSchedule!.rows[0].shapeReference!.sha256='b'.repeat(64);expect(sourceScheduleSchema.safeParse(m.sourceSchedule).success).toBe(false);expect(memberSchema.safeParse(m).success).toBe(false);});
 it('selects the same explicit rectangle from either pointer corner order',()=>{const a=regionFromCorners(sha,2,[.8,.1],[.95,.3]),b=regionFromCorners(sha,2,[.95,.3],[.8,.1]);expect(a).toEqual(b);expect(a.rect.x).toBe(.8);expect(a.rect.width).toBeCloseTo(.15);expect(()=>regionFromCorners(sha,2,[.8,.1],[.8,.3])).toThrow();});
 it('covers the complete selected fraction with conservative pixel boundaries,including the full page',()=>{expect(regionPixels({sha256:sha,page:1,rect:{x:.123,y:.456,width:.2,height:.1}},1000,700)).toEqual({x:123,y:319,width:200,height:71});expect(regionPixels({sha256:sha,page:1,rect:{x:0,y:0,width:1,height:1}},4096,2894)).toEqual({x:0,y:0,width:4096,height:2894});for(const wh of [[0,10],[10,2.5],[Infinity,10]])expect(()=>regionPixels(reference(),wh[0],wh[1])).toThrow();});
 it('adds source images without changing BOQ,BBS paths,cuts or declared counts',()=>{const {m,a}=fixture(),before=takeoff(m,currentStarterSpec),bars=structuredClone(m.bars);delete m.sourceSchedule!.rows[0].shapeReference;const after=takeoff(m,currentStarterSpec);expect(after).toEqual(before);expect(m.bars).toEqual(bars);expect(compareSourceSchedule(m,after.rows,[a])!.coreMatched).toBe(true);});
 it('allows a shape on another actual source page,without rewriting the table page or interpreting the picture',()=>{const {m,a}=fixture();expect(sourceScheduleFileProblems(m,[a])).toEqual([]);const result=compareSourceSchedule(m,schedule(m,currentStarterSpec),[a])!;expect(result.coreMatched).toBe(true);expect(result.source.page).toBe(1);expect(result.source.rows[0].shapeReference!.page).toBe(2);});
 it('blocks wrong source pages and image page2 even when the numeric BBS fields match',()=>{const {m,a}=fixture();for(const file of [{...a,pageCount:1},{...a,contentType:'image/png' as const,pageCount:2}]){expect(sourceScheduleFileProblems(m,[file]).length).toBeGreaterThan(0);expect(compareSourceSchedule(m,schedule(m,currentStarterSpec),[file])!.coreMatched).toBe(false);expect(()=>sourceRegionPlans({members:[m],attachments:[file]})).toThrow();}});
 it('rejects stale source bytes and other-member ownership before export planning',()=>{const {m,a}=fixture();for(const file of [{...a,sha256:'b'.repeat(64)},{...a,memberId:'another'}])expect(()=>sourceRegionPlans({members:[m],attachments:[file]})).toThrow();expect(()=>sourceRegionPlans({members:[m],attachments:[]})).toThrow();});
 it('preserves source reference geometry/hash on restore while remapping only its parent attachment identity',()=>{const {m,a}=fixture(),bundle:any={schemaVersion:2,project:{id:'p',code:'P',name:'P',spec:currentStarterSpec,titleBlock:{company:'',drawnBy:'',checkedBy:'',drawingPrefix:''}},members:[m],attachments:[a],stock:[],stockLedger:[],cutPlans:[]};const before=structuredClone(m.sourceSchedule);const plan=buildRestorePlan(bundle,[{...a,id:'new-file'}],[],[],'job','now',{'source-1':'new-file'}),restored=plan.entries.find(e=>e.collection==='members')!.data;expect(restored.sourceSchedule.attachmentId).toBe('new-file');expect(restored.sourceSchedule.rows).toEqual(before!.rows);expect(m.sourceSchedule).toEqual(before);expect(restored.status).toBe('Draft');expect(()=>buildRestorePlan(bundle,[{...a,id:'new-file',pageCount:1}],[],[],'job','now',{'source-1':'new-file'})).toThrow();});
 it('clears version2 source-region evidence when copying a member to a new context',()=>{const {m}=fixture(),copy=copyMemberInputs(m,{memberId:'copy-new',code:'NEW',occurrences:[{id:'copy-location',zone:'Z',floor:'L',grid:'A',quantity:1}]});expect(copy.sourceSchedule).toBeUndefined();expect(copy.bars).toHaveLength(1);expect(m.sourceSchedule!.rows[0].shapeReference).toEqual(reference());});
 it('bounds all selected export regions across members and files,with no truncation',()=>{const {m,a}=fixture();const multiple={...m,sourceSchedule:{...m.sourceSchedule!,rows:Array.from({length:300},(_,i)=>({...m.sourceSchedule!.rows[0],id:'row-'+i,mark:String(i)}))}};expect(sourceRegionPlans({members:[multiple],attachments:[a]})).toHaveLength(300);expect(()=>sourceRegionPlans({members:[multiple,m],attachments:[a]})).toThrow('300');expect(()=>sourceRegionPlans({members:[m],attachments:[{...a,size:91*1024*1024}]})).toThrow('90');});
});
