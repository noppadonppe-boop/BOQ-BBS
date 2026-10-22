import {useMemo,useState,type ReactNode} from 'react';
import {columnMainMax,columnTieLayout,tiePatternInfo,tiePatterns,tieZoneKeys,type ColumnInput,type TiePattern,type TieZoneKey} from '../domain/elementInput';
import {roundedPath} from '../domain/engine';

type Props={input:ColumnInput;readOnly:boolean;set:(path:string,value:unknown)=>void;num:(label:string,path:string,unit?:string)=>ReactNode;dia:(label:string,path:string)=>ReactNode};
const zoneOrder:TieZoneKey[]=['upper','middle','lower'];
const zoneName:Record<TieZoneKey,string>={upper:'บน (Upper)',middle:'กลาง (Middle)',lower:'ล่าง (Lower)'};
const SET1='#167561',SET2='#c2410c';

/** Column ties in two sets × three zones: set 1 = perimeter hoop around the corner bars,
 * set 2 = supplementary ties chosen from a pattern gallery (per zone). */
export function ColumnTieEditor({input,readOnly,set,num,dia}:Props){
 const [zone,setZone]=useState<TieZoneKey>('middle');
 const t=input.rebar.tie,rect=input.shape==='rect',H=input.height;
 const lengths:Record<TieZoneKey,number>={lower:t.lower.length,upper:t.upper.length,middle:Math.max(0,H-t.lower.length-t.upper.length)};
 const hoopPath:Record<TieZoneKey,string>={lower:'rebar.tie.lower.spacing',middle:'rebar.tie.spacing',upper:'rebar.tie.upper.spacing'};
 const lengthPath:Partial<Record<TieZoneKey,string>>={lower:'rebar.tie.lower.length',upper:'rebar.tie.upper.length'};
 const dm=columnMainMax(input),ready=rect&&input.width>0&&input.depth>0&&dm>0&&2*(input.cover.side+t.diameter+dm*(input.rebar.main.corner.count>1?1.5:1))<Math.min(input.width,input.depth);
 const layouts=useMemo(()=>ready?Object.fromEntries(tiePatterns.map(p=>[p,columnTieLayout(input,p,input.detailing)])) as Record<TiePattern,ReturnType<typeof columnTieLayout>>:undefined,[ready,input]);
 const pick=(p:TiePattern,all=false)=>{for(const k of all?zoneOrder:[zone])set(`rebar.tie.inner.${k}.pattern`,p);};
 const active=t.inner[zone].pattern;

 return <div className="tie-editor">
  <div className="tie-sets">
   <div className="tie-set"><span className="tie-set-key" style={{background:SET1}}/><div><b>ชุดที่ 1 · ปลอกรอบมุม</b><small>ปลอกสี่เหลี่ยมรัดเหล็กมุม งอฉาก 90° อ้อมเหล็กมุม</small></div>{dia('ขนาด','rebar.tie.diameter')}</div>
   <div className="tie-set"><span className="tie-set-key" style={{background:SET2}}/><div><b>ชุดที่ 2 · ปลอกใน / เหล็กรัดขวาง</b><small>{rect?'เลือกรูปแบบแยกตามโซน · ระยะห่างแยกจากชุดที่ 1':'เสากลมไม่รองรับชุดที่ 2'}</small></div>{rect&&dia('ขนาด','rebar.tie.inner.diameter')}</div>
  </div>
  <div className="tie-zone-layout">
   <TieElevation input={input} lengths={lengths} zone={zone} onZone={setZone}/>
   <div className="table-scroll"><table className="tie-zone-table"><thead><tr><th>โซน</th><th>ความยาว (mm)</th><th>ชุดที่ 1 @ (mm)</th>{rect&&<><th>ชุดที่ 2 รูปแบบ</th><th>ชุดที่ 2 @ (mm)</th></>}</tr></thead>
    <tbody>{zoneOrder.map(k=>{const on=k==='middle'||lengths[k]>0,p=t.inner[k].pattern,lay=layouts?.[p];return <tr key={k} className={`${zone===k?'active':''} ${on?'':'off'}`} onClick={()=>setZone(k)}>
     <th scope="row">{zoneName[k]}{!on&&<small className="block">ไม่มีโซน</small>}</th>
     <td>{lengthPath[k]?num('',lengthPath[k]!,''):<input aria-label="ความยาวโซนกลาง" value={lengths.middle} disabled readOnly title="ความสูงเสา − โซนบน − โซนล่าง"/>}</td>
     <td>{num('',hoopPath[k],'')}</td>
     {rect&&<><td><button type="button" className={`tie-pattern-chip ${zone===k?'active':''}`} onClick={()=>setZone(k)} title="คลิกแล้วเลือกรูปแบบด้านล่าง">{lay&&<TiePlan lay={lay} size={34}/>}<span>{tiePatternInfo[p].label}</span></button></td>
     <td>{p==='none'?<span className="muted">—</span>:num('',`rebar.tie.inner.${k}.spacing`,'')}</td></>}
    </tr>;})}</tbody></table>
    <p className="muted">โซนล่างวัดจากระดับล่างเสา · โซนบนวัดจากระดับบนเสา · โซนกลาง = ความสูงที่เหลือ · ความยาวโซน 0 = ไม่มีโซนนั้น · ชุดที่ 2 วางซ้อนเหนือปลอกชุดที่ 1 ของชั้นเดียวกัน</p></div>
  </div>
  {rect&&<div className="tie-gallery">
   <div className="tie-gallery-head"><div><b>รูปแบบปลอกชุดที่ 2 · โซน{zoneName[zone]}</b><small>{tiePatternInfo[active].hint}</small></div>
    <div className="actions"><div className="segmented" role="group" aria-label="เลือกโซน">{zoneOrder.map(k=><button key={k} type="button" className={zone===k?'active':''} onClick={()=>setZone(k)}>{zoneName[k].split(' ')[0]}</button>)}</div>
     <button type="button" disabled={readOnly} onClick={()=>pick(active,true)} title="ใช้รูปแบบที่เลือกกับทุกโซน">ใช้กับทุกโซน</button></div></div>
   {!layouts?<p className="notice">กรอกขนาดหน้าตัด จำนวน/ขนาดเหล็กยืน และ cover ให้ครบเพื่อแสดงรูปแบบ</p>:
   <div className="tie-pattern-grid" role="listbox" aria-label="รูปแบบปลอกชุดที่ 2">{tiePatterns.map(p=>{const lay=layouts[p],used=zoneOrder.filter(k=>t.inner[k].pattern===p),bad=lay.issues.length>0||(!lay.pieces.length&&p!=='none'&&p!=='auto');
    return <button key={p} type="button" role="option" aria-selected={active===p} disabled={readOnly} className={`tie-pattern-card ${active===p?'selected':''} ${bad?'unfit':''}`} onClick={()=>pick(p)} title={tiePatternInfo[p].hint}>
     <TiePlan lay={lay} size={112}/>
     <b>{tiePatternInfo[p].label}</b>
     <small>{lay.issues[0]||lay.note||pieceSummary(lay.pieces)}</small>
     {used.length>0&&<span className="tie-pattern-used">{used.map(k=>zoneName[k].split(' ')[0]).join(' · ')}</span>}
    </button>;})}</div>}
  </div>}
 </div>;
}

