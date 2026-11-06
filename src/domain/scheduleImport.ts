// S4b: slab / beam schedules (ตารางพื้น / ตารางคาน) from a drawing window → Slab / Beam Template proposals. Rules read a ruled
// table (axis-parallel lines + texts in the cells); the AI (task slabPlan, part schedule) answers rows of the same form. The
// header words pick the columns. Templates go to the project spec only through the spec-change job (before / after kept).
import {DEFAULT_SLAB_REBAR,type TopExtra} from './slabFloorSchema';
import {entSegments,type CadEnt} from './cadEntities';
import {mergeByName,type SlabTemplate} from './slabWallTemplates';
import {beamRebarFromSections,parseBarText,parseSpacingText,type BeamTemplate} from './beamTemplates';
import type {Spec} from './model';

export type TableRead={header:string[];rows:string[][]};
/** Ruled table inside the entities (source or mm units — any): row / column lines = axis-parallel segments spanning ≥ 50 % of
 * the table; texts go to the cell holding their centre (reading order within a cell). Undefined when there is no grid of
 * lines (≥ 3 row lines, ≥ 2 column lines) — then the AI reads it. First row = header. */
export function readRuledTable(ents:CadEnt[]):TableRead|undefined{
 const segs=ents.filter(e=>e.k==='line'||e.k==='poly').flatMap(e=>entSegments(e,[]));
 const hs=segs.filter(s=>Math.abs(s[3]-s[1])<1e-6*Math.max(1,Math.abs(s[2]-s[0]))&&Math.abs(s[2]-s[0])>0),vs=segs.filter(s=>Math.abs(s[2]-s[0])<1e-6*Math.max(1,Math.abs(s[3]-s[1]))&&Math.abs(s[3]-s[1])>0);
 if(!hs.length||!vs.length)return;
 const x0=Math.min(...hs.map(s=>Math.min(s[0],s[2]))),x1=Math.max(...hs.map(s=>Math.max(s[0],s[2]))),y0=Math.min(...vs.map(s=>Math.min(s[1],s[3]))),y1=Math.max(...vs.map(s=>Math.max(s[1],s[3])));
 const W=x1-x0,H=y1-y0,tol=Math.max(W,H)*1e-3;
 const uniq=(v:number[])=>{const out:number[]=[];for(const x of v.sort((a,b)=>a-b))if(!out.length||x-out.at(-1)!>tol)out.push(x);return out;};
 const ys=uniq(hs.filter(s=>Math.abs(s[2]-s[0])>=W*0.5).map(s=>s[1])).sort((a,b)=>b-a),xs=uniq(vs.filter(s=>Math.abs(s[3]-s[1])>=H*0.5).map(s=>s[0]));
 if(ys.length<3||xs.length<2)return;
 const cells:{t:string;x:number;y:number}[][][]=Array.from({length:ys.length-1},()=>Array.from({length:xs.length-1},()=>[]));
 for(const e of ents){if(e.k!=='text')continue;const w=e.w??0.7*e.size*e.text.length,c=[e.at[0]+Math.cos(e.rot)*w/2,e.at[1]+e.size/2];
  const r=ys.findIndex((y,i)=>i+1<ys.length&&c[1]<=y&&c[1]>=ys[i+1]),k=xs.findIndex((x,i)=>i+1<xs.length&&c[0]>=x&&c[0]<=xs[i+1]);
  if(r>=0&&k>=0)cells[r][k].push({t:e.text,x:e.at[0],y:e.at[1]});}
 const text=(l:{t:string;x:number;y:number}[])=>l.sort((a,b)=>b.y-a.y||a.x-b.x).map(x=>x.t).join(' ').replace(/\s+/g,' ').trim();
 const rows=cells.map(r=>r.map(text)).filter(r=>r.some(Boolean));
 return rows.length>=2?{header:rows[0],rows:rows.slice(1)}:undefined;
}
const col=(header:string[],re:RegExp,not?:RegExp)=>header.findIndex(h=>re.test(h.toUpperCase())&&!(not&&not.test(h.toUpperCase())));
const bar=(s:string|undefined)=>{const t=(s||'').trim();if(!t||/^[-–—]+$|^NONE$|^ไม่มี$/i.test(t))return {diameter:12,spacing:0};const b=parseSpacingText(t);return b?{diameter:b.diameter,spacing:b.spacing}:undefined;};
const mmOf=(s:string|undefined)=>{const m=(s||'').toUpperCase().match(/(\d{2,4})/);return m?Number(m[1]):undefined;};
const idOf=(prefix:string,name:string)=>`${prefix}-${name.replace(/[^A-Za-z0-9_-]/g,'').slice(0,30)||'x'}`;
/** Slab schedule rows → Slab Templates (columns by header: MARK, THICK / t, SHORT / LONG × BOT / TOP (B1 B2 T1 T2), EXTRA TOP,
 * TYPE with SOG / on ground). Extra top “DB12@200 L/4” | “… L/3” | “… 1000” (fixed from the beam face). */
