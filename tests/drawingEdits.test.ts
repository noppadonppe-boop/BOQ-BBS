// Drawing Edit (phase 1): stable keys on the automatic annotations, overrides (hide / move / text) and user text /
// leaders drawn by renderView into the same sheet primitives (SVG / PDF / DXF), schema + cleaning.
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {drawSheetInfo,type SheetData} from '../src/domain/bbsSheet';
import {expandPrims,type Prim} from '../src/domain/drawingPrims';
import {cleanDrawingEdits,drawingEditsSchema,type DrawingEdits} from '../src/domain/drawingEdits';
import {memberSchema} from '../src/domain/model';
import {buildBbsDxf} from '../src/data/dxf';
import {footingData} from './fixtures/sheets';

const withEdits=(s:SheetData,e:DrawingEdits):SheetData=>({...s,member:{...s.member,drawingEdits:e}});
const keyed=(ps:Prim[])=>[...new Set(ps.map(p=>p.key).filter(Boolean))] as string[];
const plan=(i:ReturnType<typeof drawSheetInfo>)=>i.views.find(v=>v.key==='plan')!;
const ofKey=(ps:Prim[],key:string,view='V1')=>ps.filter(p=>p.key===key&&p.view===view);

describe('stable annotation keys',()=>{
 const s=footingData(2400,2400),info=drawSheetInfo(s),keys=keyed(info.prims);
 it('Mark leaders and dimension chains carry keys; the same keys come back on a second draw',()=>{
  expect(keys.some(k=>k.startsWith('mark:'))).toBe(true);expect(keys.some(k=>k.startsWith('dim:'))).toBe(true);
  expect(keyed(drawSheetInfo(s).prims)).toEqual(keys);
 });
 it('expandPrims passes the key on to the drawing of a semantic primitive',()=>{
  const mark=info.prims.find(p=>p.t==='leader'&&p.key)!;expect(expandPrims([mark]).every(p=>p.key===mark.key)).toBe(true);
 });
});

describe('overrides',()=>{
 const s=footingData(2400,2400),base=drawSheetInfo(s),pv=plan(base),V=pv.id,markKey=keyed(base.prims.filter(p=>p.view===pv.id)).find(k=>k.startsWith('mark:'))!;
 const dimKey=keyed(base.prims.filter(p=>p.view===pv.id)).find(k=>k.startsWith('dim:h'))!;
 it('hidden Mark leader is not drawn; the rest of the view stays',()=>{
  const e=drawSheetInfo(withEdits(s,{version:1,views:{plan:{over:{[markKey]:{hidden:true}}}}}));
  expect(ofKey(e.prims,markKey,V)).toHaveLength(0);expect(e.prims.length).toBeLessThan(base.prims.length);
 });
 it('moved Mark: text and elbow move by (dx, dy), the arrow stays on the bar',()=>{
  const e=drawSheetInfo(withEdits(s,{version:1,views:{plan:{over:{[markKey]:{dx:12,dy:-5}}}}}));
  const a=ofKey(base.prims,markKey,V)[0],b=ofKey(e.prims,markKey,V)[0];
  if(a.t!=='leader'||b.t!=='leader')throw Error('leader expected');
  expect(b.pts[0]).toEqual(a.pts[0]);expect(b.at[0]-a.at[0]).toBeCloseTo(12,6);expect(b.at[1]-a.at[1]).toBeCloseTo(-5,6);
 });
 it('own Mark text replaces the label (several lines) and drops the Mark block data',()=>{
  const e=drawSheetInfo(withEdits(s,{version:1,views:{plan:{over:{[markKey]:{text:'F01 (TYP.)\nดูรูปตัด'}}}}}));
  const b=ofKey(e.prims,markKey,V)[0];if(b.t!=='leader')throw Error();
  expect(b.text).toEqual(['F01 (TYP.)','ดูรูปตัด']);expect(b.mark).toBeUndefined();
  expect(expandPrims([b]).filter(p=>p.t==='text').map(p=>p.t==='text'?p.text:'')).toEqual(['F01 (TYP.)','ดูรูปตัด']);
 });
 it('dimension chain: line moved by off, text template with <>',()=>{
  const e=drawSheetInfo(withEdits(s,{version:1,views:{plan:{over:{[dimKey]:{off:-6,text:'<> (TYP.)'}}}}}));
  const a=ofKey(base.prims,dimKey,V),b=ofKey(e.prims,dimKey,V);expect(b).toHaveLength(a.length);
  const d0=a[0],d1=b[0];if(d0.t!=='dim'||d1.t!=='dim')throw Error();
  expect(d1.line[1]-d0.line[1]).toBeCloseTo(-6,6);expect(d1.a).toEqual(d0.a);expect(d1.text).toBe('<> (TYP.)');
  expect(expandPrims(b).some(p=>p.t==='text'&&p.text.endsWith('(TYP.)'))).toBe(true);
 });
 it('unknown keys are ignored (stale override after a model change)',()=>{
  const e=drawSheetInfo(withEdits(s,{version:1,views:{plan:{over:{'mark:gone':{hidden:true}}}}}));
  expect(expandPrims(e.prims)).toEqual(expandPrims(base.prims));
 });
});

