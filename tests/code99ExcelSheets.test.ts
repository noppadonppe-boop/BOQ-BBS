import {describe,it,expect,vi} from 'vitest';
import ExcelJS from 'exceljs';
import {blankMember,blankBar,currentStarterSpec,type SnapshotBundle,type Vec3} from '../src/domain/model';
import {schedule} from '../src/domain/engine';
import {appendCode99Sheets} from '../src/data/code99Excel';
vi.mock('../src/data/code99Canvas',()=>({code99Canvas:()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP9kAAAAASUVORK5CYII='}));

function fixture(count:number,legs=1){
 const members=Array.from({length:count},(_,i)=>{const m={...blankMember('Custom','M'+String(i+1).padStart(4,'0')),x:20000,y:20000,z:1000};m.bars=[{...blankBar('P1'),shape:'polyline',shapeCode:'99',diameter:12,outsideDiameter:12,radius:30,points:Array.from({length:legs+1},(_,i)=>[i*400,100,100] as Vec3),count:1}];return m;});
 const bundle={project:{id:'P',code:'QA',name:'Sheet capacity QA',spec:currentStarterSpec},members,attachments:[],stock:[],stockLedger:[],cutPlans:[],createdAt:'2026-10-13',status:'Frozen',version:1} as unknown as SnapshotBundle;
 return {bundle,items:members.map((member,i)=>({member,bar:schedule(member,currentStarterSpec)[0],quantity:1,sourceRow:i+4}))};
}
describe('Code99 Excel sheet rollover preserves every shape and physical vertex',()=>{
 it('splits201 drawing parts across sheets without omitting records and reuses identical images',async()=>{
  const {bundle,items}=fixture(201),w=new ExcelJS.Workbook();await appendCode99Sheets(w,bundle,items);
  expect(w.getWorksheet('Code99 Details')!.getImages()).toHaveLength(200);expect(w.getWorksheet('Code99 Details 2')!.getImages()).toHaveLength(1);
  const marks:string[]=[];for(const s of w.worksheets.filter(s=>s.name.startsWith('Code99 Details')))s.eachRow(r=>{if(typeof r.getCell(4).value==='number')marks.push(String(r.getCell(1).value));});
  expect(marks).toEqual(items.map(i=>i.member.code));expect(w.getWorksheet('Code99 Coordinates 2')).toBeUndefined();
  const ids=new Set(w.worksheets.flatMap(s=>s.getImages().map(i=>i.imageId)));expect(ids.size).toBe(1);
 });
 it('retains all8021 vertices when the coordinate limit starts a second sheet; blank bend data stays blank',async()=>{
  const {bundle,items}=fixture(617,12),w=new ExcelJS.Workbook();await appendCode99Sheets(w,bundle,items);
  const counts=w.worksheets.filter(s=>s.name.startsWith('Code99 Coordinates')).map(s=>{let n=0;s.eachRow(r=>{if(typeof r.getCell(4).value==='number')n++;});return n;});expect(counts).toEqual([7995,26]);
  const records:{member:string;vertex:string}[]=[];for(const s of w.worksheets.filter(s=>s.name.startsWith('Code99 Coordinates')))s.eachRow(r=>{if(typeof r.getCell(4).value==='number')records.push({member:String(r.getCell(1).value),vertex:String(r.getCell(3).value)});});
  expect(records).toHaveLength(8021);expect(records.at(-1)).toEqual({member:'M0617',vertex:'P12'});expect(w.worksheets.filter(s=>s.name.startsWith('Code99 Details'))).toHaveLength(7);
  const s=w.getWorksheet('Code99 Details')!;s.eachRow(r=>{if(typeof r.getCell(4).value==='number'){expect(r.getCell(6).value).toBeNull();expect(r.getCell(7).value).toBeNull();}});
 },15000);
});
