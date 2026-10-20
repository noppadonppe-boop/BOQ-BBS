import {useMemo,useState,type ReactNode} from 'react';
import {Maximize2,Minimize2} from 'lucide-react';
import type {Member} from '../domain/model';
import type {ElementInput} from '../domain/elementInput';
import {buildView,defaultCuts,markColors,renderView,viewHeight,type ViewRow,type ViewSpec} from '../domain/elementViews';
import {PrimsSvg} from './PrimsSvg';

type ViewKey='plan'|'secX'|'secY';
const W=540;
const fmt=(v:number)=>Math.round(v).toLocaleString('en-US');

/** Interactive plan and two sections generated from the member that the
 * structured input would produce (same data as BOQ / Bar cut list). */
export function ElementGraphic({member,rows,input}:{member:Member;rows:ViewRow[];input:ElementInput}){
 const [view,setView]=useState<'all'|ViewKey>('all'),[expanded,setExpanded]=useState(false),[hover,setHover]=useState('');
 const [cutY,setCutY]=useState<number|undefined>(),[cutX,setCutX]=useState<number|undefined>();
 const base=defaultCuts(member,rows),cy=Math.min(member.y,Math.max(0,cutY??base.y)),cx=Math.min(member.x,Math.max(0,cutX??base.x));
 const colors=useMemo(()=>markColors(rows),[rows]);
 const views:{key:ViewKey;title:string;node:ReactNode}[]=[
  {key:'plan',title:'แปลน (มองจากด้านบน)',node:<View member={member} rows={rows} input={input} spec={{axes:[0,1]}} colors={colors} hover={hover} cuts={{x:cx,y:cy}}/>},
  {key:'secX',title:`รูปตัด X–X · ที่ Y = ${fmt(cy)} mm`,node:<><View member={member} rows={rows} input={input} spec={{axes:[0,2],normal:1,cut:cy}} colors={colors} hover={hover}/><Cut label="ตำแหน่งตัด Y" value={cy} max={member.y} onChange={setCutY}/></>},
  {key:'secY',title:`รูปตัด Y–Y · ที่ X = ${fmt(cx)} mm`,node:<><View member={member} rows={rows} input={input} spec={{axes:[1,2],normal:0,cut:cx}} colors={colors} hover={hover}/><Cut label="ตำแหน่งตัด X" value={cx} max={member.x} onChange={setCutX}/></>},
 ];
 return <section className={`element-graphic${expanded?' expanded':''}`} aria-label="รูปแปลนและรูปตัด">
  <header><b>รูปแปลน / รูปตัด · {member.code}</b>
   <div className="segmented">{([['all','ทั้งหมด'],['plan','แปลน'],['secX','ตัด X–X'],['secY','ตัด Y–Y']] as const).map(([k,l])=><button key={k} className={view===k?'active':''} onClick={()=>setView(k)}>{l}</button>)}</div>
   <button className="icon" onClick={()=>setExpanded(!expanded)} aria-label={expanded?'ย่อหน้าต่าง':'ขยายหน้าต่าง'}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button></header>
  <div className="graphic-views">{views.filter(v=>view==='all'||view===v.key).map(v=><figure key={v.key}><figcaption>{v.title}</figcaption>{v.node}</figure>)}</div>
  <p className="graphic-covers">{coverText(input)}</p>
  <table className="graphic-legend"><tbody>{rows.map(r=><tr key={r.id} onMouseEnter={()=>setHover(r.id)} onMouseLeave={()=>setHover('')} className={hover===r.id?'active':''}><td><i style={{background:colors.get(r.id)}}/></td><td>{r.mark}</td><td>{r.note}</td><td>{r.diameter<=9?'RB':'DB'}{r.diameter}</td><td className="num">{r.count} เส้น</td></tr>)}</tbody></table>
  <p className="muted">มิติ mm · เส้นประสีส้ม = พื้นที่อ้างอิงเหล็กโผล่ (ไม่คิดปริมาณ) · เลื่อนตำแหน่งตัดได้ · ชี้รายการเพื่อเน้น Mark</p>
 </section>;
}

function View({member,rows,input,spec,colors,hover,cuts}:{member:Member;rows:ViewRow[];input:ElementInput;spec:ViewSpec;colors:Map<string,string>;hover:string;cuts?:{x:number;y:number}}){
 const data=useMemo(()=>buildView(member,rows,input,spec),[member,rows,input,spec.axes[0],spec.axes[1],spec.normal,spec.cut]);
 const H=viewHeight(data,W,spec.normal===undefined?380:300),prims=useMemo(()=>renderView(data,{x:0,y:0,w:W,h:H},{colors,cuts}),[data,H,colors,cuts?.x,cuts?.y]);
 return <svg className="graphic-view" viewBox={`0 0 ${W} ${H}`} role="img" fontFamily="Sarabun, sans-serif"><PrimsSvg prims={prims} hover={hover}/></svg>;
}

function Cut({label,value,max,onChange}:{label:string;value:number;max:number;onChange:(v:number)=>void}){
 return <label className="graphic-cut"><span>{label}</span><input type="range" min={0} max={Math.max(1,Math.round(max))} step={1} value={Math.round(value)} onChange={e=>onChange(Number(e.target.value))}/><input type="number" value={Math.round(value)} onChange={e=>onChange(Number(e.target.value)||0)}/></label>;
}

export function coverText(input:ElementInput){
 const names:Record<string,string>={bottom:'ล่าง',top:'บน',side:'ข้าง',edge:'ขอบ',face:'ผิว'};
 const base=Object.entries(input.cover).map(([k,v])=>`${names[k]||k} ${v}`).join(' · ');
 const col=input.category==='Foundation'&&input.column.type!=='none'?` · ${input.column.type==='pedestal'?'เสาตอม่อ':'Starter'}${input.column.columnNo?` ${input.column.columnNo}`:''} ${input.column.cover}`:'';
 return `Cover (mm): ${base}${col}`;
}
