import {getDoc} from 'firebase/firestore';
import {recordRef,must} from './direct/common';
import {decodeStorage} from '../domain/storageCodec';
import {loadSnapshot,digestData} from './snapshots';
import {verifyIssuedReference,verifyPublishedBundle} from './releaseReview';
import {issuedReference} from '../domain/publication';
import {validateSubmissionPublication,type SubmissionManifest,type SubmissionJob} from '../domain/submissions';

// Recheck stored publication evidence when a prepared packet is resumed or
// completed. The manifest stamp alone is not proof of a recorded issue.
export async function verifySubmissionPublicationRecord(pid:string,job:SubmissionJob,m:SubmissionManifest){
 validateSubmissionPublication(m);
 must(m.projectId===pid&&m.id===job.id&&m.revisionId===job.revisionId&&m.revisionDigest===job.revisionDigest&&m.purpose===job.purpose&&m.createdBy===job.createdBy&&m.number===job.number&&m.recipient===job.recipient&&m.documents.length===job.documentCount,'Manifest ไม่ตรงโครงการหรือทะเบียนชุด');
 if(m.status!=='Issued')return;
 const [rs,ss]=await Promise.all([getDoc(recordRef(pid,'revisions',m.revisionId)),getDoc(recordRef(pid,'revisionStates',m.revisionId))]);
 must(rs.exists()&&ss.data()?.status==='Issued','Revision ไม่ใช่ Issued ปัจจุบัน');
 const r=decodeStorage(rs.data()),original=await loadSnapshot(r),verified=await verifyIssuedReference(pid,r,decodeStorage(ss.data()),original);
 must(await digestData(verified)===await digestData(m.issuedReference),'หลักฐาน Issued ของชุดไม่ตรงทะเบียน');
 for(const d of m.documents){
  const js=await getDoc(recordRef(pid,'exportJobs',d.exportJobId));must(js.exists(),'ไม่พบทะเบียนไฟล์ในชุด');const j=decodeStorage(js.data());
  must(j.status==='Complete'&&j.revisionId===m.revisionId&&j.revisionDigest===m.revisionDigest&&j.digest===d.snapshotDigest&&j.kind===d.kind&&j.size===d.size&&j.drawingLayout===d.drawingLayout&&await digestData(j.file)===await digestData(d.file),'ไฟล์ในชุดไม่ตรงทะเบียนส่งออก');
  const snapshot=await loadSnapshot(j);await verifyPublishedBundle(snapshot);
  must(snapshot.status==='Issued'&&await digestData(issuedReference(snapshot))===await digestData(verified),'ไฟล์ในชุดไม่ใช่ Issued เดียวกัน');
 }
}
