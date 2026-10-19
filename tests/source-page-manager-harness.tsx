import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {blankMember} from '../src/domain/model';
import {SourcePageManager} from '../src/components/SourcePageManager';
import '../src/styles.css';
function Harness(){
 const [member,setMember]=useState({...blankMember('Beam','COMPONENT-QA'),sourceSchedule:{version:3 as const,attachmentId:'source',sha256:'a'.repeat(64),page:2,basis:'perElement' as const,note:'QA only',pageTables:[{page:2,note:'QA first page',statedTotalWeight:1},{page:19,note:'QA second page',statedTotalWeight:2}],rows:[{id:'r1',mark:'1',diameter:12,grade:'SD40',count:1,cutLength:1000,note:'',sourcePage:2},{id:'r2',mark:'2',diameter:12,grade:'SD40',count:1,cutLength:1000,note:'',sourcePage:19}]}}),[readOnly,setReadOnly]=useState(false),[changes,setChanges]=useState(0);
 return <main style={{maxWidth:950,margin:'20px auto',padding:20}}><p className="notice">COMPONENT QA ONLY / ไม่มีการเขียนฐานข้อมูล</p><button onClick={()=>setMember(m=>({...m,version:m.version+1}))}>เปลี่ยนรุ่นข้อมูลจำลอง</button><button onClick={()=>setReadOnly(v=>!v)}>สลับอ่านอย่างเดียว</button><p data-qa-changes>{changes}</p><SourcePageManager member={member} readOnly={readOnly} onChange={m=>{setChanges(n=>n+1);setMember(m as typeof member);}}/></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
