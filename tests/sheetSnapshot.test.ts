// PDF / SVG unchanged: the expanded sheet primitives of every fixture page must equal the snapshot taken before the
// semantic primitives (dim / leader / mtext) were introduced. Tolerance 1e-6; `layer` / `view` tags are metadata only.
// Re-create the snapshot (only when the drawing is meant to change): SNAP=1 npx vitest run tests/sheetSnapshot.test.ts
import {describe,expect,it,vi} from 'vitest';
vi.mock('../src/data/firebase',()=>({storage:{},db:{},command:async()=>({}),auth:{},emulator:true}));
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {drawSheet} from '../src/domain/bbsSheet';
import {drawSteelSheet,steelSheetPages} from '../src/domain/steelSheet';
import * as prims from '../src/domain/drawingPrims';
import {pagesOf,sheetFixtures,steelMember} from './fixtures/sheets';

const FILE='tests/__snapshots__/sheets.json.gz';
const expand=(list:unknown[])=>('expandPrims' in prims?(prims as unknown as {expandPrims:(p:unknown[])=>unknown[]}).expandPrims(list):list);
const strip=(v:unknown):unknown=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k,x])=>k!=='layer'&&k!=='view'&&x!==undefined).map(([k,x])=>[k,strip(x)])):typeof v==='number'?Math.round(v*1e7)/1e7:v;
function current(){
 const out:Record<string,unknown[]>={};
 for(const [name,sets] of Object.entries(sheetFixtures()))sets.forEach((s,k)=>{for(const p of pagesOf(s))out[`${name}#${k}/${p}`]=strip(expand(drawSheet(s,p))) as unknown[];});
 const st=steelMember();for(let p=0;p<steelSheetPages(st.member.steelInput!);p++)out[`steel/${p}`]=strip(expand(drawSteelSheet(st.member,st.project,{...st.opts,page:p}))) as unknown[];
 return out;
}
function same(a:unknown,b:unknown,path:string):string|undefined{
 if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=1e-6?undefined:`${path}: ${a} ≠ ${b}`;
 if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)return `${path}: length ${a.length} ≠ ${b.length}`;for(let i=0;i<a.length;i++){const d=same(a[i],b[i],`${path}[${i}]`);if(d)return d;}return;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();if(ka.join()!==kb.join())return `${path}: keys ${ka} ≠ ${kb}`;for(const k of ka){const d=same((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k],`${path}.${k}`);if(d)return d;}return;}
 return a===b?undefined:`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}
describe('sheet primitives unchanged (PDF / SVG)',()=>{
 const now=current();
 if(process.env.SNAP||!existsSync(FILE)){mkdirSync('tests/__snapshots__',{recursive:true});writeFileSync(FILE,gzipSync(JSON.stringify(now)));}
 const before=JSON.parse(gunzipSync(readFileSync(FILE)).toString()) as Record<string,unknown[]>;
 it('same pages',()=>expect(Object.keys(now).sort()).toEqual(Object.keys(before).sort()));
 for(const key of Object.keys(before))it(key,()=>{expect(now[key]?.length).toBeGreaterThan(10);expect(same(now[key],before[key],key)).toBeUndefined();});
});
