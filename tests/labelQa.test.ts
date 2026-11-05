// Mark label check (src/domain/labelQa.ts): rules on hand-made leaders + the fixture sheets (drawing unchanged).
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {drawSheetInfo} from '../src/domain/bbsSheet';
import type {LeaderPrim,Prim} from '../src/domain/drawingPrims';
import {defaultLabelRules,labelIssues,labelReport} from '../src/domain/labelQa';
import {cadStandardOf,defaultCadStandard,labelRulesOf} from '../src/domain/cadStandard';
import {pagesOf,sheetFixtures} from './fixtures/sheets';

const view={id:'v1',title:'แปลน',box:{x:0,y:0,w:200,h:150}};
const L=(mark:string,from:[number,number],at:[number,number]):LeaderPrim=>({t:'leader',pts:[from,[at[0],at[1]-1]],text:[mark],at,arrow:'dot',size:2.6,mark:{mark},view:'v1',layer:'mark',draw:[]});
const kinds=(p:Prim[])=>labelIssues(p,[view]).map(i=>i.kind).sort();

describe('label rules',()=>{
 it('clean labels pass',()=>expect(kinds([L('F01',[10,10],[30,20]),L('F02',[10,40],[30,50])])).toEqual([]));
 it('overlap / tight',()=>{
  expect(kinds([L('F01',[10,10],[30,20]),L('F02',[12,12],[32,21])])).toContain('overlap');
  expect(kinds([L('F01',[10,10],[30,20]),L('F02',[10,30],[30,23])])).toEqual(['tight']);});
 it('crossing leaders',()=>expect(kinds([L('F01',[10,10],[60,60]),L('F02',[60,10],[10,60])])).toContain('cross'));
 it('on a dimension text / on a bar line',()=>{
  const dim:Prim={t:'text',x:31,y:20,text:'2,400',size:2.6,view:'v1',layer:'dim'},bar:Prim={t:'line',x1:0,y1:19,x2:100,y2:19,stroke:'#000',width:.5,view:'v1',layer:'barMain'};
  expect(kinds([L('F01',[10,10],[30,20]),dim])).toEqual(['onText']);
  expect(kinds([L('F01',[10,10],[30,20]),bar])).toEqual(['onLine']);
  expect(labelIssues([L('F01',[10,10],[30,20]),bar],[view],{...defaultLabelRules,lines:false})).toEqual([]);});
 it('outside the view / long leader',()=>{
  expect(kinds([L('F01',[170,10],[198,20])])).toEqual(['outside']);
  expect(kinds([L('F01',[5,5],[120,100])])).toEqual(['long']);});
 it('switched off',()=>expect(labelIssues([L('F01',[10,10],[30,20]),L('F02',[12,12],[32,21])],[view],{...defaultLabelRules,enabled:false})).toEqual([]));
});
describe('fixture sheets',()=>{
 const f=sheetFixtures();
 it('footing sheet: no high issue',()=>{const i=drawSheetInfo(f.footing[0],0),r=labelReport(i.prims,i.views);expect(r.length).toBeGreaterThan(0);expect(r.reduce((n,x)=>n+x.high,0)).toBe(0);});
 it('beam group sheet: crossing leaders found per view',()=>{const s=f.beam[0],i=drawSheetInfo(s,pagesOf(s)[0]),r=labelReport(i.prims,i.views);
  expect(r.some(x=>(x.count.cross||0)>0)).toBe(true);for(const x of r)expect(x.issues.every(q=>q.view===x.view)).toBe(true);});
 it('rules from the CAD standard (a standard saved before keeps parsing)',()=>{
  const old=defaultCadStandard();expect(cadStandardOf({cadStandard:old})).toEqual(old);
  expect(labelRulesOf({cadStandard:{...old,labelQa:{enabled:true,minGap:2,maxLeader:40,lines:false}}})).toEqual({enabled:true,minGap:2,maxLeader:40,lines:false});
  expect(labelRulesOf({})).toEqual(defaultLabelRules);});
});
