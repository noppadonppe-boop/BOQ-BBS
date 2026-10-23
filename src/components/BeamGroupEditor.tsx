import {Plus,Trash2} from 'lucide-react';
import {beamGroupLayout,newBeamGrid,newBeamSpan,type BeamGrid,type BeamInput,type BeamSpan} from '../domain/elementInput';

const diameters=[6,9,10,12,16,20,25,28,32,36,40];
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
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
   <text x={(s.a+s.b)/2} y={Y(s.z1)-fs*.4} fontSize={fs} textAnchor="middle">{s.mark}</text>
   <text className="dim" x={(lay.grid[s.k]+lay.grid[s.k+1])/2} y={totalH-bubble*.6} fontSize={fs*.8} textAnchor="middle">{(s.length/1000).toFixed(2)}</text>
   {s.top!==0&&<text className="drop" x={(s.a+s.b)/2} y={Y(s.z0)+fs*1.1} fontSize={fs*.75} textAnchor="middle">{s.top>0?'▲':'▼'} {Math.abs(s.top)}</text>}</g>)}
 </svg>;
}

/** Beam group editor: elevation, span table (mark, type, length, section, level, bars, stirrups) and grid table. */
export function BeamGroupEditor({input,edit,readOnly,selected,onSelect}:{input:BeamInput;edit:Edit;readOnly:boolean;selected:number;onSelect:(k:number)=>void}){
 const sp=input.spans,gr=input.grids,n=sp.length;
 const num=(v:number,on:(v:number)=>void,label:string,neg=false,width=70)=><input aria-label={label} type="number" step="any" style={{width}} disabled={readOnly} value={v} onChange={e=>on(neg?Number(e.target.value)||0:Math.max(0,Number(e.target.value)||0))}/>;
 const bars=(v:{count:number;diameter:number},on:(v:{count:number;diameter:number})=>void,label:string)=><span className="bar-cell">
  <input aria-label={`${label} จำนวน`} type="number" min={0} style={{width:44}} disabled={readOnly} value={v.count} onChange={e=>on({...v,count:Math.max(0,Math.trunc(Number(e.target.value)||0))})}/>
  <select aria-label={`${label} ขนาด`} disabled={readOnly} value={v.diameter} onChange={e=>on({...v,diameter:Number(e.target.value)})}>{[...new Set([...diameters,v.diameter])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{barName(d)}</option>)}</select></span>;
 const span=(k:number,f:(s:BeamSpan)=>void)=>edit(i=>f(i.spans[k]));
 const grid=(k:number,f:(g:BeamGrid)=>void)=>edit(i=>f(i.grids[k]));
 const nextLabel=(l:string)=>/^\d+$/.test(l)?String(Number(l)+1):/^[A-Z]$/.test(l)?String.fromCharCode(l.charCodeAt(0)+1):'';
 const addSpan=()=>edit(i=>{const src=[...i.spans].reverse().find(s=>s.kind!=='cantilever')||i.spans[n-1];const at=i.spans[n-1]?.kind==='cantilever'?n-1:n;
  i.spans.splice(at,0,newBeamSpan(i,src));i.grids.splice(at+1,0,newBeamGrid(nextLabel(i.grids[at]?.label||''),i.grids[at]?.support||300));});
 const addCantilever=(side:'start'|'end')=>edit(i=>{const src=side==='start'?i.spans[0]:i.spans[i.spans.length-1],c={...newBeamSpan(i,src),kind:'cantilever' as const,length:1500};
  if(side==='start'){i.spans.unshift(c);i.grids.unshift(newBeamGrid('',0));}else{i.spans.push(c);i.grids.push(newBeamGrid('',0));}});
 const remove=(k:number)=>edit(i=>{if(i.spans.length<2)return;i.spans.splice(k,1);i.grids.splice(k===0?0:k+1,1);});
 const hasStart=sp[0]?.kind==='cantilever',hasEnd=n>1&&sp[n-1]?.kind==='cantilever';
 return <div className="beam-group">
  <BeamGroupElevation input={input} selected={selected} onSelect={onSelect}/>
  <div className="actions"><button type="button" disabled={readOnly||n>=12} onClick={addSpan}><Plus size={14}/>เพิ่มช่วง (คัดลอกช่วงก่อนหน้า)</button>
   <button type="button" disabled={readOnly||hasStart||n>=12} onClick={()=>addCantilever('start')}><Plus size={14}/>คานยื่นต้น</button>
   <button type="button" disabled={readOnly||hasEnd||n>=12} onClick={()=>addCantilever('end')}><Plus size={14}/>คานยื่นปลาย</button></div>
  <div className="table-scroll"><table className="subbase-table beam-spans"><thead><tr><th>ช่วง (กริด)</th><th>เบอร์คาน</th><th>ยาว c/c</th><th>b</th><th>h</th><th title="ระดับหลังคานเทียบระดับอ้างอิงของกลุ่ม (− = Drop ลง)">หลังคาน ±</th><th>เหล็กบน</th><th>เหล็กล่าง</th><th>ปลอก</th><th>@ ปลาย / ยาว</th><th>@ กลาง</th><th/></tr></thead>
   <tbody>{sp.map((s,k)=><tr key={k} className={k===selected?'active':''} onClick={()=>onSelect(k)}>
    <td><small>{k+1} · {gr[k]?.label||'ปลาย'}–{gr[k+1]?.label||'ปลาย'}{s.kind==='cantilever'?' · ยื่น':''}</small></td>
    <td><input aria-label="เบอร์คาน" maxLength={32} style={{width:70}} disabled={readOnly} value={s.mark} onChange={e=>span(k,x=>{x.mark=e.target.value.slice(0,32);})}/></td>
    <td>{num(s.length,v=>span(k,x=>{x.length=v;}),'ความยาว',false,72)}</td><td>{num(s.width,v=>span(k,x=>{x.width=v;}),'กว้าง',false,56)}</td><td>{num(s.depth,v=>span(k,x=>{x.depth=v;}),'ลึก',false,56)}</td>
    <td>{num(s.top,v=>span(k,x=>{x.top=v;}),'ระดับหลังคาน',true,60)}</td>
    <td>{bars(s.rebar.top,v=>span(k,x=>{x.rebar.top=v;}),'เหล็กบน')}</td><td>{bars(s.rebar.bottom,v=>span(k,x=>{x.rebar.bottom=v;}),'เหล็กล่าง')}</td>
    <td><select aria-label="ขนาดปลอก" disabled={readOnly} value={s.rebar.stirrup.diameter} onChange={e=>span(k,x=>{x.rebar.stirrup.diameter=Number(e.target.value);})}>{[6,9,10,12,16].map(d=><option key={d} value={d}>{barName(d)}</option>)}</select></td>
    <td><span className="bar-cell">{num(s.rebar.stirrup.endSpacing,v=>span(k,x=>{x.rebar.stirrup.endSpacing=v;}),'ระยะปลอกช่วงปลาย',false,50)}{num(s.rebar.stirrup.endLength,v=>span(k,x=>{x.rebar.stirrup.endLength=v;}),'ความยาวช่วงปลาย',false,60)}</span></td>
    <td>{num(s.rebar.stirrup.spacing,v=>span(k,x=>{x.rebar.stirrup.spacing=v;}),'ระยะปลอกช่วงกลาง',false,50)}</td>
    <td><button type="button" className="icon-button" aria-label="ลบช่วง" disabled={readOnly||n<2} onClick={e=>{e.stopPropagation();remove(k);}}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
  <div className="table-scroll"><table className="subbase-table beam-grids"><thead><tr><th>กริด</th>{gr.map((_,k)=><th key={k}>{k+1}</th>)}</tr></thead><tbody>
   <tr><td>ชื่อกริด</td>{gr.map((g,k)=><td key={k}><input aria-label={`ชื่อกริด ${k+1}`} maxLength={20} style={{width:56}} disabled={readOnly} value={g.label} onChange={e=>grid(k,x=>{x.label=e.target.value.slice(0,20);})}/></td>)}</tr>
   <tr><td>กว้างเสา (ตามแนวคาน) <small className="muted">0 = ไม่มีเสา</small></td>{gr.map((g,k)=><td key={k}>{num(g.support,v=>grid(k,x=>{x.support=v;}),`กว้างเสา ${k+1}`,false,60)}</td>)}</tr>
   <tr><td>เหล็กเสริมบนเหนือเสา</td>{gr.map((g,k)=><td key={k}>{bars(g.extraTop,v=>grid(k,x=>{x.extraTop=v;}),`เหล็กเสริมบนกริด ${k+1}`)}</td>)}</tr>
  </tbody></table></div>
  <p className="muted">ยาว c/c = ระยะกริดถึงกริด (ช่วงยื่น: กริดถึงปลาย) · คอนกรีตคิดระหว่างผิวเสา · เหล็กบนต่อเนื่องรวมช่วงที่ขนาด/จำนวน/ระดับเท่ากัน · เหล็กเสริมบนยื่นตาม General Spec · ปลายต่อเนื่อง {'×'} topCont · ปลายไม่ต่อเนื่อง × topEnd ของช่วงสุทธิ</p>
 </div>;
}