const pieceSummary=(pieces:ReturnType<typeof columnTieLayout>['pieces'])=>{
 const closed=pieces.filter(p=>p.kind==='closed').length,cross=pieces.length-closed;
 return [closed?`ปลอกใน ${closed} วง`:'',cross?`รัดขวาง ${cross} เส้น`:''].filter(Boolean).join(' + ')||'ปลอกรอบมุมอย่างเดียว';
};

/** Plan thumbnail of one tie level: section, main bars, hoop (set 1) and set-2 pieces. */
function TiePlan({lay,size}:{lay:ReturnType<typeof columnTieLayout>;size:number}){
 const pad=size*.08,s=(size-2*pad)/Math.max(lay.W,lay.D),ox=(size-lay.W*s)/2,oy=(size-lay.D*s)/2;
 const P=(p:[number,number])=>`${(ox+p[0]*s).toFixed(1)},${(size-oy-p[1]*s).toFixed(1)}`;
 const path=(pts:[number,number][],r:number)=>roundedPath(pts.map(p=>[p[0],p[1],0]),r).points.map(p=>P([p[0],p[1]])).join(' ');
 const w=(d:number)=>Math.max(size>60?1.1:.8,d*s);
 return <svg className="tie-plan" viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
  <rect x={ox} y={oy} width={lay.W*s} height={lay.D*s} className="tie-plan-section"/>
  <polyline points={path(lay.hoop,lay.hoopRadius)} fill="none" stroke={SET1} strokeWidth={w(lay.dt)} strokeLinejoin="round" strokeLinecap="round"/>
  {lay.pieces.map((pc,k)=><polyline key={k} points={path(pc.pts,lay.R)} fill="none" stroke={SET2} strokeWidth={w(lay.di)} strokeLinejoin="round" strokeLinecap="round"/>)}
  {lay.bars.map((b,k)=><circle key={k} cx={ox+b.x*s} cy={size-oy-b.y*s} r={Math.max(size>60?1.6:1,b.d/2*s)} className="tie-plan-bar"/>)}
 </svg>;
}

