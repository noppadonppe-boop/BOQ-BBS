import {useMemo,useState,type ReactNode} from 'react';
import {Copy,Scissors,Trash2,X as Close} from 'lucide-react';
import type {Bar,Member,Spec,Vec3} from '../domain/model';
import {takeoff} from '../domain/engine';
import {detectShapeCode,isSketchBar,layoutOf,toView,type LayoutRule,type P2,type SketchEndSet} from '../domain/rebarSketch';
import {isPresetBar} from '../domain/partRebar';
import {Field,number} from './EditorControls';
import {DIAS,LayoutFields,viewOfBar} from './RebarSketch';

const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');
const letter=(i:number)=>String.fromCharCode(65+i%26);
const len=(a:Vec3,b:Vec3)=>Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
/** Polyline with segment i set to length L (direction kept); the points after it move with it. */
export function withSegment(points:Vec3[],i:number,L:number):Vec3[]{
 const a=points[i],b=points[i+1],l=len(a,b);if(!b||l<1e-9||!(L>0))return points;
 const d=[0,1,2].map(k=>(b[k]-a[k])*(L/l-1)) as Vec3;
 return points.map((p,j)=>j<=i?p:[p[0]+d[0],p[1]+d[1],p[2]+d[2]].map(v=>Number(v.toFixed(3))) as Vec3);
}

/** Bar shape drawn on its two longest axes (not to scale across axes), segments lettered with their lengths. */
export function BarShapeSvg({points,color='#0f766e',width=420,height=240,ends}:{points:Vec3[];color?:string;width?:number;height?:number;ends?:{start:number;end:number}}){
 if(points.length<2)return null;
 const spans=[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))-Math.min(...points.map(p=>p[i]))),axes=spans.map((s,i)=>({s,i})).sort((a,b)=>b.s-a.s).slice(0,2).map(v=>v.i);
 const lo=axes.map(a=>Math.min(...points.map(p=>p[a]))),M=36,su=(width-2*M)/(spans[axes[0]]||1),sv=spans[axes[1]]>1e-6?(height-2*M)/spans[axes[1]]:0,s=Math.min(su,sv||su);
 const ox=M+((width-2*M)-spans[axes[0]]*s)/2,oy=height-M-((height-2*M)-spans[axes[1]]*s)/2;
 const P=(p:Vec3):P2=>[ox+(p[axes[0]]-lo[0])*s,oy-(p[axes[1]]-lo[1])*s];
 const pts=points.map(P);
 return <svg className="bar-shape-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="รูปร่างเหล็ก">
  <polyline points={pts.map(p=>p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round"/>
  {pts.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={3} fill="#fff" stroke={color} strokeWidth={1.5}/>)}
  {pts.slice(1).map((p,i)=>{const q=pts[i],mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2,dx=p[0]-q[0],dy=p[1]-q[1],l=Math.hypot(dx,dy)||1,nx=-dy/l*14,ny=dx/l*14;
   return <text key={i} x={mx+nx} y={my+ny} textAnchor="middle" dominantBaseline="middle" className="bar-shape-label">{letter(i)} {fmt(len(points[i],points[i+1]))}</text>;})}
  {ends&&(()=>{const a=pts[ends.start],b=pts[pts.length-1-ends.end];return a&&b?<g className="bar-shape-ends"><circle cx={a[0]} cy={a[1]} r={6} fill="#15803d"/><text x={a[0]+9} y={a[1]-9}>A ต้น</text><circle cx={b[0]} cy={b[1]} r={6} fill="#b91c1c"/><text x={b[0]+9} y={b[1]-9}>ท้าย</text></g>:null;})()}
  <text x={width-6} y={height-6} textAnchor="end" className="bar-shape-axis">{'XYZ'[axes[0]]} → · {'XYZ'[axes[1]]} ↑ · ไม่ตามมาตราส่วน</text>
 </svg>;
}

/** Window to edit one bar set: Mark, size, segment lengths (shape), layout (group / single) and ends, with the shape
 * and cut length / weight updated live. Preset bars are read only until taken over (“แยกจาก Preset”). */