describe('user objects',()=>{
 const s=footingData(2400,2400),base=drawSheetInfo(s),pv=plan(base);
 const toSheet=(u:number,v:number)=>[pv.origin.sheet[0]+(u-pv.origin.model[0])*pv.s,pv.origin.sheet[1]-(v-pv.origin.model[1])*pv.s];
 const e:DrawingEdits={version:1,views:{plan:{objs:[{id:'t1',kind:'text',at:[600,1800],lines:['หมายเหตุ','บรรทัด 2']},{id:'l1',kind:'leader',at:[1200,1200],dx:15,dy:-10,lines:['C.J.'],arrow:'closed'}]}}};
 const info=drawSheetInfo(withEdits(s,e));
 it('text = MTEXT at the view point; leader arrow at the view point, text at the paper offset',()=>{
  const t=ofKey(info.prims,'user:t1',pv.id)[0],l=ofKey(info.prims,'user:l1',pv.id)[0];
  if(t.t!=='mtext'||l.t!=='leader')throw Error();
  const [x,y]=toSheet(600,1800);expect(t.x).toBeCloseTo(x,6);expect(t.y).toBeCloseTo(y,6);expect(t.lines).toEqual(['หมายเหตุ','บรรทัด 2']);
  const [ax,ay]=toSheet(1200,1200);expect(l.pts[0][0]).toBeCloseTo(ax,6);expect(l.pts[0][1]).toBeCloseTo(ay,6);expect(l.pts[1][0]-ax).toBeCloseTo(15,6);
  expect(t.view).toBe(pv.id);expect(t.layer).toBe('text');expect(l.layer).toBe('mark');
 });
 it('DXF carries the user objects as MTEXT / LEADER',()=>{
  const {text}=buildBbsDxf([{prims:info.prims,views:info.views,w:info.w,h:info.h,size:info.size}],{mode:'A'});
  expect(text).toContain('หมายเหตุ');expect(text).toContain('C.J.');
 });
});

describe('schema',()=>{
 it('valid edits pass the member schema; bad keys / duplicate ids fail',()=>{
  const s=footingData(2400,2400),e:DrawingEdits={version:1,views:{plan:{over:{'mark:gen-bottom-x':{dx:3}},objs:[{id:'a',kind:'text',at:[0,0],lines:['x']}]}}};
  expect(memberSchema.safeParse({...s.member,drawingEdits:e}).success).toBe(true);
  expect(drawingEditsSchema.safeParse({version:1,views:{plan:{over:{'bogus':{hidden:true}}}}}).success).toBe(false);
  expect(drawingEditsSchema.safeParse({version:1,views:{plan:{objs:[{id:'a',kind:'text',at:[0,0],lines:['x']},{id:'a',kind:'text',at:[1,1],lines:['y']}]}}}).success).toBe(false);
 });
 it('cleanDrawingEdits drops empty overrides / text and returns undefined when nothing is left',()=>{
  expect(cleanDrawingEdits({version:1,views:{plan:{over:{'mark:a':{dx:0}},objs:[{id:'a',kind:'text',at:[0,0],lines:['  ']}]}}})).toBeUndefined();
  expect(cleanDrawingEdits({version:1,views:{plan:{over:{'mark:a':{dx:2,dy:0}}}}})).toEqual({version:1,views:{plan:{over:{'mark:a':{dx:2}}}}});
 });
});