/** Elevation strip: column height split into zones with tie levels of both sets (schematic). */
function TieElevation({input,lengths,zone,onZone}:{input:ColumnInput;lengths:Record<TieZoneKey,number>;zone:TieZoneKey;onZone:(k:TieZoneKey)=>void}){
 const H=input.height,t=input.rebar.tie,h=250,top=10,bottom=14,colX=30,colW=34,Y=(z:number)=>top+(h-top-bottom)*(1-z/H);
 if(!(H>0))return null;
 const bounds:Record<TieZoneKey,[number,number]>={lower:[0,lengths.lower],middle:[lengths.lower,H-lengths.upper],upper:[H-lengths.upper,H]};
 const spacing:Record<TieZoneKey,number>={lower:t.lower.spacing,middle:t.spacing,upper:t.upper.spacing};
 const levels=(lo:number,hi:number,s:number)=>{const out:number[]=[];if(s>0)for(let z=lo+s/2;z<hi&&out.length<80;z+=s)out.push(z);return out;};
 return <svg className="tie-elevation" viewBox={`0 0 110 ${h}`} width={110} height={h} role="img" aria-label="รูปด้านเหล็กปลอก 3 โซน">
  {zoneOrder.map(k=>{const [lo,hi]=bounds[k];if(hi-lo<=0)return null;const inner=input.shape==='rect'&&t.inner[k].pattern!=='none';
   return <g key={k} className={`tie-elevation-zone ${zone===k?'active':''}`} onClick={()=>onZone(k)}>
    <rect x={colX-6} y={Y(hi)} width={colW+12} height={Y(lo)-Y(hi)} className="zone-band"/>
    {levels(lo,hi,spacing[k]).map((z,i)=><line key={i} x1={colX} x2={colX+colW} y1={Y(z)} y2={Y(z)} stroke={SET1} strokeWidth={1}/>)}
    {inner&&levels(lo,hi,t.inner[k].spacing).map((z,i)=><line key={`i${i}`} x1={colX+7} x2={colX+colW-7} y1={Y(z)-1.6} y2={Y(z)-1.6} stroke={SET2} strokeWidth={1}/>)}
    <text x={colX+colW+10} y={(Y(lo)+Y(hi))/2-2} className="zone-name">{zoneName[k].split(' ')[0]}</text>
    <text x={colX+colW+10} y={(Y(lo)+Y(hi))/2+9} className="zone-dim">{Math.round(hi-lo)}</text>
   </g>;})}
  <rect x={colX} y={Y(H)} width={colW} height={Y(0)-Y(H)} className="column-outline"/>
  <text x={colX+colW/2} y={h-2} textAnchor="middle" className="zone-dim">H {Math.round(H)}</text>
 </svg>;
}