export function BarEditModal({bar,m,spec,readOnly,gradeOf,onSave,onDetach,onDuplicate,onDelete,onClose,ends}:{bar:Bar;m:Member;spec:Spec;readOnly:boolean;gradeOf:(d:number)=>string;
 onSave:(b:Bar)=>void;onDetach?:()=>void;onDuplicate:()=>void;onDelete:()=>void;onClose:()=>void;
 ends?:(b:Bar,apply:(points:P2[],e:SketchEndSet,notes:string[])=>void)=>ReactNode}){
 const [d,setD]=useState<Bar>(()=>structuredClone(bar)),[notes,setNotes]=useState<string[]>([]);
 const preset=isPresetBar(bar),locked=readOnly||preset,view=viewOfBar(d),poly=d.shape==='polyline'&&d.points.length>=2;
 const row=useMemo(()=>{try{return takeoff({...m,bars:[d],placementContext:undefined},spec).rows[0];}catch{return undefined;}},[d,m,spec]);
 const k=d.distributionAxis?'XYZ'.indexOf(d.distributionAxis):-1;
 const layout:LayoutRule={rule:d.count===1?'single':'count',spacing:200,count:d.count,from:d.distributionStart,to:d.distributionEnd};
 const setLayout=(l:LayoutRule)=>{const n=layoutOf(l),shift=n.from-d.distributionStart;setD({...d,count:n.count,distributionStart:n.from,distributionEnd:n.to,points:k>=0?d.points.map(p=>{const q=[...p] as Vec3;q[k]=Number((q[k]+shift).toFixed(3));return q;}):d.points});};
 const code=(pts:Vec3[])=>view?detectShapeCode(pts.map(p=>toView(view,p))):d.shapeCode;
 const setPoints=(pts:Vec3[])=>setD({...d,points:pts,shapeCode:code(pts)});
 const dirty=JSON.stringify(d)!==JSON.stringify(bar);
 const close=()=>{if(dirty&&!confirm('ยังไม่ได้บันทึกการแก้ไข · ปิดหน้าต่าง?'))return;onClose();};
 return <div className="e3d-shade bar-edit-shade" onMouseDown={e=>{if(e.target===e.currentTarget)close();}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}}}>
  <div className="bar-edit" role="dialog" aria-label={`แก้ไขเหล็ก ${bar.mark}`}>
   <div className="e3d-header"><div><h3>แก้ไขเหล็ก · {d.mark}</h3><p className="muted">{d.note||'—'}</p></div>
    <button type="button" className="e3d-close" aria-label="ปิด" onClick={close}><Close size={18}/></button></div>
   {preset&&<p className="notice">ชุดนี้เป็นเหล็ก Preset ของชิ้นส่วน (สร้างใหม่ทุกครั้งที่รูปทรง / Preset เปลี่ยน) · แก้ขนาด / ระยะในแผง “หน้าที่ของชิ้น” หรือกด “แยกจาก Preset” เพื่อแก้รูปร่างเอง{onDetach&&!readOnly?<button type="button" onClick={onDetach}><Scissors size={13}/>แยกจาก Preset</button>:null}</p>}
   <div className="bar-edit-body">
    <div className="bar-edit-shape"><BarShapeSvg points={d.points} ends={{start:d.ends?.start.n||0,end:d.ends?.end.n||0}}/>
     {row&&<table className="shape-qty"><tbody><tr><td>Shape code</td><td>{d.shapeCode||'—'}</td></tr><tr><td>ยาวตัด</td><td>{fmt(row.cutLength)} mm</td></tr><tr><td>จำนวน</td><td>{row.count}</td></tr><tr><td>น้ำหนัก / ชุด</td><td>{number(row.weight,2)} kg</td></tr></tbody></table>}
     {notes.length>0&&<p className="notice warning">{notes.join(' · ')}</p>}</div>
    <div className="bar-edit-form">
     <div className="form-grid"><Field label="Mark" value={d.mark} disabled={locked} onChange={v=>{const t=String(v).trim().slice(0,32);if(t)setD({...d,mark:t});}}/>
      <label className="field"><span>ขนาด · เกรด {gradeOf(d.diameter)}</span><select disabled={locked} value={d.diameter} onChange={e=>{const dia=Number(e.target.value);setD({...d,diameter:dia,grade:gradeOf(dia)});}}>{DIAS.map(x=><option key={x} value={x}>{x<=9?'RB':'DB'}{x}</option>)}</select></label></div>
     {poly&&<><h4>ขนาดแต่ละช่วง (ระยะศูนย์กลาง mm)</h4>
      <div className="bar-segs">{d.points.slice(1).map((p,i)=><label key={i} className="field"><span>{letter(i)}</span><input type="number" min={1} disabled={locked} value={Math.round(len(d.points[i],p))} onChange={e=>{const L=Number(e.target.value);if(L>0)setPoints(withSegment(d.points,i,L));}}/></label>)}</div>
      <p className="muted">แก้ความยาวช่วงใดแล้ว ช่วงถัดไปเลื่อนตาม (ทิศเดิม) · ลากจุดในมุมมองเพื่อเปลี่ยนทิศ</p></>}
     {d.distributionAxis?<><h4>เหล็กกลุ่ม / เดี่ยว · กระจายตามแกน {d.distributionAxis}</h4><LayoutFields layout={layout} onChange={setLayout} disabled={locked}/></>
      :d.offsets?<p className="muted">วางตามตำแหน่งรายแท่ง {d.count} ตำแหน่ง (offsets)</p>:null}
     {!locked&&isSketchBar(d)&&view&&ends?.(d,(points,e,n)=>{setNotes(n);setD(x=>({...x,points:points.map(p=>{const w=[...x.points[0]] as Vec3,a=view.kind==='sx'?[0,2]:view.kind==='sy'?[1,2]:[0,1];w[a[0]]=p[0];w[a[1]]=p[1];return w.map(v=>Number(v.toFixed(3))) as Vec3;}),ends:e,shapeCode:detectShapeCode(points)}));})}
    </div>
   </div>
   <div className="bar-edit-foot">
    <button type="button" disabled={readOnly} onClick={onDuplicate}><Copy size={13}/>ทำสำเนา</button>
    {!preset&&<button type="button" className="danger-text" disabled={readOnly} onClick={()=>{if(confirm(`ลบชุดเหล็ก ${bar.mark}?`))onDelete();}}><Trash2 size={13}/>ลบ</button>}
    <span className="spacer"/>
    <button type="button" onClick={close}>ยกเลิก</button>
    <button type="button" className="primary" disabled={locked||!dirty} onClick={()=>onSave({...d,placementConfirmed:false})}>บันทึกและปิด</button>
   </div>
  </div>
 </div>;
}
