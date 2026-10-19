import {getDocFromServer} from 'firebase/firestore';
import {recordRef,must,signedUser} from './direct/common';
import {decodeStorage} from '../domain/storageCodec';
import {loadSnapshot,digestData} from './snapshots';
import {verifyIssuedReference} from './releaseReview';
import {publicationLabel} from '../domain/publication';
import type {Revision,RevisionState,SnapshotBundle} from '../domain/model';

// Read-only view/export inputs use the same recorded issue identity. The stored
// Frozen snapshot is never relabelled in place or rewritten.
export async function loadPublishedRevision(pid:string,record:Revision,expectedState?:RevisionState):Promise<SnapshotBundle>{
 const uid=signedUser().uid,refs=[recordRef(pid,'revisions',record.id),recordRef(pid,'revisionStates',record.id)];
 const [stored,before]=await Promise.all(refs.map(r=>getDocFromServer(r)));must(stored.exists()&&before.exists(),'ไม่พบทะเบียนหรือสถานะฉบับ');
 const current=decodeStorage(stored.data()) as Revision;must(current.id===record.id&&await digestData(current)===await digestData(record),'ทะเบียนฉบับเปลี่ยนแล้ว โหลดฉบับใหม่','aborted');
 const original=await loadSnapshot(current);must(original.project.id===pid,'ข้อมูลฉบับเป็นของโครงการอื่น');const state=decodeStorage(before.data()) as RevisionState;
 must(state.id===record.id&&['Frozen','Issued','TestIssued','Superseded'].includes(state.status),'สถานะฉบับไม่ถูกต้อง');if(expectedState)must(await digestData(state)===await digestData(expectedState),'สถานะฉบับเปลี่ยนแล้ว โหลดฉบับใหม่','aborted');
 const reference=state.status==='Issued'||state.issuedEventId?await verifyIssuedReference(pid,record,state,original):undefined;
 const [afterRecord,after]=await Promise.all(refs.map(r=>getDocFromServer(r)));must(afterRecord.exists()&&after.exists()&&await digestData(decodeStorage(afterRecord.data()))===await digestData(current)&&await digestData(decodeStorage(after.data()))===await digestData(state),'ทะเบียน/สถานะ/หลักฐานฉบับเปลี่ยนระหว่างโหลด','aborted');
 must(signedUser().uid===uid,'บัญชีผู้ใช้เปลี่ยนระหว่างโหลดฉบับ','aborted');
 const bundle={...structuredClone(original),status:state.status,...(reference?{issuedReference:reference}:{})};publicationLabel(bundle);return bundle;
}
