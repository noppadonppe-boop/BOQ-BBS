import {useState} from 'react';
import {labelCountText,labelIssueInfo,totalCount,type LabelIssue,type ViewLabelReport} from '../domain/labelQa';
import {HelpButton} from './HelpCenter';

/** Mark label check of one sheet: summary line (✓ / ⚠ per view), switch to draw the issues on the sheet, issue list
 * (click = zoom / highlight). Checks the drawing only; nothing is changed. */
export function LabelQaBar({reports,show,onShow,focus,onFocus,compact}:{reports:ViewLabelReport[];show:boolean;onShow:(v:boolean)=>void;focus?:LabelIssue;onFocus:(i?:LabelIssue)=>void;compact?:boolean}){
 const [open,setOpen]=useState(false);
 if(!reports.length)return null;
 const high=reports.reduce((n,r)=>n+r.high,0),low=reports.reduce((n,r)=>n+r.low,0),total=totalCount(reports);
 return <div className={`label-qa notice ${high?'warning':low?'':'ok'}${compact?' compact':''}`} role="status">
  <div className="label-qa-head">
   <b>{high||low?'⚠':'✓'} ตรวจป้าย Mark</b>
   <span className="label-qa-views">{reports.map(r=><span key={r.view} className={`chip ${r.high?'bad':r.low?'low':'ok'}`} title={labelCountText(r.count)||'ผ่าน'}>{r.title} {r.high||r.low?`⚠ ${r.high+r.low}`:'✓'}</span>)}</span>
   {(high>0||low>0)&&<small>{labelCountText(total)}</small>}
   {(high>0||low>0)&&<label className="check"><input type="checkbox" checked={show} onChange={e=>onShow(e.target.checked)}/>แสดงบนแบบ</label>}
   {(high>0||low>0)&&<button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'ซ่อนรายการ':'รายการ'}</button>}
   {focus&&<button type="button" onClick={()=>onFocus(undefined)}>ดูทั้งแผ่น</button>}
   <HelpButton topic="label-qa"/>
  </div>
  {open&&<ul className="label-qa-list">{reports.filter(r=>r.issues.length).map(r=><li key={r.view}><b>{r.title}</b> <small className="muted">({r.leaders} ป้าย)</small>
   <ul>{r.issues.map((i,k)=><li key={k}><button type="button" className={`link${focus===i?' active':''}${labelIssueInfo[i.kind].high?' high':''}`} onClick={()=>{onShow(true);onFocus(i);}}>
    {labelIssueInfo[i.kind].label}: {i.marks.join(' × ')}{i.detail?` · ${i.detail}`:''}</button></li>)}</ul></li>)}</ul>}
  <small className="muted">ตรวจจากภาพที่วาดเท่านั้น · ไม่เปลี่ยนแบบ / PDF / DXF · เกณฑ์ตั้งได้ที่ General Spec › มาตรฐาน CAD › ตรวจป้าย Mark</small>
 </div>;
}
/** Issue marks over the sheet SVG (sheet mm): red = high, amber = low; the focused one thicker. */
export function LabelQaOverlay({reports,focus}:{reports:ViewLabelReport[];focus?:LabelIssue}){
 return <g className="label-qa-overlay" pointerEvents="none">{reports.flatMap(r=>r.issues).map((i,k)=>{const pad=i===focus?1.5:.8;
  return <rect key={k} x={i.box.x-pad} y={i.box.y-pad} width={i.box.w+2*pad} height={i.box.h+2*pad} rx={1} className={`${labelIssueInfo[i.kind].high?'high':'low'}${i===focus?' focus':''}`}/>;})}</g>;
}
/** viewBox zoomed on an issue (sheet mm), else the whole sheet */
export const zoomBox=(w:number,h:number,focus?:LabelIssue)=>{if(!focus)return `0 0 ${w} ${h}`;const zw=Math.min(w,Math.max(90,focus.box.w*4)),zh=zw*h/w,cx=focus.box.x+focus.box.w/2,cy=focus.box.y+focus.box.h/2;
 return `${Math.max(0,Math.min(w-zw,cx-zw/2))} ${Math.max(0,Math.min(h-zh,cy-zh/2))} ${zw} ${zh}`;};
