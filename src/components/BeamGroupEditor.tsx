import {useState} from 'react';
import {BookmarkPlus,Copy,Download,Plus,Trash2} from 'lucide-react';
import {beamGroupLayout,beamZoneLabels,beamZones,newBeamGrid,newBeamSpan,type BeamGrid,type BeamInput,type BeamRebar,type BeamSpan,type BeamZone} from '../domain/elementInput';
import {deleteBeamMark,saveBeamMark,useBeamMarks,type BeamMark} from '../data/beamMarks';
import {NumInput} from './EditorControls';
import {applyBeamTemplate,beamTemplateCurrent,beamTemplateSummary,type BeamTemplate} from '../domain/beamTemplates';

const diameters=[6,9,10,12,16,20,25,28,32,36,40];
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
const bars=(b:{count:number;diameter:number})=>b.count>0?`${b.count}${barName(b.diameter)}`:'—';
type Edit=(f:(i:BeamInput)=>void)=>void;

/** Elevation of a beam group: grid bubbles, supports, spans at their levels (drops), cantilevers and marks. */
export function BeamGroupElevation({input,selected,onSelect}:{input:BeamInput;selected:number;onSelect:(k:number)=>void}){
 if(!input.spans.length)return null;
 const lay=beamGroupLayout(input),pad=Math.max(400,lay.L*.03),bubble=Math.max(lay.L,lay.H*3)/45,fs=bubble*.9,H=lay.H;
 const W=lay.L+2*pad,top=bubble*3.2,totalH=top+H+bubble*3.6,Y=(z:number)=>top+H-z;
 return <svg className="beam-elevation" viewBox={`${-pad} 0 ${W} ${totalH}`} role="img" aria-label="รูปด้านกลุ่มคาน">
  {lay.grid.map((x,k)=>{const g=input.grids[k];if(!g)return null;return <g key={`g${k}`}>
   <line className="grid" x1={x} x2={x} y1={bubble*2} y2={totalH-bubble*1.6}/>
   {g.label&&<><circle className="bubble" cx={x} cy={bubble} r={bubble*.85}/><text x={x} y={bubble+fs*.35} fontSize={fs} textAnchor="middle">{g.label}</text></>}</g>;})}
  {lay.columns.map(q=><rect key={`c${q.k}`} className="support" x={q.x0} y={Y(q.z1)-bubble*.6} width={q.x1-q.x0} height={q.z1-q.z0+bubble*1.2}/>)}
  {lay.spans.map(s=><g key={`s${s.k}`} onClick={()=>onSelect(s.k)} className="span-hit">
   <rect className={`span${s.k===selected?' active':''}${s.kind==='cantilever'?' cantilever':''}`} x={s.a} y={Y(s.z1)} width={Math.max(1,s.clear)} height={s.z1-s.z0}/>
   {s.kind!=='cantilever'&&[[s.a,s.zoneA],[s.b-s.clear/4,s.zoneB]].map(([x,z])=><rect key={String(z)+x} className="zone" x={x as number} y={Y(s.z1)} width={s.clear/4} height={s.z1-s.z0}/>)}
   <text x={(s.a+s.b)/2} y={Y(s.z1)-fs*.4} fontSize={fs} textAnchor="middle">{s.mark}</text>
   {s.clear>fs*12&&<>{s.kind==='cantilever'?<text className="zone-label" x={(s.a+s.b)/2} y={Y((s.z0+s.z1)/2)+fs*.3} fontSize={fs*.7} textAnchor="middle">CANT</text>:<>
    <text className="zone-label" x={s.a+s.clear/8} y={Y((s.z0+s.z1)/2)+fs*.3} fontSize={fs*.7} textAnchor="middle">{beamZoneLabels[s.zoneA]}</text>
    <text className="zone-label" x={(s.a+s.b)/2} y={Y((s.z0+s.z1)/2)+fs*.3} fontSize={fs*.7} textAnchor="middle">MID</text>
    <text className="zone-label" x={s.b-s.clear/8} y={Y((s.z0+s.z1)/2)+fs*.3} fontSize={fs*.7} textAnchor="middle">{beamZoneLabels[s.zoneB]}</text></>}</>}
   <text className="dim" x={(lay.grid[s.k]+lay.grid[s.k+1])/2} y={totalH-bubble*.6} fontSize={fs*.8} textAnchor="middle">{(s.length/1000).toFixed(2)}</text>
   {s.top!==0&&<text className="drop" x={(s.a+s.b)/2} y={Y(s.z0)+fs*1.1} fontSize={fs*.75} textAnchor="middle">{s.top>0?'▲':'▼'} {Math.abs(s.top)}</text>}</g>)}
 </svg>;
}

