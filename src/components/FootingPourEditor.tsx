import {DEFAULT_JOINT_REBAR,footingColumns,footingLevels,footingPour,jointRebar,type FoundationInput} from '../domain/elementInput';
import type {PourStage} from '../domain/solids';

type Edit=(f:(i:FoundationInput)=>void)=>void;
type Joint=FoundationInput['pour']['joints'][number];
const fills=['#cfe3f7','#f7dfc4','#d5ecd2','#ead6f2','#f6efc0','#d9e0e6'];
const fmt=(v:number,d=2)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(v:number)=>`${v>0?'+':v<0?'−':'±'}${Math.abs(v).toFixed(3)}`;
const diameters=[12,16,20,25,28,32];
const dowelShapes:[Joint['dowel']['shape'],string][]=[['z','ตัว Z (ขาบน/ล่างสวนกัน)'],['21','ตัว U (ขาบน/ล่างทางเดียวกัน)'],['11','งอปลายบน (L)'],['00','ตรง']];

/** Concrete pour stages of a footing: number of stages, height of each (the last takes the rest), bars at each
 * construction joint (mesh at the top of the lower / bottom of the upper stage, vertical bars through the joint),
 * quantities per stage from the preview and an elevation with the stage bands. */
export function FootingPourEditor({input,edit,readOnly,stages}:{input:FoundationInput;edit:Edit;readOnly:boolean;stages?:PourStage[]}){
 const pr=footingPour(input),n=input.pour.count,T=input.thickness,ped=input.column.type==='pedestal';
 const setCount=(c:number)=>edit(i=>{const keep=i.pour.heights.slice(0,c-1),used=keep.reduce((s,h)=>s+h,0),left=Math.max(0,pr.total-used),add=c-1-keep.length;
  i.pour={...i.pour,count:c,heights:[...keep,...Array.from({length:Math.max(0,add)},()=>Math.round(left/(add+1)/50)*50)],joints:i.pour.joints.slice(0,c-1)};});
 const even=()=>edit(i=>{i.pour.heights=Array.from({length:n-1},()=>Math.round(pr.total/n/50)*50);});
 const footingThenPedestal=()=>edit(i=>{i.pour={...i.pour,count:2,heights:[T],joints:i.pour.joints.slice(0,1)};});
 const lv=input.levels.enabled?footingLevels(input):undefined,levelOf=(z:number)=>lv?signed(lv.bottom+z/1000):undefined;
 // joint k: fill the list with defaults up to k before editing
 const joint=(k:number,f:(j:Joint)=>void)=>edit(i=>{while(i.pour.joints.length<=k)i.pour.joints.push(structuredClone(DEFAULT_JOINT_REBAR));f(i.pour.joints[k]);});
 const num=(v:number,on:(v:number)=>void,label:string,width=64,step=10)=><input aria-label={label} type="number" min={0} step={step} style={{width}} disabled={readOnly} value={v} onChange={e=>on(Math.max(0,Number(e.target.value)||0))}/>;
 const dsel=(v:number,on:(v:number)=>void,label:string)=><select aria-label={label} disabled={readOnly} value={v} onChange={e=>on(Number(e.target.value))}>{[...new Set([...diameters,v])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>DB{d}</option>)}</select>;
 // elevation: footing + the highest pedestal, stage bands across, joint bars drawn schematically
 const cols=ped?footingColumns(input):[],W=input.shape==='circle'?input.diameter:input.width,sc=Math.min(200/Math.max(W,1),190/Math.max(pr.total,1));
 const ox=20,base=210,yOf=(z:number)=>base-z*sc,xOf=(x:number)=>ox+x*sc,pw=cols.length?Math.max(...cols.map(c=>c.shape==='circle'?c.diameter:c.width)):0;
 const outline=`M${ox},${yOf(0)}H${xOf(W)}V${yOf(T)}${pw?`H${xOf((W+pw)/2)}V${yOf(pr.total)}H${xOf((W-pw)/2)}V${yOf(T)}`:''}H${ox}Z`;
 const c=input.cover,topIn=T-c.top-30;
 return <div className="footing-pour">
  <h4>การเทคอนกรีต (Pour stages)</h4>
  <div className="earthwork-input"><div>
   <div className="field"><span>จำนวน Stage การเท</span><div className="segmented" role="group" aria-label="จำนวน Stage การเท">{[1,2,3,4,5,6].map(k=><button key={k} type="button" disabled={readOnly} className={n===k?'active':''} onClick={()=>setCount(k)}>{k}</button>)}</div></div>
   {n>1&&<><div className="actions">{ped&&<button type="button" disabled={readOnly} onClick={footingThenPedestal}>ฐาน แล้วตอม่อ</button>}<button type="button" disabled={readOnly} onClick={even}>แบ่งเท่ากัน</button></div>
    <div className="table-scroll"><table className="subbase-table"><thead><tr><th>Stage (ล่าง → บน)</th><th>สูง (mm)</th><th>ช่วงจากใต้ฐาน (mm)</th>{lv&&<th>ระดับบน (m)</th>}<th className="num">คอนกรีต</th><th className="num">แบบหล่อ</th><th className="num">รอยต่อบน</th></tr></thead>
     <tbody>{pr.stages.map((s,k)=>{const q=stages?.find(x=>x.stage===s.stage),last=k===n-1;return <tr key={s.stage}>
      <td><span className="stage-swatch" style={{background:fills[k%fills.length]}}/>Stage {s.stage}</td>
      <td>{last?<b className={s.height>0?'computed':'computed error-text'}>{Math.round(s.height)} <small className="muted">(ส่วนที่เหลือ)</small></b>
       :<input aria-label={`ความสูง Stage ${s.stage}`} type="number" min={0} step={50} style={{width:80}} disabled={readOnly} value={input.pour.heights[k]??0} onChange={e=>{const v=Math.max(0,Number(e.target.value)||0);edit(i=>{i.pour.heights[k]=v;});}}/>}</td>
      <td>{Math.round(s.z0)} – {Math.round(s.z1)}{s.z0<T&&s.z1>T?<small className="block muted">ข้ามหลังฐาน</small>:null}</td>
      {lv&&<td>{levelOf(s.z1)}</td>}
      <td className="num">{q?`${fmt(q.concrete)} m³`:'—'}</td><td className="num">{q?`${fmt(q.formwork)} m²`:'—'}</td><td className="num">{last?'—':q?`${fmt(q.joint)} m²`:'—'}</td></tr>;})}</tbody></table></div>
    {pr.levels.map((J,k)=>{const j=jointRebar(input,k),inside=J<T-c.top-50;return <fieldset key={k} className="joint-rebar"><legend>เหล็กที่รอยต่อการเท {k+1} · Stage {k+1} / {k+2} · +{Math.round(J)} mm{lv?` · ระดับ ${levelOf(J)}`:''}</legend>
     {!inside?<p className="muted">รอยต่ออยู่ที่หลังฐานหรือในตอม่อ · เหล็กตอม่อ / Starter bar ต่อเนื่องผ่านรอยต่อเอง</p>:<>
     <label className="check"><input type="checkbox" disabled={readOnly} checked={j.mesh.enabled} onChange={e=>joint(k,x=>{x.mesh.enabled=e.target.checked;})}/>ตะแกรงเหล็ก X / Y ที่รอยต่อ</label>
     {j.mesh.enabled&&<div className="joint-row">
      <div className="segmented" role="group" aria-label="ตำแหน่งตะแกรง">{([['lower','ผิวบน Stage ล่าง'],['upper','ผิวล่าง Stage บน']] as const).map(([v,t])=><button key={v} type="button" disabled={readOnly} className={j.mesh.at===v?'active':''} onClick={()=>joint(k,x=>{x.mesh.at=v;})}>{t}</button>)}</div>
      <label className="inline">ระยะจากรอยต่อ {num(j.mesh.cover,v=>joint(k,x=>{x.mesh.cover=v;}),'ระยะตะแกรงจากรอยต่อ',56,5)}</label>
      <label className="inline">X {dsel(j.mesh.x.diameter,v=>joint(k,x=>{x.mesh.x.diameter=v;}),'ขนาดเหล็กตะแกรง X')} @ {num(j.mesh.x.spacing,v=>joint(k,x=>{x.mesh.x.spacing=v;}),'ระยะเหล็กตะแกรง X',60,25)}</label>
      <label className="inline">Y {dsel(j.mesh.y.diameter,v=>joint(k,x=>{x.mesh.y.diameter=v;}),'ขนาดเหล็กตะแกรง Y')} @ {num(j.mesh.y.spacing,v=>joint(k,x=>{x.mesh.y.spacing=v;}),'ระยะเหล็กตะแกรง Y',60,25)}</label>
      <div className="field joint-end"><span>ปลายเหล็ก ({j.mesh.at==='lower'?'งอฉากลงใน Stage ล่าง':'งอฉากขึ้นใน Stage บน'})</span><div className="joint-end-row"><div className="segmented" role="group" aria-label="ปลายเหล็กตะแกรงรอยต่อ">{([['straight','ตรง'],['standard','งอฉากมาตรฐาน'],['custom','กำหนดระยะงอ']] as const).map(([v,t])=><button key={v} type="button" disabled={readOnly} className={j.mesh.end===v?'active':''} onClick={()=>joint(k,x=>{x.mesh.end=v;})}>{t}</button>)}</div>
       {j.mesh.end==='custom'&&<label className="inline">ระยะงอ {num(j.mesh.leg,v=>joint(k,x=>{x.mesh.leg=v;}),'ระยะงอเหล็กตะแกรงรอยต่อ',64,25)} mm</label>}
       {j.mesh.end==='standard'&&<small className="muted">ตาม General Spec (ขอ 90°)</small>}</div></div></div>}
     <label className="check"><input type="checkbox" disabled={readOnly} checked={j.dowel.enabled} onChange={e=>joint(k,x=>{x.dowel.enabled=e.target.checked;})}/>เหล็กแนวตั้งทะลุรอยต่อ (V.D.B) จาก Stage ล่างขึ้น Stage บน</label>
     {j.dowel.enabled&&<div className="joint-row">
      <label className="inline">{dsel(j.dowel.diameter,v=>joint(k,x=>{x.dowel.diameter=v;}),'ขนาดเหล็กแนวตั้ง')} @ X {num(j.dowel.spacingX,v=>joint(k,x=>{x.dowel.spacingX=v;}),'ระยะเหล็กแนวตั้ง X',60,25)} × Y {num(j.dowel.spacingY,v=>joint(k,x=>{x.dowel.spacingY=v;}),'ระยะเหล็กแนวตั้ง Y',60,25)}</label>
      <label className="inline">ฝังลง Stage ล่าง {num(j.dowel.below,v=>joint(k,x=>{x.dowel.below=v;}),'ระยะฝังลง Stage ล่าง',64,25)} mm</label>
      <label className="inline">รูปทรง <select aria-label="รูปทรงเหล็กแนวตั้ง" disabled={readOnly} value={j.dowel.shape} onChange={e=>joint(k,x=>{x.dowel.shape=e.target.value as Joint['dowel']['shape'];})}>{dowelShapes.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
      {j.dowel.shape!=='00'&&<label className="inline">ขาบน {num(j.dowel.topLeg,v=>joint(k,x=>{x.dowel.topLeg=v;}),'ขาบน (เท่าของ d)',58,1)} d</label>}
      {(j.dowel.shape==='z'||j.dowel.shape==='21')&&<label className="inline">ขาล่าง {num(j.dowel.bottomLeg,v=>joint(k,x=>{x.dowel.bottomLeg=v;}),'ขาล่าง (เท่าของ d)',58,1)} d</label>}
      <small className="muted block">ขึ้นไปถึงใต้ตะแกรงบนของฐาน (หรือใต้รอยต่อถัดไป) · เว้นตำแหน่งในหน้าตัดตอม่อ · ใกล้ขอบ X+ ขางอหันกลับเข้าใน</small></div>}</>}
    </fieldset>;})}
    <p className="muted">ความสูงรวม {Math.round(pr.total)} mm (ฐาน {T}{pr.total>T?` + ตอม่อ ${Math.round(pr.total-T)}`:''}) · Stage สุดท้ายรับส่วนที่เหลือ · BOQ แยกคอนกรีต / แบบหล่อตาม Stage และรอยต่อการเท (Construction joint) · ยอดรวมเท่าเดิม</p></>}
   {n===1&&<p className="muted">เทครั้งเดียวทั้งฐาน{ped?'และตอม่อ':''} · เลือก 2 Stage ขึ้นไปเพื่อแยกปริมาณตามการเท</p>}
  </div>
  <svg className="pour-sketch" viewBox="0 0 300 230" role="img" aria-label="รูปด้านการเทคอนกรีตตาม Stage">
   <defs><clipPath id="pour-clip"><path d={outline}/></clipPath></defs>
   <g clipPath="url(#pour-clip)">{pr.stages.map((s,k)=><rect key={s.stage} x={0} width={300} y={yOf(s.z1)} height={Math.max(0,(s.z1-s.z0)*sc)} fill={fills[k%fills.length]}/>)}</g>
   <path d={outline} fill="none" stroke="currentColor" strokeWidth={1.2}/>
   {pr.levels.map((J,k)=>{const j=jointRebar(input,k),inside=J<T-c.top-50,ys=yOf(J),x0=xOf(c.side),x1=xOf(W-c.side),meshZ=j.mesh.at==='lower'?J-j.mesh.cover:J+j.mesh.cover;
    const step=Math.max(6,Math.min(W/2,j.dowel.spacingX)*sc),xs:number[]=[];for(let x=x0+step/2;x<x1-2;x+=step)xs.push(x);
    const top=yOf(k+1<pr.levels.length&&pr.levels[k+1]<topIn?pr.levels[k+1]-50:topIn),bot=yOf(Math.max(c.bottom+40,J-j.dowel.below)),dl=j.dowel.shape==='00'?0:Math.min(step*.6,15*j.dowel.diameter*sc),bl=j.dowel.shape==='z'?-Math.min(step*.5,12*j.dowel.diameter*sc):j.dowel.shape==='21'?Math.min(step*.5,12*j.dowel.diameter*sc):0;
    return <g key={k}>
     {inside&&j.mesh.enabled&&<g><polyline points={(()=>{const y=yOf(meshZ),l=j.mesh.end==='straight'?0:(j.mesh.end==='custom'?j.mesh.leg:12*j.mesh.x.diameter)*sc*(j.mesh.at==='lower'?1:-1);return l?`${x0},${y+l} ${x0},${y} ${x1},${y} ${x1},${y+l}`:`${x0},${y} ${x1},${y}`;})()} fill="none" stroke="#1f6f5c" strokeWidth={1}/>{xs.map(x=><circle key={x} cx={x} cy={yOf(meshZ)-2.2} r={1.4} fill="#1f6f5c"/>)}</g>}
     {inside&&j.dowel.enabled&&xs.map(x=><polyline key={x} points={`${bl?`${x+bl},${bot} `:''}${x},${bot} ${x},${top}${dl?` ${x+dl},${top}`:''}`} fill="none" stroke="#7a3fa0" strokeWidth={1}/>)}
     <line x1={ox-8} x2={xOf(W)+8} y1={ys} y2={ys} stroke="#c0392b" strokeDasharray="5 3"/><text x={xOf(W)+10} y={ys+3} fontSize={9} fill="#c0392b">{lv?levelOf(J):`+${Math.round(J)}`}</text></g>;})}
   {pr.stages.map(s=>{const h=(s.z1-s.z0)*sc;return h>10?<text key={s.stage} x={xOf(W/2)} y={yOf((s.z0+s.z1)/2)+3} fontSize={9} textAnchor="middle">Stage {s.stage}</text>:null;})}
   {lv&&<><text x={xOf(W)+10} y={yOf(T)-2} fontSize={9}>T.O.F. {signed(lv.top)}</text><text x={xOf(W)+10} y={base+3} fontSize={9}>B.O.F. {signed(lv.bottom)}</text></>}
   <line x1={ox-8} x2={xOf(W)+8} y1={base} y2={base} stroke="currentColor" strokeWidth={.6}/>
  </svg></div>
 </div>;
}
