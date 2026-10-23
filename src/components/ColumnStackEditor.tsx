import {ArrowUp,Plus,Trash2} from 'lucide-react';
import {columnPresets,columnStackLayout,newColumnStorey,tiePatternInfo,tiePatterns,type ColumnInput,type ColumnStorey,type TiePattern} from '../domain/elementInput';
import {NumInput} from './EditorControls';

const diameters=[12,16,20,25,28,32,36,40];
const barName=(d:number)=>`${d<=9?'RB':'DB'}${d}`;
type Edit=(f:(i:ColumnInput)=>void)=>void;
/** Main bar total of a storey (corner bundles + side bars). */
const mainCount=(s:ColumnStorey)=>4*s.main.corner.count+2*(s.main.sideX.count+s.main.sideY.count);
const mainText=(s:ColumnStorey)=>{const m=s.main,ds=[...new Set([m.corner.diameter,m.sideX.count?m.sideX.diameter:0,m.sideY.count?m.sideY.diameter:0].filter(Boolean))];return `${mainCount(s)}${ds.map(barName).join('/')}`;};
const tieText=(s:ColumnStorey)=>`${s.tie.sets||''}${barName(s.tie.diameter)}@${s.tie.s1}(${s.tie.diameter}@${s.tie.s2})`;

/** Column stack = the column table of one mark: a row per storey (top row = highest storey as on the drawings). */
export function ColumnStackEditor({input,edit,readOnly}:{input:ColumnInput;edit:Edit;readOnly:boolean}){
 const st=input.stack,S=st.storeys,lay=S.length?columnStackLayout(input):undefined;
 const num=(v:number,on:(v:number)=>void,label:string,width=64)=><NumInput aria-label={label} type="number" min={0} step="any" style={{width}} disabled={readOnly} value={v} onChange={e=>on(Math.max(0,Number(e.target.value)||0))}/>;
 const int=(v:number,on:(v:number)=>void,label:string,width=44)=><NumInput aria-label={label} type="number" min={0} step={1} style={{width}} disabled={readOnly} value={v} onChange={e=>on(Math.max(0,Math.trunc(Number(e.target.value)||0)))}/>;
 const dsel=(v:number,on:(v:number)=>void,label:string,list=diameters)=><select aria-label={label} disabled={readOnly} value={v} onChange={e=>on(Number(e.target.value))}>{[...new Set([...list,v])].sort((a,b)=>a-b).map(d=><option key={d} value={d}>{barName(d)}</option>)}</select>;
 const row=(k:number,f:(s:ColumnStorey)=>void)=>edit(i=>f(i.stack.storeys[k]));
 const preset=(k:number,id:string)=>row(k,s=>{const p=columnPresets.find(x=>x.id===id);if(!p)return;s.width=p.w;s.depth=p.d;
  s.main={corner:{diameter:32,count:2},sideX:{diameter:32,count:p.sx},sideY:{diameter:32,count:p.sy},diameter:32,count:8+2*(p.sx+p.sy)};s.tie={...s.tie,diameter:12,pattern:p.pattern as TiePattern,s1:200,s2:100};});
 const order=S.map((_,k)=>k).reverse();
 return <div className="column-stack">
  <div className="form-grid stack-ends">
   <label className="check"><input type="checkbox" disabled={readOnly} checked={st.footing.enabled} onChange={e=>edit(i=>{i.stack.footing.enabled=e.target.checked;})}/>เหล็กยืนฝังในฐานราก งอ 12d</label>
   {st.footing.enabled&&<label className="field"><span>ระยะฝังจากหลังฐาน (mm)</span>{num(st.footing.depth,v=>edit(i=>{i.stack.footing.depth=v;}),'ระยะฝังในฐานราก',90)}</label>}
   <label className="field"><span>ปลายบนสุด</span><select disabled={readOnly} value={st.top} onChange={e=>edit(i=>{i.stack.top=e.target.value as 'fta'|'none';})}><option value="fta">F.T.A งอ 12d เข้าคาน/หัวเสา</option><option value="none">ตัดที่ cover</option></select></label>
   <label className="field"><span>การต่อเหล็กยืน</span><select disabled={readOnly} value={st.splice.type} onChange={e=>edit(i=>{i.stack.splice.type=e.target.value as 'coupler'|'lap';})}><option value="coupler">Coupler (ข้อต่อทางกล) 50 %</option><option value="lap">ทาบ (ต้องได้รับอนุมัติ)</option></select></label>
   <label className="field"><span>{st.splice.type==='coupler'?'ระยะเหลื่อมกลุ่ม Coupler (mm)':'ระยะเหลื่อมกลุ่มต่อทาบ (mm)'}</span>{num(st.splice.stagger,v=>edit(i=>{i.stack.splice.stagger=v;}),'ระยะเหลื่อม',90)}</label>
  </div>
  <div className="table-scroll"><table className="subbase-table column-table"><thead><tr><th>ชั้น (บน → ล่าง)</th><th>สูงชั้น</th><th>คานลึก</th><th>หน้าตัด b × d</th><th>หน้าตัดจากแบบ</th><th>เหล็กมุม (ต่อมุม)</th><th>เหล็กด้าน X / Y</th><th>คู่</th><th>ปลอก · ชิ้น/ชุด · รูปแบบ</th><th>S1 / S2</th><th>ตามตาราง</th><th/></tr></thead>
   <tbody>{order.map(k=>{const s=S[k],l=lay?.storeys[k];return <tr key={k}>
    <td><input aria-label="ชื่อชั้น" maxLength={40} style={{width:110}} disabled={readOnly} value={s.name} onChange={e=>row(k,x=>{x.name=e.target.value.slice(0,40);})}/>{l&&<small className="block muted">{(l.z0/1000).toFixed(2)} → {(l.z1/1000).toFixed(2)} m{l.first?' · ชั้นแรก H/3':''}</small>}</td>
    <td>{num(s.height,v=>row(k,x=>{x.height=v;}),'ความสูงชั้น')}</td><td>{num(s.beamDepth,v=>row(k,x=>{x.beamDepth=v;}),'ความลึกคาน',56)}</td>
    <td><span className="bar-cell">{num(s.width,v=>row(k,x=>{x.width=v;}),'กว้าง X',56)}×{num(s.depth,v=>row(k,x=>{x.depth=v;}),'ลึก Y',56)}</span></td>
    <td><select aria-label="หน้าตัดจากแบบ" disabled={readOnly} value="" onChange={e=>preset(k,e.target.value)}><option value="">—</option>{columnPresets.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></td>
    <td><span className="bar-cell">{dsel(s.main.corner.diameter,v=>row(k,x=>{x.main.corner.diameter=v;x.main.diameter=v;}),'เหล็กมุม')}<select aria-label="จำนวนต่อมุม" disabled={readOnly} value={s.main.corner.count} onChange={e=>row(k,x=>{x.main.corner.count=Number(e.target.value);})}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></span></td>
    <td><span className="bar-cell">{int(s.main.sideX.count,v=>row(k,x=>{x.main.sideX.count=v;}),'เหล็กด้าน X')}/{int(s.main.sideY.count,v=>row(k,x=>{x.main.sideY.count=v;}),'เหล็กด้าน Y')}{dsel(s.main.sideX.diameter,v=>row(k,x=>{x.main.sideX.diameter=v;x.main.sideY.diameter=v;}),'ขนาดเหล็กด้าน')}</span></td>
    <td><input type="checkbox" aria-label="เหล็กด้านมัดคู่" title="เหล็กด้านมัดคู่ (2 เส้นชิดกัน)" disabled={readOnly} checked={s.main.sideBundle===2} onChange={e=>row(k,x=>{x.main.sideBundle=e.target.checked?2:1;})}/></td>
    <td><span className="bar-cell">{dsel(s.tie.diameter,v=>row(k,x=>{x.tie.diameter=v;}),'ขนาดปลอก',[9,10,12,16])}{int(s.tie.sets,v=>row(k,x=>{x.tie.sets=v;}),'ชิ้นต่อชุด',40)}
     <select aria-label="รูปแบบปลอกใน" disabled={readOnly} value={s.tie.pattern} onChange={e=>row(k,x=>{x.tie.pattern=e.target.value as TiePattern;})}>{tiePatterns.map(p=><option key={p} value={p}>{tiePatternInfo[p].label}</option>)}</select></span></td>
    <td><span className="bar-cell">{num(s.tie.s1,v=>row(k,x=>{x.tie.s1=v;}),'S1',52)}/{num(s.tie.s2,v=>row(k,x=>{x.tie.s2=v;}),'S2',52)}</span></td>
    <td><small>{s.width}×{s.depth}</small><small className="block">{mainText(s)}</small><small className="block">{tieText(s)}</small></td>
    <td><span className="bar-cell">{k>0&&<button type="button" className="icon-button" title="ใช้หน้าตัด / เหล็ก / ปลอกเหมือนชั้นล่าง" disabled={readOnly} onClick={()=>edit(i=>{const b=i.stack.storeys[k-1],x=i.stack.storeys[k];i.stack.storeys[k]={...structuredClone(b),name:x.name,height:x.height,beamDepth:x.beamDepth};})}><ArrowUp size={13}/></button>}
     <button type="button" className="icon-button" aria-label="ลบชั้น" disabled={readOnly||S.length<2} onClick={()=>edit(i=>{i.stack.storeys.splice(k,1);})}><Trash2 size={13}/></button></span></td></tr>;})}</tbody></table></div>
  <div className="actions"><button type="button" disabled={readOnly||S.length>=20} onClick={()=>edit(i=>{const top=i.stack.storeys.at(-1);i.stack.storeys.push(newColumnStorey(i,top,`ชั้น ${i.stack.storeys.length+1}`));})}><Plus size={14}/>เพิ่มชั้นด้านบน (คัดลอกชั้นบนสุด)</button></div>
  <p className="muted">ตามตารางเสา: เหล็กยืน nYd · ปลอก nYd@S1(d@S2) (n = จำนวนชิ้นต่อชุด ใช้ตรวจกับรูปแบบที่เลือก) · ปลอกถี่ S2: ชั้นแรกบนฐาน H/3 ล่าง, ชั้นอื่น H/6 ล่าง, H/6 บน + ช่วงคาน · H = ความสูงชั้น − ความลึกคาน · ต่อเหล็กยืนทุกชั้นเหนือช่วงปลอกถี่ล่าง สลับ 50 % · หน้าตัดร่นไม่เกิน 75 mm ต่อด้าน (เหล็กเท่าเดิม): ดัด Crank 1:6 ใต้ระดับพื้น ต่อขึ้นไปเส้นเดิม · ร่นมากกว่านั้น / เหล็กเปลี่ยน: เหล็กชั้นล่างงอปิด เหล็กชั้นบนฝังลง</p>
 </div>;
}
