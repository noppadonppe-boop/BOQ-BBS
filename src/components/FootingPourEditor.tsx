import {footingColumns,footingPour,type FoundationInput} from '../domain/elementInput';
import type {PourStage} from '../domain/solids';

type Edit=(f:(i:FoundationInput)=>void)=>void;
const fills=['#cfe3f7','#f7dfc4','#d5ecd2','#ead6f2','#f6efc0','#d9e0e6'];
const fmt=(v:number,d=2)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});

/** Concrete pour stages of a footing: number of stages, height of each (the last takes the rest), quantities per
 * stage from the preview and an elevation of the footing + pedestals with the stage bands. */
export function FootingPourEditor({input,edit,readOnly,stages}:{input:FoundationInput;edit:Edit;readOnly:boolean;stages?:PourStage[]}){
 const pr=footingPour(input),n=input.pour.count,T=input.thickness,ped=input.column.type==='pedestal';
 const setCount=(c:number)=>edit(i=>{const keep=i.pour.heights.slice(0,c-1),used=keep.reduce((s,h)=>s+h,0),left=Math.max(0,pr.total-used),add=c-1-keep.length;
  i.pour={count:c,heights:[...keep,...Array.from({length:Math.max(0,add)},()=>Math.round(left/(add+1)/50)*50)]};});
 const even=()=>edit(i=>{i.pour.heights=Array.from({length:n-1},()=>Math.round(pr.total/n/50)*50);});
 const footingThenPedestal=()=>edit(i=>{i.pour={count:2,heights:[T]};});
 const levelOf=(z:number)=>input.levels.enabled?(input.levels.top-(T-z)/1000).toFixed(3):undefined;
 // elevation: footing + the highest pedestal, stage bands across
 const cols=ped?footingColumns(input):[],W=input.shape==='circle'?input.diameter:input.width,sc=Math.min(240/Math.max(W,1),190/Math.max(pr.total,1));
 const ox=20,base=210,yOf=(z:number)=>base-z*sc,pw=cols.length?Math.max(...cols.map(c=>c.shape==='circle'?c.diameter:c.width)):0;
 const outline=`M${ox},${yOf(0)}H${ox+W*sc}V${yOf(T)}${pw?`H${ox+(W+pw)/2*sc}V${yOf(pr.total)}H${ox+(W-pw)/2*sc}V${yOf(T)}`:''}H${ox}Z`;
 return <div className="footing-pour">
  <h4>การเทคอนกรีต (Pour stages)</h4>
  <div className="earthwork-input"><div>
   <div className="field"><span>จำนวน Stage การเท</span><div className="segmented" role="group" aria-label="จำนวน Stage การเท">{[1,2,3,4,5,6].map(c=><button key={c} type="button" disabled={readOnly} className={n===c?'active':''} onClick={()=>setCount(c)}>{c}</button>)}</div></div>
   {n>1&&<><div className="actions">{ped&&<button type="button" disabled={readOnly} onClick={footingThenPedestal}>ฐาน แล้วตอม่อ</button>}<button type="button" disabled={readOnly} onClick={even}>แบ่งเท่ากัน</button></div>
    <div className="table-scroll"><table className="subbase-table"><thead><tr><th>Stage (ล่าง → บน)</th><th>สูง (mm)</th><th>ช่วงจากใต้ฐาน (mm)</th>{input.levels.enabled&&<th>ระดับบน (m)</th>}<th className="num">คอนกรีต</th><th className="num">แบบหล่อ</th><th className="num">รอยต่อบน</th></tr></thead>
     <tbody>{pr.stages.map((s,k)=>{const q=stages?.find(x=>x.stage===s.stage),last=k===n-1;return <tr key={s.stage}>
      <td><span className="stage-swatch" style={{background:fills[k%fills.length]}}/>Stage {s.stage}</td>
      <td>{last?<b className={s.height>0?'computed':'computed error-text'}>{Math.round(s.height)} <small className="muted">(ส่วนที่เหลือ)</small></b>
       :<input aria-label={`ความสูง Stage ${s.stage}`} type="number" min={0} step={50} style={{width:80}} disabled={readOnly} value={input.pour.heights[k]??0} onChange={e=>{const v=Math.max(0,Number(e.target.value)||0);edit(i=>{i.pour.heights[k]=v;});}}/>}</td>
      <td>{Math.round(s.z0)} – {Math.round(s.z1)}{s.z0<T&&s.z1>T?<small className="block muted">ข้ามหลังฐาน</small>:null}</td>
      {input.levels.enabled&&<td>{levelOf(s.z1)}</td>}
      <td className="num">{q?`${fmt(q.concrete)} m³`:'—'}</td><td className="num">{q?`${fmt(q.formwork)} m²`:'—'}</td><td className="num">{last?'—':q?`${fmt(q.joint)} m²`:'—'}</td></tr>;})}</tbody></table></div>
    <p className="muted">ความสูงรวม {Math.round(pr.total)} mm (ฐาน {T}{pr.total>T?` + ตอม่อ ${Math.round(pr.total-T)}`:''}) · Stage สุดท้ายรับส่วนที่เหลือ · BOQ แยกคอนกรีต / แบบหล่อตาม Stage และรอยต่อการเท (Construction joint) · ยอดรวมเท่าเดิม</p></>}
   {n===1&&<p className="muted">เทครั้งเดียวทั้งฐาน{ped?'และตอม่อ':''} · เลือก 2 Stage ขึ้นไปเพื่อแยกปริมาณตามการเท</p>}
  </div>
  <svg className="pour-sketch" viewBox="0 0 280 230" role="img" aria-label="รูปด้านการเทคอนกรีตตาม Stage">
   <defs><clipPath id="pour-clip"><path d={outline}/></clipPath></defs>
   <g clipPath="url(#pour-clip)">{pr.stages.map((s,k)=><rect key={s.stage} x={0} width={280} y={yOf(s.z1)} height={Math.max(0,(s.z1-s.z0)*sc)} fill={fills[k%fills.length]}/>)}</g>
   <path d={outline} fill="none" stroke="currentColor" strokeWidth={1.2}/>
   {pr.stages.slice(0,-1).map(s=><g key={s.stage}><line x1={ox-8} x2={ox+W*sc+8} y1={yOf(s.z1)} y2={yOf(s.z1)} stroke="#c0392b" strokeDasharray="5 3"/><text x={ox+W*sc+10} y={yOf(s.z1)+3} fontSize={9} fill="#c0392b">+{Math.round(s.z1)}</text></g>)}
   {pr.stages.map(s=>{const h=(s.z1-s.z0)*sc;return h>10?<text key={s.stage} x={ox+W*sc/2} y={yOf((s.z0+s.z1)/2)+3} fontSize={9} textAnchor="middle">Stage {s.stage}</text>:null;})}
   <line x1={ox-8} x2={ox+W*sc+8} y1={base} y2={base} stroke="currentColor" strokeWidth={.6}/>
  </svg></div>
 </div>;
}