export function slabTemplatesFromTable(t:TableRead,source=''):{templates:SlabTemplate[];warnings:string[]}{
 const h=t.header,warnings:string[]=[];
 const c={mark:Math.max(0,col(h,/MARK|เบอร์|SLAB|^TYPE$/)),thick:col(h,/THICK|หนา|^T\b|DEPTH/),sb:col(h,/SHORT.*B(OT)?|ล่าง.*สั้น|สั้น.*ล่าง|^B1$/),lb:col(h,/LONG.*B(OT)?|ล่าง.*ยาว|ยาว.*ล่าง|^B2$/),
  st:col(h,/SHORT.*TOP|บน.*สั้น|สั้น.*บน|^T1$/),lt:col(h,/LONG.*TOP|บน.*ยาว|ยาว.*บน|^T2$/),ex:col(h,/EXTRA|ADD|เสริม/),sup:col(h,/SUPPORT|ON GROUND|SOG|ประเภท|^TYPE$|^REMARK|NOTE/)};
 if(c.thick<0)warnings.push('ไม่พบคอลัมน์ความหนา (THICK / หนา)');if(c.sb<0||c.lb<0)warnings.push('ไม่พบคอลัมน์เหล็กล่างด้านสั้น / ยาว');
 const templates:SlabTemplate[]=[];
 for(const r of t.rows){const name=(r[c.mark]||'').trim().replace(/\s+/g,'');if(!name)continue;
  const thickness=mmOf(r[c.thick]);if(!thickness){warnings.push(`${name}: ไม่มีความหนา · ข้าม`);continue;}
  const sb=bar(r[c.sb]),lb=bar(r[c.lb]),st=c.st>=0?bar(r[c.st]):{diameter:12,spacing:0},lt=c.lt>=0?bar(r[c.lt]):{diameter:12,spacing:0};
  if(!sb||!lb||!st||!lt){warnings.push(`${name}: อ่านขนาด / ระยะเหล็กไม่ได้ · ข้าม`);continue;}
  let topExtra:TopExtra|undefined;const ex=c.ex>=0?(r[c.ex]||'').toUpperCase():'';const eb=ex?parseSpacingText(ex):undefined;
  if(eb){const ratio=ex.match(/L\s*\/\s*([34])/),fixed=ex.replace(/.*@\d+/,'').match(/(\d{3,4})/);
   topExtra={diameter:eb.diameter,spacing:eb.spacing,length:ratio?{mode:'ratio',n:Number(ratio[1]) as 3|4}:{mode:'fixed',value:fixed?Number(fixed[1]):1000,from:'face'}};
   if(!ratio&&!fixed)warnings.push(`${name}: ความยาวบนเสริมไม่ระบุ · ใช้ 1000 จากหน้าคาน`);}
  const ground=c.sup>=0&&/SOG|ON GROUND|บนดิน|GROUND/i.test(r[c.sup]||'');
  templates.push({id:idOf('sl',name),name,group:'',note:'',source,thickness,support:ground?'ground':'elevated',
   rebar:{shortBottom:sb,longBottom:lb,shortTop:st,longTop:lt,...(topExtra?{topExtra}:{}),edge:DEFAULT_SLAB_REBAR.edge,bottomAtBeam:DEFAULT_SLAB_REBAR.bottomAtBeam}});}
 return {templates,warnings};
}
/** Beam schedule rows → Beam Templates (MARK, SIZE “300x600” or B / D columns, TOP, BOTTOM, STIRRUP, SIDE; one ALL SPAN
 * section; bars by `beamRebarFromSections`). */
