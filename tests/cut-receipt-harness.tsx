import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {CutReceiptEditor} from '../src/components/CutReceiptEditor';
import '../src/styles.css';
const cut={memberId:'QA-M',barId:'QA-B',member:'QA-ONLY',mark:'R1',length:1000,diameter:16,grade:'B500B'},plan={id:'COMPONENT-QA',status:'Reserved',patterns:Array.from({length:30},()=>({stockId:'QA-STOCK',length:4000,diameter:16,grade:'B500B',cuts:[cut,cut,cut],remainder:991})),kerf:3,minOffcut:400};
function Harness(){const [result,setResult]=useState('');return <main style={{margin:'20px auto',padding:20,maxWidth:1200}}><p className="notice warning">COMPONENT QA ONLY · ไม่ใช่แผน Issued จริง · บันทึกเฉพาะในหน้าจอนี้ ไม่มีการส่งข้อมูลไปฐานข้อมูล</p><h1>บันทึกตัดบางเส้น / เศษวัดจริง</h1><section className="panel padded"><CutReceiptEditor plan={plan} disabled={false} onSubmit={async r=>setResult(JSON.stringify(r))}/></section><pre data-qa-result style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{result}</pre></main>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
