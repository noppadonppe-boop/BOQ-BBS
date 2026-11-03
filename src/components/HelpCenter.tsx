import {useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,CircleHelp,Lightbulb,MapPin,Search,Sparkles,TriangleAlert,X} from 'lucide-react';
import {helpChanges,helpGroups,helpTopics,searchTopics,topicById} from '../help/helpContent';
import {HelpFigure} from '../help/HelpFigures';
import {RoleGuide} from './RoleGuide';

/** Opens the help centre at a topic from anywhere (`HelpCenter` in App listens). */
export function openHelp(topic?:string){window.dispatchEvent(new CustomEvent('app-help',{detail:topic||''}));}

/** Small “?” button beside a heading / toolbar that opens one topic. */
export function HelpButton({topic,label}:{topic:string;label?:string}){
 const t=topicById(topic);
 return <button type="button" className="help-button" title={`คู่มือ: ${t?.title||topic}`} aria-label={`คู่มือ: ${t?.title||topic}`} onClick={e=>{e.stopPropagation();openHelp(topic);}}><CircleHelp size={14}/>{label&&<span>{label}</span>}</button>;
}

/** Help centre drawer: grouped topics, search, figure + steps / tips / limits per topic, “มีอะไรใหม่”.
 *  `contextId` = topic of the current page (opened by the top-bar button / F1). */
export function HelpCenter({contextId}:{contextId:string}){
 const [open,setOpen]=useState(false),[id,setId]=useState('start'),[q,setQ]=useState(''),[roles,setRoles]=useState(false);
 const ctx=useRef(contextId);ctx.current=contextId;
 const body=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const onOpen=(e:Event)=>{const t=(e as CustomEvent<string>).detail;setId(t&&topicById(t)?t:ctx.current);setQ('');setOpen(true);};
  const onKey=(e:KeyboardEvent)=>{if(e.key==='F1'){e.preventDefault();setId(ctx.current);setQ('');setOpen(true);}else if(e.key==='Escape')setOpen(false);};
  window.addEventListener('app-help',onOpen);window.addEventListener('keydown',onKey);
  return ()=>{window.removeEventListener('app-help',onOpen);window.removeEventListener('keydown',onKey);};
 },[]);
 useEffect(()=>{body.current?.scrollTo({top:0});},[id]);
 const found=useMemo(()=>searchTopics(q),[q]);
 if(!open)return <button type="button" className="help-top" title="คู่มือการใช้งาน (F1)" onClick={()=>{setId(contextId);setOpen(true);}}><CircleHelp size={16}/><span>คู่มือ</span></button>;
 const t=id==='whats-new'?undefined:topicById(id)||helpTopics[0];
 return <><button type="button" className="help-top active" onClick={()=>setOpen(false)}><CircleHelp size={16}/><span>คู่มือ</span></button>
  <div className="help-shade" onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
  <section className="help-center" role="dialog" aria-modal="true" aria-label="คู่มือการใช้งาน">
   <header><BookOpen size={18}/><h2>คู่มือการใช้งาน</h2><label className="help-search"><Search size={14}/><input autoFocus placeholder="ค้นหา เช่น ขอ 135, cover, WBS" value={q} onChange={e=>setQ(e.target.value)}/></label><button className="help-close" onClick={()=>setOpen(false)} aria-label="ปิดคู่มือ"><X size={18}/></button></header>
   <div className="help-layout">
    <nav className="help-nav" aria-label="หัวข้อคู่มือ">
     <button className={id==='whats-new'?'active':''} onClick={()=>setId('whats-new')}><Sparkles size={13}/>มีอะไรใหม่</button>
     {q?<><small>ผลค้นหา {found.length}</small>{found.map(x=><button key={x.id} className={x.id===id?'active':''} onClick={()=>setId(x.id)}>{x.title}</button>)}{!found.length&&<p className="muted">ไม่พบหัวข้อ</p>}</>:
      helpGroups.map(g=><div key={g}><small>{g}</small>{helpTopics.filter(x=>x.group===g).map(x=><button key={x.id} className={x.id===id?'active':''} onClick={()=>setId(x.id)}>{x.title}{x.id===contextId&&<em>หน้านี้</em>}</button>)}</div>)}
    </nav>
    <div className="help-body" ref={body}>
     {!t?<>
      <div className="eyebrow">WHAT'S NEW</div><h2>มีอะไรใหม่</h2><p className="muted">การเปลี่ยนแปลงล่าสุดของแอป · คลิกเพื่อเปิดหัวข้อที่เกี่ยวข้อง</p>
      {helpChanges.map(c=><div key={c.date} className="help-change"><b>{c.date}</b><ul>{c.items.map((it,i)=><li key={i}>{it.topic?<button className="text-button" onClick={()=>setId(it.topic!)}>{it.text}</button>:it.text}</li>)}</ul></div>)}
     </>:<>
      <div className="eyebrow">{t.group}</div><h2>{t.title}</h2><p className="help-summary">{t.summary}</p>
      {t.where&&<p className="help-where"><MapPin size={13}/>{t.where}</p>}
      {t.figure&&<HelpFigure id={t.figure} caption={t.caption}/>}
      {t.steps&&<><h3>ขั้นตอน</h3><ol className="help-steps">{t.steps.map((s,i)=><li key={i}>{s}</li>)}</ol></>}
      {t.tips&&<div className="help-box tip"><h3><Lightbulb size={14}/>เทคนิค</h3><ul>{t.tips.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
      {t.limits&&<div className="help-box limit"><h3><TriangleAlert size={14}/>ข้อจำกัด / ข้อควรระวัง</h3><ul>{t.limits.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
      {(t.id==='roles'||t.id==='admin')&&<p><button onClick={()=>setRoles(true)}>เปิดตาราง Role & Workflow แบบเต็ม</button></p>}
      {t.related&&<div className="help-related"><span className="muted">หัวข้อที่เกี่ยวข้อง</span>{t.related.map(r=>{const x=topicById(r);return x&&<button key={r} onClick={()=>setId(r)}>{x.title}</button>;})}</div>}
      <p className="help-updated">ปรับปรุงหัวข้อนี้ {t.updated}</p>
     </>}
    </div>
   </div>
  </section></div>
  {roles&&<RoleGuide onClose={()=>setRoles(false)}/>}
 </>;
}