export function beamTemplatesFromTable(t:TableRead,source=''):{templates:BeamTemplate[];warnings:string[]}{
 const h=t.header,warnings:string[]=[];
 const c={mark:Math.max(0,col(h,/MARK|เบอร์|BEAM/)),size:col(h,/SIZE|ขนาด|B\s*[X×]\s*D/),w:col(h,/^B$|WIDTH|กว้าง/),d:col(h,/^D$|^H$|DEPTH|ลึก|สูง/),
  top:col(h,/TOP|บน/,/STIRR/),bot:col(h,/BOT|ล่าง/),stir:col(h,/STIRR|LINK|ปลอก/),side:col(h,/SIDE|ข้าง|WEB/)};
 const templates:BeamTemplate[]=[];
 for(const r of t.rows){const name=(r[c.mark]||'').trim().replace(/\s+/g,'');if(!name)continue;
  const sz=(c.size>=0?r[c.size]:'').toUpperCase().match(/(\d{2,4})\s*[X×*]\s*(\d{2,4})/),width=sz?Number(sz[1]):mmOf(r[c.w]),depth=sz?Number(sz[2]):mmOf(r[c.d]);
  if(!width||!depth){warnings.push(`${name}: ไม่มีขนาด กว้าง × ลึก · ข้าม`);continue;}
  const top=(r[c.top]||'').trim(),bottom=(r[c.bot]||'').trim(),stirrup=(r[c.stir]||'').trim();
  if(!parseBarText(top).length||!parseBarText(bottom).length){warnings.push(`${name}: อ่านเหล็กบน / ล่างไม่ได้ · ข้าม`);continue;}
  const sections=[{zone:'all' as const,top,bottom,stirrup,legs:2,tie:'',side:c.side>=0?(r[c.side]||'').trim():''}];
  templates.push({id:idOf('bt',name),name,group:'',note:'',source,width,depth,sections,rebar:beamRebarFromSections({sections},w=>warnings.push(`${name}: ${w}`))});}
 return {templates,warnings};
}
export type TemplateRow={name:string;op:'add'|'edit'|'same';text:string};
const sameJson=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** New / changed / same against the project spec (by name). */
export function templateDiff(spec:Pick<Spec,'slabTemplates'|'beamTemplates'>,kind:'slab'|'beam',list:(SlabTemplate|BeamTemplate)[]):TemplateRow[]{
 const cur=(kind==='slab'?spec.slabTemplates:spec.beamTemplates)||[];
 return list.map(t=>{const c=(cur as (SlabTemplate|BeamTemplate)[]).find(x=>x.name.toUpperCase()===t.name.toUpperCase());
  const strip=(x:SlabTemplate|BeamTemplate)=>{const {id:_i,group:_g,note:_n,source:_s,...r}=x as SlabTemplate&BeamTemplate;return r;};
  const text=kind==='slab'?(()=>{const s=t as SlabTemplate,b=(x:{diameter:number;spacing:number})=>x.spacing?`${x.diameter<=9?'RB':'DB'}${x.diameter}@${x.spacing}`:'–';return `${s.name} หนา ${s.thickness} · ล่าง ${b(s.rebar.shortBottom)} / ${b(s.rebar.longBottom)} · บน ${b(s.rebar.shortTop)} / ${b(s.rebar.longTop)}${s.rebar.topExtra?` · บนเสริม ${b(s.rebar.topExtra)}`:''}${s.support==='ground'?' · บนดิน':''}`;})()
   :(()=>{const b=t as BeamTemplate,s=b.sections[0];return `${b.name} ${b.width}×${b.depth} · บน ${s.top} · ล่าง ${s.bottom} · ปลอก ${s.stirrup}${s.side?` · ข้าง ${s.side}`:''}`;})();
  return {name:t.name,op:!c?'add':sameJson(strip(c),strip(t))?'same':'edit',text};});
}
/** The project spec with the ticked templates merged in by name (existing ids kept for edited names). */
export function specWithTemplates<S extends Pick<Spec,'slabTemplates'|'beamTemplates'>>(spec:S,kind:'slab'|'beam',list:(SlabTemplate|BeamTemplate)[],names:Set<string>):S{
 const cur=((kind==='slab'?spec.slabTemplates:spec.beamTemplates)||[]) as (SlabTemplate|BeamTemplate)[];
 const pick=list.filter(t=>names.has(t.name)).map(t=>{const c=cur.find(x=>x.name.toUpperCase()===t.name.toUpperCase());return c?{...t,id:c.id,group:c.group,note:c.note}:t;});
 return kind==='slab'?{...spec,slabTemplates:mergeByName(spec.slabTemplates,pick as SlabTemplate[])}:{...spec,beamTemplates:mergeByName(spec.beamTemplates,pick as BeamTemplate[])};
}
