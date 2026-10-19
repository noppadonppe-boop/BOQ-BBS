import {quantityBasisState} from '../domain/quantityBasis';
import type {Member,Bar} from '../domain/model';
import type {SourceBarPreviewResult} from '../domain/sourceBarPreview';
import {SourceRegionPreview} from './SourceShapeReview';
import {DetailSketch} from './BarDetail';
import {barDetail,detailParts} from '../domain/barDetails';
const value=(n:number|undefined)=>n===undefined?'ยังไม่พร้อม':n.toLocaleString('en-US',{maximumFractionDigits:6});
export function SourceBarPreview({member,bar,preview}:{member:Member;bar:Bar;preview:SourceBarPreviewResult}){
 const r=preview.source,c='comparison' in preview?preview.comparison:undefined,b='barRow' in preview?preview.barRow:undefined,detail='candidateBar' in preview?barDetail(member,preview.candidateBar):undefined;
 if(!r)return <p role="alert" className="notice danger">ไม่พบแถวต้นทางปัจจุบัน เริ่มใหม่จากตาราง</p>;
 return <section className="source-bar-preview full" aria-label="ตรวจเทียบก่อนสร้าง BBS"><h3>ตรวจเทียบก่อนสร้าง BBS</h3><p>ค่าที่พิมพ์ในแบบและค่าที่คำนวณแสดงแยกกัน การใช้ชุดเหล็กเป็นการเพิ่ม Draft และจับคู่แถวนี้ ต้องตรวจรูปดัด ตำแหน่ง และมาตรฐานก่อนส่งงาน</p>
 {quantityBasisState(member)==='Provisional'&&<p className="notice warning">มิติและจำนวนองค์ประกอบยังเป็นข้อมูลชั่วคราว ตรวจและยืนยันที่มาปริมาณก่อนใช้ยอดรวม จำนวนต่อองค์ประกอบที่เริ่มจากตารางรวมอ้างจำนวนที่กรอกปัจจุบัน ต้องตรวจฐานจำนวนให้ถูกต้อง</p>}
 <div className="source-shape-pair"><div><h4>รูปต้นทาง · Mark {r.mark}</h4>{r.shapeReference&&preview.attachment?<SourceRegionPreview key={r.id+JSON.stringify(r.shapeReference)} attachment={preview.attachment} reference={r.shapeReference}/>:<p className="empty">ยังไม่ได้เลือกรูปดัดในแบบต้นทาง</p>}</div><div><h4>รูปจากข้อมูลที่กรอก · {bar.mark}</h4>{detail?detailParts(detail).map(part=><div key={part.part}><DetailSketch detail={detail} part={part}/></div>):<p className="empty">กรอกแนวเหล็กที่ถูกต้องก่อนดูรูป · ข้อมูลก่อนหน้าไม่ใช้แทนค่าที่ยังกรอกไม่ครบ</p>}</div></div>
 <p className="muted">ฐานตาราง: {preview.basis==='allOccurrences'?'รวมจำนวนองค์ประกอบทั้งหมดของสมาชิก':'ต่อ 1 องค์ประกอบ'}</p><div className="table-scroll"><table><thead><tr><th>ข้อมูล</th><th>แบบต้นทาง</th><th>BBS ที่กำลังกรอก</th></tr></thead><tbody><tr><td>Ø / เกรด</td><td>{r.diameter} / {r.grade}</td><td>{bar.diameter} / {bar.grade}</td></tr><tr><td>จำนวนตามฐานตาราง</td><td>{r.count}</td><td>{value(c?.actualCount)}</td></tr><tr><td>ยาวตัด mm</td><td>{value(r.cutLength)}</td><td>{value(b?.cutLength)}</td></tr><tr><td>BBS − แบบ mm</td><td>—</td><td>{b?value(b.cutLength-r.cutLength):'ยังไม่พร้อม'}</td></tr><tr><td>Kg/p</td><td>{r.unitWeight===undefined?'ไม่ได้กรอก':value(r.unitWeight)}</td><td>{value(c?.actualUnitWeight)}</td></tr><tr><td>น้ำหนักตามฐานตาราง kg</td><td>{r.weight===undefined?'ไม่ได้กรอก':value(r.weight)}</td><td>{value(c?.actualWeight)}</td></tr></tbody></table></div>
 {!!preview.problems.length&&<p role="status" className="notice warning">{preview.problems.join(' · ')}</p>}
 {c&&<p className="notice" data-source-bar-comparison>{c.differences.length?'ช่องที่ยังไม่ตรง: '+c.differences.join(', '):'Mark / ขนาด / เกรด / จำนวน / ยาวตัดตรงตามช่องเปรียบเทียบ'} · ผลต่างน้ำหนักไม่มีเกณฑ์ยอมรับที่รับรอง</p>}
 {!!preview.standardProblems.length&&<p className="notice warning" data-source-bar-standard>ยังต้องตรวจมาตรฐาน: {preview.standardProblems.join(' · ')}</p>}
 {b&&<p className="muted">ฐานความยาว: {b.lengthBasis} · ใช้จำนวนองค์ประกอบตามฐานตาราง ไม่คูณน้ำหนักต่อเส้น</p>}
 </section>;
}
