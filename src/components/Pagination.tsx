import {useEffect,useState} from 'react';
import {Member} from '../domain/model';
export function LoadMore({label,data}:{label:string;data:{records:any[];loading:boolean;hasMore:boolean;loadMore:()=>Promise<void>}}){
 return <div className="pagination"><span className="muted">{label} · โหลดแล้ว {data.records.length} รายการ</span>{data.loading?<span role="status">กำลังโหลด…</span>:data.hasMore&&<button onClick={()=>void data.loadMore()}>โหลดเพิ่ม {label}</button>}</div>;
}
export function MemberList({members,selected,onSelect}:{members:Member[];selected:string;onSelect:(id:string)=>void}){
 const [search,setSearch]=useState(''),[page,setPage]=useState(0),filtered=members.filter(m=>`${m.code} ${m.description} ${m.occurrences.map(o=>o.zone+' '+o.floor+' '+o.grid).join(' ')}`.toLowerCase().includes(search.toLowerCase())),pages=Math.max(1,Math.ceil(filtered.length/25)),current=Math.min(page,pages-1);
 useEffect(()=>{if(selected){const i=filtered.findIndex(m=>m.id===selected);if(i>=0)setPage(Math.floor(i/25));}},[selected]);
 return <><input className="search" aria-label="ค้นหาสมาชิก / Zone / Floor" placeholder="ค้นหา Member / Zone / Floor / Grid" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><div className="member-list">{filtered.slice(current*25,(current+1)*25).map(m=><button key={m.id} className={selected===m.id?'active':''} onClick={()=>onSelect(m.id)}>{m.code}<small>{m.occurrences.reduce((n,o)=>n+o.quantity,0)} ชิ้น · {m.status}</small></button>)}</div><div className="pagination"><span className="muted">พบ {filtered.length} / {members.length} สมาชิก · หน้า {current+1} / {pages}</span><div className="actions"><button disabled={current===0} onClick={()=>setPage(current-1)}>หน้าก่อน</button><button disabled={current+1>=pages} onClick={()=>setPage(current+1)}>หน้าถัดไป</button></div></div></>;
}
