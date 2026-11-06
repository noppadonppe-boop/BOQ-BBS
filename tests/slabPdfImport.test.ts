// S4b part 1 (docs/SLAB_FLOOR.md “Import from PDF”): vector PDF → floor without AI — pseudo-layers (OCG, else colour /
// width / dash) and their guessed roles, text from getTextContent (also on a page turned 90°), the same rules as DXF → the same
// floor as the DXF import / the hand floor.
import {describe,expect,it} from 'vitest';
import DxfParser from 'dxf-parser';
import {docToFloor,docToMm,dxfDoc,type CadDoc} from '../src/domain/cadEntities';
import {PAGE_T,readPdf} from './fixtures/pdfRead';
import {applyProposal,defaultPicks,guessLayerRoles,guessPdfRoles,proposalDiff,readFloorPlan,type FloorProposal} from '../src/domain/slabPlanImport';
import {newSlabFloor,type Floor} from '../src/domain/slabFloor';
import {handFloor,pdfLayerName,slabPlanDxf,slabPlanPdf,slabPlanRawPdf} from './fixtures/slabPlan';

const pt=(mm:number)=>mm*72/25.4;
const SRC={kind:'pdf' as const,attachmentId:'pdf1',page:1};
const strip=(f:Floor)=>{const {underlay:_u,importMap:_i,...rest}=f;return {...rest,columns:(rest.columns||[]).map(({id:_id,...c})=>c)};};
function importPdf(d:CadDoc,roles=guessPdfRoles(d)){
 const base=newSlabFloor(),p=readFloorPlan(docToFloor(d,PAGE_T),roles,{source:SRC,floor:base,round:5});
 return {p,roles,...applyProposal(base,p,defaultPicks(proposalDiff(base,p)))};
}
const shape=(p:FloorProposal)=>({grids:p.grids.map(g=>[g.axis,g.label,g.at]),beams:p.beams.map(b=>`${b.along}${b.line} ${b.from}-${b.to} ${b.mark} ${b.width}x${b.depth} ${b.offset}`),
 columns:p.columns.map(c=>`${c.x}/${c.y} ${c.sx}x${c.sy}`),openings:p.openings.map(o=>[o.label,o.shape,o.x,o.y,o.w,o.h]),marks:p.panelMarks.map(m=>m.mark).sort()});

describe('S4b PDF vector import (no AI)',()=>{
 it('colour plot (jsPDF): pseudo-layers by colour / width / dash, roles guessed, floor = DXF import = hand floor',async()=>{
  const d=await readPdf(slabPlanPdf());
  const names=d.layers.filter(l=>l.count).map(l=>l.name);
  for(const l of ['S-GRID','S-GRID-BUBBLE','S-COL','S-BEAM','S-OPENING','S-SLAB'])expect(names).toContain(pdfLayerName(l));
  expect(names).toContain('TEXT');
  const {p,roles,floor}=importPdf(d);
  expect(roles).toMatchObject({grid:[pdfLayerName('S-GRID')],gridLabel:[pdfLayerName('S-GRID-BUBBLE')],column:[pdfLayerName('S-COL')],beam:[pdfLayerName('S-BEAM')],opening:[pdfLayerName('S-OPENING')],text:['TEXT']});
  const dx=dxfDoc(new DxfParser().parseSync(slabPlanDxf())),q=readFloorPlan(docToMm(dx,'mm'),guessLayerRoles(dx.layers),{source:{kind:'dxf',attachmentId:'d'},floor:newSlabFloor()});
  expect(shape(p)).toEqual(shape(q));
  expect(p.warnings).toEqual([]);
  expect(strip(floor)).toEqual(strip(handFloor()));
 },60000);
 it('optional-content layers (OCG) name the pseudo-layers; roles from the layer names; same floor',async()=>{
  const d=await readPdf(slabPlanRawPdf({ocg:true}));
  expect(d.layers.filter(l=>l.count).map(l=>l.name)).toEqual(expect.arrayContaining(['S-GRID','S-GRID-BUBBLE','S-COL','S-BEAM','S-OPENING','S-SLAB','TEXT']));
  const {roles,floor}=importPdf(d);
  expect(roles).toMatchObject({grid:['S-GRID'],gridLabel:['S-GRID-BUBBLE'],column:['S-COL'],beam:['S-BEAM'],opening:['S-OPENING']});
  expect(strip(floor)).toEqual(strip(handFloor()));
 },60000);
 it('no layers (hand-written PDF, styles only) → the same pseudo-layers and guesses as the colour plot',async()=>{
  const d=await readPdf(slabPlanRawPdf());
  const {roles,floor}=importPdf(d);
  expect(roles.grid).toEqual([pdfLayerName('S-GRID')]);expect(roles.beam).toEqual([pdfLayerName('S-BEAM')]);expect(roles.column).toEqual([pdfLayerName('S-COL')]);
  expect(strip(floor)).toEqual(strip(handFloor()));
 },60000);
 it('page turned 90° (/Rotate): texts stay at their page-space positions next to the lines; import unchanged',async()=>{
  const a=await readPdf(slabPlanRawPdf()),b=await readPdf(slabPlanRawPdf({rotate:90}));
  const t=(d:CadDoc,s:string)=>d.ents.find(e=>e.k==='text'&&e.text===s) as Extract<CadDoc['ents'][number],{k:'text'}>;
  for(const s of ['B1 (300x600)','S2 (t=120)','OP-1','A','3']){const x=t(a,s),y=t(b,s);expect(y.at[0]).toBeCloseTo(x.at[0],3);expect(y.at[1]).toBeCloseTo(x.at[1],3);expect(y.rot).toBeCloseTo(x.rot,6);}
  // the grid bubble A sits on grid line A (60 mm on the page) — text centre within 1 mm of it
  const A=t(b,'A');expect(Math.abs(A.at[0]+(A.w||0)/2-pt(60))).toBeLessThan(pt(1));
  expect(strip(importPdf(b).floor)).toEqual(strip(handFloor()));
 },60000);
});
