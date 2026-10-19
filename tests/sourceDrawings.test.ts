import {describe,it,expect} from 'vitest';
import {blankMember,blankBar,starterSpec} from '../src/domain/model';
import type {SnapshotBundle,Attachment} from '../src/domain/model';
import {sourceSheets,sourceFit,sourceCallouts} from '../src/domain/sourceDrawings';
import {takeoff} from '../src/domain/engine';
import {validateExportFormat} from '../src/domain/cuttingSchedule';

const make=()=>{
 const a=blankMember('Foundation','F01'),b=blankMember('Beam','B01');a.bars=[blankBar('SAME')];b.bars=[blankBar('SAME')];
 const attachment:Attachment={id:'file',name:'source.pdf',path:'projects/p/files/file/source.pdf',memberId:a.id,kind:'Detail',revision:'0A',size:100,contentType:'application/pdf',page:1,annotations:[{mark:'SAME',page:1,x:.2,y:.3}]};
 return {schemaVersion:2,project:{id:'p',spec:starterSpec},members:[a,b],attachments:[attachment],stock:[],stockLedger:[],cutPlans:[],createdAt:'2026-10-12',status:'Draft',version:1} as SnapshotBundle;
};
describe('source drawing references',()=>{
 it('resolves identical Mark names by owning member, not another member',()=>{const b=make();b.members[1].bars[0].diameter=25;expect(sourceSheets(b,'A3')[0].anchors[0].bar.diameter).toBe(16);});
 it('cannot silently relink a deleted Mark to another member',()=>{const b=make();b.members[0].bars=[];expect(()=>sourceSheets(b,'A3')).toThrow(/ไม่มี/);});
 it('rejects dangling Mark names with the source and callout number',()=>{const b=make();b.attachments[0].annotations![0].mark='REMOVED';expect(()=>sourceSheets(b,'A1')).toThrow(/source.pdf.*#1.*REMOVED/);});
 it('selected member scope excludes unrelated source files and General Spec',()=>{const b=make();b.attachments.push({...b.attachments[0],id:'global',memberId:''},{...b.attachments[0],id:'other',memberId:b.members[1].id});b.members=b.members.slice(0,1);expect(sourceSheets(b,'A3').map(s=>s.attachment.id)).toEqual(['file']);});
 it('one Mark can have many callouts without multiplying physical quantities',()=>{const b=make(),before=takeoff(b.members[0],starterSpec);b.attachments[0].annotations=Array.from({length:29},()=>({mark:'SAME',page:1,x:.5,y:.5}));expect(sourceSheets(b,'A3')).toHaveLength(3);expect(sourceSheets(b,'A1')).toHaveLength(2);expect(takeoff(b.members[0],starterSpec)).toEqual(before);});
 it('continuations retain all original callout numbers exactly once',()=>{const b=make();b.attachments[0].annotations=Array.from({length:40},(_,i)=>({mark:'SAME',page:i<17?2:1,x:.5,y:.5}));const s=sourceSheets(b,'A3');expect(s.map(s=>s.page)).toEqual([1,1,2,2]);expect(s.flatMap(s=>s.anchors.map(a=>a.number)).sort((a,b)=>a-b)).toEqual(Array.from({length:40},(_,i)=>i+1));expect(s.map(s=>s.parts)).toEqual([2,2,2,2]);});
 it('refuses malformed page/point coordinates rather than clipping targets',()=>{for(const bad of [{page:0},{page:1.5},{x:NaN},{x:1.1},{y:-.01}]){const b=make();Object.assign(b.attachments[0].annotations![0],bad);expect(()=>sourceSheets(b,'A3')).toThrow(/จุดชี้/);}});
 it('image annotations cannot claim a second page',()=>{const b=make();b.attachments[0].contentType='image/png';b.attachments[0].annotations![0].page=2;expect(()=>sourceSheets(b,'A1')).toThrow(/หน้า 1/);});
 it('no saved member callouts yields an actionable error',()=>{const b=make();b.attachments[0].annotations=[];expect(()=>sourceSheets(b,'A1')).toThrow(/ยังไม่มีจุดชี้/);});
 it('source byte and sheet limits apply before publishing a package',()=>{const b=make();b.attachments[0].size=91*1024*1024;expect(()=>sourceSheets(b,'A3')).toThrow(/90 MB/);b.attachments=Array.from({length:5},(_,i)=>({...b.attachments[0],size:100,id:'f'+i,annotations:Array.from({length:500},(_,i)=>({mark:'SAME',page:1,x:.5,y:.5}))}));expect(()=>sourceSheets(b,'A3')).toThrow(/200/);});
 it('supports exact edge targets while keeping labels inside the drawing area',()=>{const b=make();b.attachments[0].annotations=[{mark:'SAME',page:1,x:0,y:0},{mark:'SAME',page:1,x:1,y:1}];const a=sourceCallouts(sourceSheets(b,'A3')[0].anchors,{x:10,y:20,w:200,h:100});expect(a.map(p=>p.target)).toEqual([{x:10,y:20},{x:210,y:120}]);for(const p of a){expect(p.label.x).toBeGreaterThanOrEqual(14);expect(p.label.x).toBeLessThanOrEqual(206);expect(p.label.y).toBeGreaterThanOrEqual(24);expect(p.label.y).toBeLessThanOrEqual(116);}});
 it('clustered callouts keep distinct numbered labels and preserve target points',()=>{const b=make();b.attachments[0].annotations=Array.from({length:12},()=>({mark:'SAME',page:1,x:.5,y:.5}));const a=sourceCallouts(sourceSheets(b,'A3')[0].anchors,{x:0,y:0,w:240,h:160});expect(new Set(a.map(p=>p.label.x+','+p.label.y)).size).toBe(12);expect(a.every(p=>p.target.x===120&&p.target.y===80)).toBe(true);});
 it('narrow sources use the outer drawing area for readable leaders',()=>{const b=make();const a=sourceCallouts(sourceSheets(b,'A3')[0].anchors,{x:100,y:0,w:1,h:160},{x:0,y:0,w:240,h:160})[0];expect(a.target.x).toBeCloseTo(100.2);expect(a.label.x).toBeGreaterThan(4);expect(a.label.x).toBeLessThan(236);});
 it('cardinal rotation changes the displayed aspect ratio, never normalized pointer coordinates',()=>{for(const angle of [0,90,180,270,-90,450]){const f=sourceFit(400,200,angle,{x:10,y:20,w:200,h:100});if(angle%180===0)expect([f.w,f.h]).toEqual([200,100]);else expect([f.w,f.h]).toEqual([50,100]);expect(f.x+f.w/2).toBe(110);expect(f.y+f.h/2).toBe(70);}});
 it('invalid view dimensions/rotation are rejected',()=>{for(const args of [[0,2,0],[2,2,45],[2,Infinity,0],[2,2,NaN]])expect(()=>sourceFit(args[0],args[1],args[2],{x:0,y:0,w:1,h:1})).toThrow();});
 it('source layout uses only A3/A1 and preserves default legacy formats',()=>{expect(()=>validateExportFormat('drawing','A3','source-v9')).not.toThrow();expect(()=>validateExportFormat('drawing','A1','source-v9')).not.toThrow();expect(()=>validateExportFormat('drawing','A4','source-v9')).toThrow();expect(()=>validateExportFormat('drawing','A3','schedule-v1')).not.toThrow();});
});
