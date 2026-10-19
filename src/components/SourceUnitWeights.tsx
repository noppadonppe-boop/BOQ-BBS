import type {compareSourceSchedule} from '../domain/sourceSchedule';
type Result=NonNullable<ReturnType<typeof compareSourceSchedule>>;
const kg=(value:number|undefined)=>value===undefined?'ยังไม่พร้อม':value.toLocaleString('en-US',{maximumFractionDigits:6});
export function SourceUnitWeights({result}:{result:Result}){
 if(!result.rows.some(r=>r.source.unitWeight!==undefined))return null;
 return <section className="source-unit-weight-review"><h4>น้ำหนักต่อเส้นและตัวเลขที่พิมพ์ในแบบ</h4><p>น้ำหนักต่อเส้น BBS ไม่คูณจำนวนองค์ประกอบ ผลต่างแสดงเพื่อทบทวนตามความละเอียดที่พิมพ์ ไม่ใช่เกณฑ์ยอมรับ ไม่ปรับปริมาณ BOQ หรือจำนวนตัด</p><div className="table-scroll"><table><thead><tr>{['Mark จากแบบ','Kg/p จากแบบ','Kg/p BBS','BBS − แบบ kg/p','จำนวนจากแบบ','Kg/p แบบ × จำนวน','น้ำหนักแถวจากแบบ kg','แถว − ผลคูณ kg'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{result.rows.map(r=><tr key={r.source.id}><td>{r.source.mark}</td><td>{r.source.unitWeight===undefined?'ไม่ได้กรอก':kg(r.source.unitWeight)}</td><td>{kg(r.actualUnitWeight)}</td><td>{kg(r.unitWeightDifference)}</td><td>{r.source.count}</td><td>{kg(r.sourceProductWeight)}</td><td>{r.source.weight===undefined?'ไม่ได้กรอก':kg(r.source.weight)}</td><td>{kg(r.sourceRowProductDifference)}</td></tr>)}</tbody></table></div></section>;
}
