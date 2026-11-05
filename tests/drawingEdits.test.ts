// Drawing Edit (phase 1): stable keys on the automatic annotations, overrides (hide / move / text) and user text /
// leaders drawn by renderView into the same sheet primitives (SVG / PDF / DXF), schema + cleaning.
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {drawSheetInfo,type SheetData} from '../src/domain/bbsSheet';
import {expandPrims,type Prim} from '../src/domain/drawingPrims';
import {cleanDrawingEdits,drawingEditsSchema,type DrawingEdits} from '../src/domain/drawingEdits';
import {memberSchema} from '../src/domain/model';
import {buildBbsDxf} from '../src/data/dxf';
import {footingData,sheetFixtures} from './fixtures/sheets';

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

// ---- phase 2: user dimensions / levels / Mark leaders, anchors, snaps
import {concreteBox,lostAnchors,viewSnapPoints} from '../src/domain/elementViews';
describe('phase 2 · anchors and user annotations',()=>{
 const dimOf=(info:ReturnType<typeof drawSheetInfo>,id:string,view='V1')=>info.prims.filter(p=>p.key===`user:${id}`&&p.view===view&&p.t==='dim');
 const corners={version:1 as const,views:{plan:{objs:[{id:'d1',kind:'dim' as const,dir:'h' as const,off:-10,pts:[{u:0,v:0,eu:'min' as const,ev:'max' as const},{u:0,v:0,eu:'max' as const,ev:'max' as const}]}]}}};
 it('a dimension anchored on the concrete edges follows a resized member',()=>{
  for(const w of [2400,3000]){const s=footingData(w,2400),info=drawSheetInfo(withEdits(s,corners)),d=dimOf(info,'d1');
   expect(d).toHaveLength(1);if(d[0].t!=='dim')throw Error();const pv=plan(info),cb=concreteBox(pv.data!);expect(d[0].value).toBeCloseTo(cb.u1-cb.u0,6);expect(d[0].value).toBeCloseTo(w,0);}
 });
 it('chain: segments in order, off measured from the first point, text template',()=>{
  const s=footingData(2400,2400),e={version:1 as const,views:{plan:{objs:[{id:'d2',kind:'dim' as const,dir:'h' as const,off:6,text:'<> TYP.',pts:[{u:2400,v:0},{u:0,v:0},{u:1200,v:0}]}]}}};
  const info=drawSheetInfo(withEdits(s,e)),d=dimOf(info,'d2');expect(d.map(p=>p.t==='dim'?p.value:0)).toEqual([1200,1200]);
  if(d[0].t!=='dim')throw Error();expect(d[0].text).toBe('<> TYP.');expect(d[0].line[1]-d[0].a[1]).toBeCloseTo(6,6);
 });
 it('anchor on a bar that is gone: listed as lost, drawn red; present bar: not lost',()=>{
  const s=footingData(2400,2400),base=drawSheetInfo(s),bar=plan(base).data!.bars[0].row.id;
  const e={version:1 as const,views:{plan:{objs:[{id:'ok',kind:'dim' as const,dir:'h' as const,off:5,pts:[{u:0,v:0,bar},{u:500,v:0}]},{id:'bad',kind:'dim' as const,dir:'h' as const,off:9,pts:[{u:0,v:0,bar:'gen-nothing'},{u:500,v:0}]}]}}};
  const info=drawSheetInfo(withEdits(s,e)),pv=plan(info);
  expect(lostAnchors(pv.data!,e.views.plan)).toEqual(['bad']);
  const bad=dimOf(info,'bad')[0],ok=dimOf(info,'ok')[0];if(bad.t!=='dim'||ok.t!=='dim')throw Error();expect(bad.color).toBe('#c0262d');expect(ok.color).not.toBe('#c0262d');
 });
 it('level mark on a section shows the level from the member datum',()=>{
  expect(plan(drawSheetInfo(footingData(2400,2400))).data!.datum).toBeUndefined();
  const s=sheetFixtures().footing[0],sec='sec:def-x',base=drawSheetInfo(s),sv=base.views.find(v=>v.key===sec)!,cb=concreteBox(sv.data!);
  expect(sv.data!.datum).toBeTypeOf('number');
  const info=drawSheetInfo(withEdits(s,{version:1,views:{[sec]:{objs:[{id:'e1',kind:'level',at:{u:0,v:0,eu:'min',ev:'max'},dx:-8,label:'TOP'}]}}}));
  const t=info.prims.find(p=>p.key==='user:e1'&&p.t==='text');if(!t||t.t!=='text')throw Error('no level text');
  const z=sv.data!.datum!+cb.v1/1000;expect(t.text).toBe(`TOP ${z>0?'+':z<0?'−':'±'}${Math.abs(z).toFixed(3)}`);
 });
 it('Mark leader from a bar: text from the row (count / spacing), Mark block data for DXF',()=>{
  const s=footingData(2400,2400),pv=plan(drawSheetInfo(s)),b=pv.data!.bars.find(x=>x.dist)!;
  const info=drawSheetInfo(withEdits(s,{version:1,views:{plan:{objs:[{id:'m1',kind:'leader',at:[b.dist!.q[0],b.dist!.q[1]],dx:10,dy:-10,lines:['x'],arrow:'dot',bar:b.row.id,fromMark:true}]}}}));
  const l=info.prims.find(p=>p.key==='user:m1'&&p.view==='V1');if(!l||l.t!=='leader')throw Error();
  expect(l.text[0].startsWith(b.row.mark)).toBe(true);expect(l.text[0]).toContain(`${b.dist!.n}-`);expect(l.mark?.mark).toBe(b.row.mark);
 });
 it('snap points: concrete corners carry edge flags, bars carry their row id',()=>{
  const pv=plan(drawSheetInfo(footingData(2400,2400))),sn=viewSnapPoints(pv.data!);
  expect(sn.some(p=>p.kind==='corner'&&p.eu==='min'&&p.ev==='min')).toBe(true);expect(sn.some(p=>p.kind==='bar'&&p.bar)).toBe(true);
 });
 it('schema accepts dims / levels / Mark leaders; a dim needs 2 points',()=>{
  expect(drawingEditsSchema.safeParse(corners).success).toBe(true);
  expect(drawingEditsSchema.safeParse({version:1,views:{plan:{objs:[{id:'d',kind:'dim',dir:'h',off:0,pts:[{u:0,v:0}]}]}}}).success).toBe(false);
  expect(drawingEditsSchema.safeParse({version:1,views:{'sec:def-x':{objs:[{id:'e',kind:'level',at:{u:0,v:10},dx:5,label:'EL.'}]}}}).success).toBe(true);
  expect(cleanDrawingEdits(corners)).toEqual(corners);
 });
});

