import {it,expect} from 'vitest';
import first from './fixtures/b104-native-panels.json';
import last from './fixtures/b104-page19-native.json';
import {sourceTableCandidate,acceptSourceTable,type NativeSourceTextPage} from '../src/domain/sourceTableIntake';
import {appendSourcePage} from '../src/domain/sourceTableAppend';
import {sourceScheduleSchema,compareSourceSchedule,sourceScheduleFileProblems} from '../src/domain/sourceSchedule';
import {blankMember,type Attachment} from '../src/domain/model';
import {startSourceBar} from '../src/domain/sourceBarStarter';
const file:Attachment={id:'source',name:first.file,path:'projects/p/files/source/file.pdf',memberId:'m',kind:'Detail',revision:'0A',page:2,pageCount:19,size:1,sha256:first.sha256,contentType:'application/pdf'};
const review={basis:'allOccurrences' as const,note:'Literal source-only QA / page scope reviewed; not engineering acceptance',reviewed:true,unitsConfirmed:true};
const page=(f:typeof first|typeof last)=>sourceTableCandidate(structuredClone(f.page) as NativeSourceTextPage,f.sha256);
const old=()=>acceptSourceTable(page(first),file,review);
const combined=()=>appendSourcePage(old(),page(last),file,review);
it('Appends all15 independent B104page19 cells to40page2 cells without inferring an overall printed Total, BBS mapping or grade',()=>{
 const o=old();o.rows[0].barId='bar1';const s=appendSourcePage(o,page(last),file,review);
 expect(s.version).toBe(3);expect(s.rows).toHaveLength(55);expect(s.statedTotalWeight).toBeUndefined();expect(s.pageTables?.map(t=>[t.page,t.statedTotalWeight])).toEqual([[2,2908.61],[19,891.57]]);
 expect(s.rows.slice(0,40).map(r=>r.id)).toEqual(o.rows.map(r=>r.id));expect(s.rows.slice(0,40).map(r=>r.shapeReference)).toEqual(o.rows.map(r=>r.shapeReference));expect(s.rows.every(r=>!r.barId&&r.grade==='SD40')).toBe(true);
 expect(s.rows.slice(40).map(({mark,diameter,count,grade,cutLength,unitWeight,weight})=>({mark,diameter,count,grade,cutLength,unitWeight,weight}))).toEqual(last.expected);expect(s.rows.map(r=>r.sourcePage)).toEqual([...Array(40).fill(2),...Array(15).fill(19)]);
 expect(o.rows[0].barId).toBe('bar1');expect(o.version).toBe(2);
});
it.each(['page','sha','file','basis','mark','unreadable','unreviewed','units','page-range','superseded'])('Rejects unsafe or unreviewed append: %s',kind=>{
 const o=old(),c=page(last),f={...file},r={...review};if(kind==='page')c.page=2;if(kind==='sha')f.sha256='a'.repeat(64);if(kind==='file')f.id='other';if(kind==='basis')r.basis='perElement' as typeof r.basis;if(kind==='mark')c.rows[0].mark=o.rows[0].mark.toLowerCase();if(kind==='unreadable')c.ready=false;if(kind==='unreviewed')r.reviewed=false;if(kind==='units')r.unitsConfirmed=false;if(kind==='page-range')f.pageCount=18;if(kind==='superseded')f.sourceStatus='Superseded';expect(()=>appendSourcePage(o,c,f,r)).toThrow();
});
it('Keeps per-page printed/row differences independently visible and takes no source-only reinforcement quantity',()=>{
 const m={...blankMember('Beam','SOURCE-ONLY'),id:'m',sourceSchedule:combined()},r=compareSourceSchedule(m,[],[file])!;
 expect(r.pageWeights.map(t=>t.rows)).toEqual([40,15]);expect(r.pageWeights[0].difference).toBeCloseTo(-.02,8);expect(r.pageWeights[1].difference).toBeCloseTo(0,8);expect(r.actualWeight).toBe(0);expect(r.rows.every(r=>r.status==='Unmapped')).toBe(true);expect(sourceScheduleFileProblems(m,[file])).toEqual([]);
});
it('Allows a separately reviewed shape on another valid detail page while retaining the table-page provenance',()=>{
 const s=combined();s.rows[40].shapeReference!.page=2;expect(sourceScheduleSchema.safeParse(s).success).toBe(true);const m={...blankMember('Beam','SOURCE-ONLY'),id:'m',sourceSchedule:s};expect(sourceScheduleFileProblems(m,[file])).toEqual([]);s.rows[40].shapeReference!.page=20;expect(sourceScheduleFileProblems(m,[file]).join(' ')).toContain('หน้ารูปดัด');
});
it.each(['unregistered-row','duplicate-page','empty-page','global-total','legacy-with-pages'])('Rejects inconsistent page register: %s',kind=>{const s=combined();if(kind==='unregistered-row')s.rows[0].sourcePage=3;if(kind==='duplicate-page')s.pageTables![1].page=2;if(kind==='empty-page')s.rows=s.rows.filter(r=>r.sourcePage!==19);if(kind==='global-total')s.statedTotalWeight=3800.18;if(kind==='legacy-with-pages')s.version=2;expect(sourceScheduleSchema.safeParse(s).success).toBe(false);});
it('Starts a disposable bar from the correct table page, retaining the literal grade without creating placement approval',()=>{const s=combined(),m={...blankMember('Beam','SOURCE-ONLY'),id:'m',sourceSchedule:s},d=startSourceBar(m,s.rows[40].id,[file]);expect(d.reference).toContain('/ p19 / Mark 1255');expect(d.bar.grade).toBe('SD40');expect(d.bar.placementConfirmed).toBe(false);expect(m.bars).toEqual([]);});
it('Rejects growth above300rows or20registered pages and rejects stale old page/crop bounds',()=>{
 const c=page(last),o=old();o.rows=Array.from({length:290},(_,i)=>({...o.rows[0],id:'id'+i,mark:'ROW'+i}));expect(()=>appendSourcePage(o,c,file,review)).toThrow('300');
 const s=combined();s.page=1;s.pageTables=Array.from({length:20},(_,i)=>({page:i+1,note:'Independent synthetic boundary QA'}));s.rows=Array.from({length:20},(_,i)=>({...s.rows[0],id:'id'+i,mark:'ROW'+i,sourcePage:i+1}));const next={...c,page:21};expect(()=>appendSourcePage(s,next,{...file,pageCount:21},review)).toThrow('20');
 const stale=old();stale.page=20;expect(()=>appendSourcePage(stale,c,file,review)).toThrow('เกินไฟล์');stale.page=2;stale.rows[0].shapeReference!.page=20;expect(()=>appendSourcePage(stale,c,file,review)).toThrow('เกินไฟล์');
});