const sectionSummary=(r:BeamRebar,zones:BeamZone[])=>`บน ${bars(r.top)} · ล่าง ${bars(r.bottom)}${zones.map(z=>{const e=r.ex[z];return e.top.count||e.bottom.count?` · ${beamZoneLabels[z]} ${e.top.count?`+${bars(e.top)}↑`:''}${e.bottom.count?`+${bars(e.bottom)}↓`:''}`:'';}).join('')} · ปลอก ${barName(r.stirrup.diameter)}${r.stirrup.legs>2?`×${r.stirrup.legs}ขา`:''} @${zones.map(z=>r.stirrup.spacing[z]).join('/')}${r.side.count?` · ข้าง ${r.side.count * 2}${barName(r.side.diameter)}`:''}`;

/** Beam group editor: elevation, span table (mark from the project beam mark table, grid-to-grid length, column
 * widths at both supports, section, level) and the section editor of the selected span (END / MID / CON / CANT). */
export function BeamGroupEditor({input,edit,readOnly,selected,onSelect,projectId,templates=[]}:{input:BeamInput;edit:Edit;readOnly:boolean;selected:number;onSelect:(k:number)=>void;projectId:string;templates?:BeamTemplate[]}){
 const sp=input.spans,gr=input.grids,n=sp.length,sel=Math.min(selected,Math.max(0,n-1)),cur=sp[sel],lay=beamGroupLayout(input),zonesOf=(k:number):BeamZone[]=>{const s=lay.spans[k];return s.kind==='cantilever'?['cant']:[...new Set([s.zoneA,'mid' as BeamZone,s.zoneB])];};
 const {marks,error}=useBeamMarks(projectId),[msg,setMsg]=useState('');
 const num=(v:number,on:(v:number)=>void,label:string,neg=false,width=70)=><NumInput aria-label={label} type="number" step="any" style={{width}} disabled={readOnly} value={v} onClick={e=>e.stopPropagation()} onChange={e=>on(neg?Number(e.target.value)||0:Math.max(0,Number(e.target.value)||0))}/>;
 const barsIn=(v:{count:number;diameter:number},on:(v:{count:number;diameter:number})=>void,label:string)=><span className="bar-cell">
  <NumInput aria-label={`${label} จำนวน`} type="number" min={0} style={{width:44}} disabled={readOnly} value={v.count} onChange={e=>on({...v,count:Math.max(0,Math.trunc(Number(e.target.value)||0))})}/>
  <select aria-label={`${label} ขนาด`} disabled={readOnly} value={v.diameter} onChange={e=>on({...v,diameter:Number(e.target.value)})}>{[...new Set([...diameters,v.diameter])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{barName(d)}</option>)}</select></span>;
 const span=(k:number,f:(s:BeamSpan)=>void)=>edit(i=>f(i.spans[k]));
 const grid=(k:number,f:(g:BeamGrid)=>void)=>edit(i=>f(i.grids[k]));
 const nextLabel=(l:string)=>/^\d+$/.test(l)?String(Number(l)+1):/^[A-Z]$/.test(l)?String.fromCharCode(l.charCodeAt(0)+1):'';
 const addSpan=()=>edit(i=>{const src=[...i.spans].reverse().find(s=>s.kind!=='cantilever')||i.spans[n-1];const at=i.spans[n-1]?.kind==='cantilever'?n-1:n;
  i.spans.splice(at,0,newBeamSpan(i,src));i.grids.splice(at+1,0,newBeamGrid(nextLabel(i.grids[at]?.label||''),i.grids[at]?.support||300,i.grids[at]?.supportY||0));});
 const addCantilever=(side:'start'|'end')=>edit(i=>{const src=side==='start'?i.spans[0]:i.spans[i.spans.length-1],c={...newBeamSpan(i,src),kind:'cantilever' as const,length:1500};
  if(side==='start'){i.spans.unshift(c);i.grids.unshift(newBeamGrid('',0));}else{i.spans.push(c);i.grids.push(newBeamGrid('',0));}});
 const remove=(k:number)=>edit(i=>{if(i.spans.length<2)return;i.spans.splice(k,1);i.grids.splice(k===0?0:k+1,1);});
 const fromMark=(k:number,m:BeamMark)=>span(k,s=>{s.mark=m.mark;s.width=m.width;s.depth=m.depth;s.rebar=structuredClone(m.rebar);delete s.template;});
 const markOf=(mark:string)=>marks.find(m=>m.mark===mark);
 // Project Beam Template (General Spec): a mark typed / picked from the list takes its size and bars and stays linked
 const tplOf=(mark:string)=>templates.find(t=>t.name.toUpperCase()===mark.trim().toUpperCase());
 const tplById=(id?:string)=>id?templates.find(t=>t.id===id):undefined;
 const fromTemplate=(k:number,t:BeamTemplate)=>span(k,s=>{Object.assign(s,applyBeamTemplate(s,t));});
 const stale=sp.flatMap((s,k)=>{const t=tplById(s.template);return t&&!beamTemplateCurrent(s,t)?[k]:[];});
 const unlinked=sp.flatMap((s,k)=>!s.template&&tplOf(s.mark)?[k]:[]);
 const hasStart=sp[0]?.kind==='cantilever',hasEnd=n>1&&sp[n-1]?.kind==='cantilever';
 const saveMark=async()=>{if(!cur)return;setMsg('');try{const m=await saveBeamMark(projectId,{mark:cur.mark,width:cur.width,depth:cur.depth,rebar:cur.rebar},markOf(cur.mark));setMsg(`บันทึกเบอร์ ${m.mark} ลงตารางเบอร์คานของโครงการแล้ว`);}catch(e){setMsg(e instanceof Error?e.message:String(e));}};
 const zoneCols:BeamZone[]=cur?.kind==='cantilever'?['cant']:beamZones.filter(z=>z!=='cant');
 return <div className="beam-group">
  <BeamGroupElevation input={input} selected={sel} onSelect={onSelect}/>
  <div className="actions"><button type="button" disabled={readOnly||n>=12} onClick={addSpan}><Plus size={14}/>เพิ่มช่วง (คัดลอกช่วงก่อนหน้า)</button>
   <button type="button" disabled={readOnly||hasStart||n>=12} onClick={()=>addCantilever('start')}><Plus size={14}/>คานยื่นต้น</button>
   <button type="button" disabled={readOnly||hasEnd||n>=12} onClick={()=>addCantilever('end')}><Plus size={14}/>คานยื่นปลาย</button></div>
  {error&&<p className="notice warning">{error}</p>}
  <datalist id="beam-marks">{templates.map(t=><option key={`t-${t.id}`} value={t.name}>{`Template · ${beamTemplateSummary(t)}`}</option>)}{marks.filter(m=>!tplOf(m.mark)).map(m=><option key={m.id} value={m.mark}>{`${m.width}×${m.depth}`}</option>)}</datalist>
  {templates.length===0&&<p className="notice warning">General Spec ของโครงการยังไม่มี Beam Template · นำเข้าไฟล์ Spec (มี beamTemplates) ในหน้า General Spec แล้วกด “บันทึก Spec” และตรวจว่าโครงการใช้ Spec profile นั้น</p>}
  {unlinked.length>0&&<p className="notice warning">ช่วง {unlinked.map(k=>k+1).join(', ')} มีเบอร์ตรงกับ Beam Template แต่ยังไม่ได้ใช้ขนาดและเหล็กตามแบบ <button type="button" className="primary" disabled={readOnly} onClick={()=>edit(i=>{i.spans.forEach((s,k)=>{const t=!s.template&&tplOf(s.mark);if(t)i.spans[k]=applyBeamTemplate(s,t);});})}>ใช้ตาม Template</button></p>}
  {templates.length>0&&<p className="muted">เบอร์คานจาก Beam Template ของ General Spec {templates.length} เบอร์ · พิมพ์ / เลือกเบอร์ในช่อง “เบอร์คาน” เพื่อใช้ขนาดและเหล็กตามแบบ (ช่วงเชื่อมกับ Template และอัปเดตเมื่อ Spec เปลี่ยน)</p>}
  {stale.length>0&&<p className="notice warning">ช่วง {stale.map(k=>k+1).join(', ')} ไม่ตรงกับ Beam Template ใน Spec (Template ถูกแก้ / นำเข้าใหม่ หรือแก้ค่าในช่วงเอง) <button type="button" className="primary" disabled={readOnly} onClick={()=>edit(i=>{i.spans.forEach((s,k)=>{const t=tplById(s.template);if(t)i.spans[k]=applyBeamTemplate(s,t);});})}>อัปเดตตาม Template</button></p>}
  <div className="table-scroll"><table className="subbase-table beam-spans"><thead><tr><th>ช่วง</th><th>กริด</th><th>เบอร์คาน</th><th>ยาว c/c</th><th title="ขนาดเสาที่ Support ซ้าย: X ตามแนวคาน × Y ขวางคาน (X = 0 ไม่มีเสา)">เสาซ้าย X × Y</th><th title="ขนาดเสาที่ Support ขวา: X ตามแนวคาน × Y ขวางคาน">เสาขวา X × Y</th><th>b</th><th>h</th><th title="ระดับหลังคานเทียบระดับอ้างอิงของกลุ่ม (− = Drop ลง)">หลังคาน ±</th><th>หน้าตัด</th><th/></tr></thead>
   <tbody>{sp.map((s,k)=>{const lib=markOf(s.mark);return <tr key={k} className={k===sel?'active':''} onClick={()=>onSelect(k)}>
    <td><small>{k+1}{s.kind==='cantilever'?' · ยื่น':''}</small></td>
    <td><span className="bar-cell"><input aria-label={`ชื่อกริดซ้าย ช่วง ${k+1}`} maxLength={20} style={{width:40}} disabled={readOnly} value={gr[k]?.label||''} onClick={e=>e.stopPropagation()} onChange={e=>grid(k,x=>{x.label=e.target.value.slice(0,20);})}/>–<input aria-label={`ชื่อกริดขวา ช่วง ${k+1}`} maxLength={20} style={{width:40}} disabled={readOnly} value={gr[k+1]?.label||''} onClick={e=>e.stopPropagation()} onChange={e=>grid(k+1,x=>{x.label=e.target.value.slice(0,20);})}/></span></td>
    <td><span className="bar-cell"><input aria-label="เบอร์คาน" list="beam-marks" maxLength={32} style={{width:70}} disabled={readOnly} value={s.mark} onClick={e=>e.stopPropagation()} onChange={e=>{const v=e.target.value.slice(0,32),t=tplOf(v),m=markOf(v);if(t)fromTemplate(k,t);else if(m)fromMark(k,m);else span(k,x=>{x.mark=v;delete x.template;});}}/>
     {s.template&&<small className="ct-link on" title={tplById(s.template)?beamTemplateSummary(tplById(s.template)!):'ไม่พบใน Spec แล้ว'}>T</small>}
     {!s.template&&tplOf(s.mark)&&<button type="button" className="icon-button" title={`ใช้ขนาดและเหล็กตาม Beam Template ${s.mark}: ${beamTemplateSummary(tplOf(s.mark)!)}`} disabled={readOnly} onClick={e=>{e.stopPropagation();fromTemplate(k,tplOf(s.mark)!);}}><Download size={13}/></button>}
     {!s.template&&!tplOf(s.mark)&&lib&&<button type="button" className="icon-button" title={`ใช้ขนาดและเหล็กของ ${lib.mark} จากตารางเบอร์คาน`} disabled={readOnly} onClick={e=>{e.stopPropagation();fromMark(k,lib);}}><Download size={13}/></button>}</span></td>
    <td>{num(s.length,v=>span(k,x=>{x.length=v;}),'ความยาว',false,84)}</td>
    {([[k,'ซ้าย'],[k+1,'ขวา']] as const).map(([g,side])=><td key={side}><span className="bar-cell">{num(gr[g]?.support||0,v=>grid(g,x=>{x.support=v;}),`เสา${side} X (ตามแนวคาน) ช่วง ${k+1}`,false,62)}×{num(gr[g]?.supportY||gr[g]?.support||0,v=>grid(g,x=>{x.supportY=v;}),`เสา${side} Y (ขวางคาน) ช่วง ${k+1}`,false,62)}</span></td>)}
    <td>{num(s.width,v=>span(k,x=>{x.width=v;}),'กว้าง',false,66)}</td><td>{num(s.depth,v=>span(k,x=>{x.depth=v;}),'ลึก',false,66)}</td>
    <td>{num(s.top,v=>span(k,x=>{x.top=v;}),'ระดับหลังคาน',true,68)}</td>
    <td><small>{zonesOf(k).map(z=>beamZoneLabels[z]).join(' · ')}</small><small className="block muted">{sectionSummary(s.rebar,zonesOf(k))}</small></td>
    <td><button type="button" className="icon-button" aria-label="ลบช่วง" disabled={readOnly||n<2} onClick={e=>{e.stopPropagation();remove(k);}}><Trash2 size={14}/></button></td></tr>;})}</tbody></table></div>
  {cur&&<div className="beam-section-editor"><div className="section-heading"><h5>หน้าตัดช่วงที่ {sel+1} · {cur.mark} · {cur.width} × {cur.depth}{cur.kind==='cantilever'?' · คานยื่น (CANT)':''}</h5>
   <span className="actions"><button type="button" disabled={readOnly} onClick={()=>edit(i=>{const src=i.spans[sel];i.spans.forEach((s,k)=>{if(k!==sel&&s.mark===src.mark){s.width=src.width;s.depth=src.depth;s.rebar=structuredClone(src.rebar);if(src.template)s.template=src.template;else delete s.template;}});})} title="คัดลอกขนาดและเหล็กไปทุกช่วงที่เป็นเบอร์เดียวกันในกลุ่มนี้"><Copy size={13}/>ใช้กับทุกช่วงเบอร์ {cur.mark}</button>
    <button type="button" disabled={readOnly||!cur.mark.trim()} onClick={()=>void saveMark()}><BookmarkPlus size={13}/>{markOf(cur.mark)?'อัปเดต':'บันทึก'}ลงตารางเบอร์คาน</button>
    {markOf(cur.mark)&&<button type="button" className="icon-button" title="ลบเบอร์นี้ออกจากตารางเบอร์คานของโครงการ" disabled={readOnly} onClick={()=>{const m=markOf(cur.mark);if(m&&confirm(`ลบเบอร์ ${m.mark} จากตารางเบอร์คาน?`))void deleteBeamMark(projectId,m).catch(e=>setMsg(String(e)));}}><Trash2 size={13}/></button>}</span></div>
   {msg&&<p className="notice" role="status">{msg}</p>}
   {(()=>{const t=tplById(cur.template);return t&&<p className="muted beam-template-src">ตามแบบ {t.name}{t.source?` · ${t.source}`:''}: {t.sections.map(x=>`${x.zone.toUpperCase()} SPAN — บน ${x.top||'—'} · ล่าง ${x.bottom||'—'} · ปลอก ${x.stirrup||'—'}${x.legs>2?` (${x.legs} ขา)`:''}${x.side?` · ข้าง ${x.side}`:''}${x.tie?` · ${x.tie}`:''}`).join('  |  ')}</p>;})()}
   <div className="table-scroll"><table className="subbase-table beam-sections"><thead><tr><th>รายการ</th>{zoneCols.map(z=><th key={z} className={zonesOf(sel).includes(z)?'':'muted'}>{beamZoneLabels[z]} SPAN</th>)}</tr></thead><tbody>
    <tr><td>เหล็กบนหลัก (ต่อเนื่อง)</td><td colSpan={zoneCols.length}>{barsIn(cur.rebar.top,v=>span(sel,x=>{x.rebar.top=v;}),'เหล็กบนหลัก')}</td></tr>
    <tr><td>เหล็กบนเสริม (EX)</td>{zoneCols.map(z=><td key={z}>{barsIn(cur.rebar.ex[z].top,v=>span(sel,x=>{x.rebar.ex[z].top=v;}),`เหล็กบน EX ${z}`)}</td>)}</tr>
    <tr><td>เหล็กล่างหลัก (ต่อเนื่อง)</td><td colSpan={zoneCols.length}>{barsIn(cur.rebar.bottom,v=>span(sel,x=>{x.rebar.bottom=v;}),'เหล็กล่างหลัก')}</td></tr>
    <tr><td>เหล็กล่างเสริม (EX)</td>{zoneCols.map(z=><td key={z}>{barsIn(cur.rebar.ex[z].bottom,v=>span(sel,x=>{x.rebar.ex[z].bottom=v;}),`เหล็กล่าง EX ${z}`)}</td>)}</tr>
    <tr><td>เหล็กปลอก <span className="bar-cell"><select aria-label="ขนาดปลอก" disabled={readOnly} value={cur.rebar.stirrup.diameter} onChange={e=>span(sel,x=>{x.rebar.stirrup.diameter=Number(e.target.value);})}>{[6,9,10,12,16].map(d=><option key={d} value={d}>{barName(d)}</option>)}</select>
     <select aria-label="จำนวนขาปลอก" disabled={readOnly} value={cur.rebar.stirrup.legs} onChange={e=>span(sel,x=>{x.rebar.stirrup.legs=Number(e.target.value);})}>{[2,4,6,8].map(l=><option key={l} value={l}>{l} ขา</option>)}</select></span></td>
     {zoneCols.map(z=><td key={z}>@ {num(cur.rebar.stirrup.spacing[z],v=>span(sel,x=>{x.rebar.stirrup.spacing[z]=v;}),`ระยะปลอก ${z}`,false,60)}</td>)}</tr>
    <tr><td>เหล็กข้าง (ต่อด้าน) + เหล็กยึด</td><td colSpan={zoneCols.length}><span className="bar-cell">{barsIn({count:cur.rebar.side.count,diameter:cur.rebar.side.diameter},v=>span(sel,x=>{x.rebar.side.count=Math.min(20,v.count);x.rebar.side.diameter=v.diameter;}),'เหล็กข้างต่อด้าน')}
     <small className="muted">ต่อด้าน (รวม {cur.rebar.side.count*2} เส้น) · ยึด</small>
     <select aria-label="ขนาดเหล็กยึด" disabled={readOnly} value={cur.rebar.side.tie.diameter} onChange={e=>span(sel,x=>{x.rebar.side.tie.diameter=Number(e.target.value);})}>{[6,9,10,12].map(d=><option key={d} value={d}>{barName(d)}</option>)}</select>@{num(cur.rebar.side.tie.spacing,v=>span(sel,x=>{x.rebar.side.tie.spacing=v;}),'ระยะเหล็กยึด',false,60)}</span></td></tr>
   </tbody></table></div>
   <p className="muted">END = ปลายติดเสาที่ไม่ต่อเนื่อง · CON = ปลายต่อเนื่อง · CANT = ช่วงยื่น · หน้าตัดตาม Beam Details · ระยะตัด EX และช่วงปลอกถี่ตาม General Spec (Typical beam details) · เหล็กยาวเกินเหล็กเส้นต่อทาบอัตโนมัติ</p>
  </div>}
 </div>;
}
