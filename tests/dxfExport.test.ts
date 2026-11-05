// DXF 2018 export: handles / owners, entity counts, UTF-8 text, dimension values (B / C true size, A × DIMLFAC) and
// viewport scales (B). Writes every fixture × mode to output/dxf-verification/ for tools/qa/dxf_audit.py (ezdxf).
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {mkdirSync,writeFileSync} from 'node:fs';
import {drawSheetInfo} from '../src/domain/bbsSheet';
import {drawSteelSheet,steelSheetPages,STEEL_SHEET} from '../src/domain/steelSheet';
import {buildBbsDxf,type DxfMode,type DxfSheet} from '../src/data/dxf';
import {defaultCadStandard} from '../src/domain/cadStandard';
import {pagesOf,sheetFixtures,steelMember} from './fixtures/sheets';

const OUT='output/dxf-verification';
type Ent={type:string;pairs:[number,string][]};
/** group-code pairs → entities (every 0 record) */
function records(text:string):Ent[]{
 const l=text.split('\r\n'),out:Ent[]=[];let cur:Ent|undefined;
 for(let i=0;i+1<l.length;i+=2){const c=Number(l[i]),v=l[i+1];if(c===0){cur={type:v,pairs:[]};out.push(cur);}else cur?.pairs.push([c,v]);}
 return out;
}
const get=(e:Ent,c:number)=>e.pairs.find(p=>p[0]===c)?.[1];
function sheetsOf(name:string):DxfSheet[]{
 if(name==='steel'){const st=steelMember();return Array.from({length:steelSheetPages(st.member.steelInput!)},(_,p)=>({prims:drawSteelSheet(st.member,st.project,{...st.opts,page:p}),views:[],w:STEEL_SHEET.w,h:STEEL_SHEET.h,size:'A3'}));}
 return sheetFixtures()[name].flatMap(s=>pagesOf(s).map(p=>{const i=drawSheetInfo(s,p);return {prims:i.prims,views:i.views,w:i.w,h:i.h,size:i.size};}));
}
const names=['footing','footingSplit','column','beam','custom','steel'];
const modes:DxfMode[]=['B','C','A'];
mkdirSync(OUT,{recursive:true});

describe('DXF 2018 writer',()=>{
 for(const name of names)for(const mode of modes)it(`${name} · ${mode}`,()=>{
  const sheets=sheetsOf(name),{text,summary}=buildBbsDxf(sheets,{mode,cad:defaultCadStandard()});
  writeFileSync(`${OUT}/${name}-${mode}.dxf`,text);
  expect(text.startsWith('0\r\nSECTION\r\n2\r\nHEADER')).toBe(true);expect(text).toContain('AC1032');expect(text.trimEnd().endsWith('EOF')).toBe(true);
  const recs=records(text);
  // handles unique; every owner (330) and pointer (340 / 350 / 390) exists
  const handles=new Map<string,string>();
  for(const r of recs){if(r.type==='SECTION')continue;const h=get(r,5)??get(r,105);if(!h)continue;expect(handles.has(h),`duplicate handle ${h}`).toBe(false);handles.set(h,r.type);}
  for(const r of recs)for(const [c,v] of r.pairs)if((c===330||c===340||c===350||c===390||c===331)&&v!=='0')expect(handles.has(v),`${r.type} ${c}=${v}`).toBe(true);
  const seed=parseInt(text.match(/\$HANDSEED\r\n5\r\n([0-9A-F]+)/)![1],16);expect(Math.max(...[...handles.keys()].map(h=>parseInt(h,16)))).toBeLessThan(seed);
  // layouts / viewports
  const layouts=recs.filter(r=>r.type==='LAYOUT');
  expect(layouts.length).toBe(mode==='B'?sheets.length+1:2);expect(summary.layouts).toBe(mode==='B'?sheets.length:0);
  // dimensions: B / C model dims measure the real value; A (and NTS) through DIMLFAC
  const styles=new Map(recs.filter(r=>r.type==='DIMSTYLE').map(r=>[get(r,2)!,{scale:Number(get(r,40)),lfac:Number(get(r,144))}]));
  const dims=recs.filter(r=>r.type==='DIMENSION'),semantic=sheets.flatMap(s=>s.prims).filter(p=>p.t==='dim');
  expect(dims.length).toBe(semantic.length);
  if(name!=='steel')expect(dims.length).toBeGreaterThan(3);
  // order differs between ENTITIES and blocks (mode C view blocks): compare sorted values
  const want=semantic.map(p=>p.t==='dim'?p.value:0).sort((x,y)=>x-y),got:number[]=[];
  for(const d of dims){const name=get(d,3)!,st=styles.get(name)!,a=[Number(get(d,13)),Number(get(d,23))],b=[Number(get(d,14)),Number(get(d,24))],len=Number(get(d,50))===90?Math.abs(b[1]-a[1]):Math.abs(b[0]-a[0]);
   if(mode!=='A'&&!name.startsWith('BBS-DIM-NTS'))expect(st.lfac,name).toBe(1);
   got.push(len*st.lfac);}
  got.sort((x,y)=>x-y);got.forEach((v,i)=>expect(v).toBeCloseTo(want[i],3));
  if(mode==='B'){const vps=recs.filter(r=>r.type==='VIEWPORT'&&get(r,69)!=='1');expect(vps.length).toBe(summary.viewports);
   const ns=sheets.flatMap(s=>s.views.filter(v=>v.n&&s.prims.some(p=>p.view===v.id)).map(v=>v.n));expect(vps.length).toBe(ns.length);
   vps.forEach((v,i)=>expect(Number(get(v,45))/Number(get(v,41))).toBeCloseTo(ns[i],6));}
  // leaders bound to Mark block inserts; entity counts as reported
  const leaders=recs.filter(r=>r.type==='LEADER');expect(leaders.length).toBe(summary.leaders);
  for(const l of leaders)if(get(l,73)==='2')expect(handles.get(get(l,340)!)).toBe('INSERT');
  expect(recs.filter(r=>r.type==='MTEXT').length).toBe(summary.mtext+dims.length);
  for(const [type,n] of Object.entries(summary.entities))expect(recs.filter(r=>r.type===type).length,type).toBeGreaterThanOrEqual(n);
  // every entity ByLayer: no colour / linetype / lineweight of its own outside the tables
  const kinds=new Set(['LINE','LWPOLYLINE','CIRCLE','ELLIPSE','HATCH','TEXT','MTEXT','INSERT','ATTRIB','DIMENSION','LEADER','VIEWPORT','SOLID','POINT']);
  for(const r of recs)if(kinds.has(r.type))expect(r.pairs.some(([c])=>c===62||c===6||c===370),r.type).toBe(false);
  // Thai / Chinese text as UTF-8, no \U+ escapes
  expect(text).not.toMatch(/\\U\+[0-9A-F]{4}/);
  if(name!=='steel')expect(text).toContain('ทดสอบ');
 });
 it('mark / dimension switches fall back to the drawn lines',()=>{
  const sheets=sheetsOf('footing'),{text,summary}=buildBbsDxf(sheets,{mode:'A',edit:{dims:false,leaders:false,mtext:false}});
  expect(summary.dims).toBe(0);expect(summary.leaders).toBe(0);expect(summary.mtext).toBe(0);expect(text).not.toContain('\r\nDIMENSION\r\n');
 });
});