// ---- phase 3: Detail views, ISO 3D, stepped sections; detailer role
import {buildView} from '../src/domain/elementViews';
import {sectionSpec} from '../src/domain/sheetLayout';
import {clipPrims} from '../src/domain/primClip';
import {projectRoles} from '../src/domain/projectAccess';
import {drawingViewsSchema} from '../src/domain/drawingViews';
import type {SheetLayout} from '../src/domain/sheetLayoutSchema';
describe('phase 3 · Detail / ISO / stepped section',()=>{
 const box=(view:string,x:number,y:number,w:number,h:number,n:number|'auto'='auto')=>({view,x,y,w,h,n});
 const withLayout=(s:SheetData,edits:DrawingEdits|undefined,views:ReturnType<typeof box>[]):SheetData=>({...s,member:{...s.member,drawingEdits:edits,sheetLayout:{version:1,unplaced:[],sheets:[{id:'s1',views}]} as SheetLayout}});
 it('clipPrims cuts a line to a circle and keeps only points inside',()=>{
  const out=clipPrims([{t:'line',x1:-10,y1:0,x2:10,y2:0,stroke:'#000',width:1},{t:'circle',cx:20,cy:0,r:1,fill:'#000'},{t:'text',x:0,y:0,text:'a',size:2}],{kind:'circle',cx:0,cy:0,r:5});
  const l=out.find(p=>p.t==='line');if(!l||l.t!=='line')throw Error();expect(l.x1).toBeCloseTo(-5,6);expect(l.x2).toBeCloseTo(5,6);
  expect(out.some(p=>p.t==='circle')).toBe(false);expect(out.some(p=>p.t==='text')).toBe(true);
 });
 it('Detail view: drawn inside its circle at its own scale; the parent view gets the detail mark',()=>{
  const s=footingData(2400,2400),e:DrawingEdits={version:1,views:{},details:[{id:'a',label:'D1',parent:'plan',u:1200,v:1200,r:400}]};
  const d=withLayout(s,e,[box('plan',30,30,170,120,40),box('det:a',210,30,120,120,10)]),info=drawSheetInfo(d),dv=info.views.find(v=>v.key==='det:a')!,pv=plan(info);
  expect(dv.title).toBe('DETAIL D1');expect(dv.n).toBe(10);
  const cx=dv.origin.sheet[0]+(1200-dv.origin.model[0])*dv.s,cy=dv.origin.sheet[1]-(1200-dv.origin.model[1])*dv.s,r=400*dv.s;
  const pts=expandPrims(info.prims.filter(p=>p.view===dv.id&&!p.key)).flatMap(p=>p.t==='line'?[[p.x1,p.y1],[p.x2,p.y2]]:[]);
  expect(pts.length).toBeGreaterThan(4);expect(pts.every(([x,y])=>Math.hypot(x-cx,y-cy)<=r+.6)).toBe(true);
  expect(expandPrims(info.prims.filter(p=>p.view===pv.id)).some(p=>p.t==='text'&&p.text==='D1')).toBe(true);
  // automatic sheet (no layout): unchanged by the detail definition
  expect(expandPrims(drawSheetInfo({...s,member:{...s.member,drawingEdits:e}}).prims)).toEqual(expandPrims(drawSheetInfo(s).prims));
 });
 it('ISO 3D view: concrete edges and bar lines, no chained dims',()=>{
  const s=footingData(2400,2400),info=drawSheetInfo(withLayout(s,undefined,[box('plan',30,30,170,120),box('iso',210,30,120,110)])),iv=info.views.find(v=>v.key==='iso')!;
  const ps=info.prims.filter(p=>p.view===iv.id);expect(ps.some(p=>p.layer==='concrete')).toBe(true);expect(ps.some(p=>p.layer==='barMain'||p.layer==='barLink')).toBe(true);expect(ps.some(p=>p.t==='dim')).toBe(false);
 });
 it('stepped section: pieces at two cuts, step line, schema',()=>{
  const s=footingData(2400,2400),sec={id:'u1',label:'A-A',axis:'Y' as const,position:600,source:'user' as const,steps:[{from:1200,position:1800}]};
  expect(drawingViewsSchema.safeParse({version:2,primaryPlane:'XY',basis:'t',sections:[sec]}).success).toBe(true);
  const st=buildView(s.member,s.rows,s.input,sectionSpec(sec)),flat=buildView(s.member,s.rows,s.input,sectionSpec({...sec,steps:undefined}));
  expect(st.stepAt).toEqual([1200]);expect(st.cropped).toBe(true);expect(st.u[0]).toBeCloseTo(flat.u[0],0);
  expect(sectionSpec(sec).steps).toEqual([{from:1200,cut:1800}]);
 });
 it('detail schema: label / parent rules; detailer is a project role',()=>{
  expect(drawingEditsSchema.safeParse({version:1,views:{},details:[{id:'a',label:'D1',parent:'det:x',u:0,v:0,r:100}]}).success).toBe(false);
  expect(drawingEditsSchema.safeParse({version:1,views:{},details:[{id:'a',label:'D1',parent:'plan',u:0,v:0,r:100},{id:'b',label:'d1',parent:'plan',u:0,v:0,r:100}]}).success).toBe(false);
  expect(cleanDrawingEdits({version:1,views:{},details:[{id:'a',label:'D1',parent:'plan',u:0,v:0,r:100}]})?.details).toHaveLength(1);
  expect(projectRoles).toContain('detailer');
 });
});
