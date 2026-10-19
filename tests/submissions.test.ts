import {describe,it,expect} from 'vitest';
import {validateSubmissionInput,submissionReferenceKey,submissionDocumentKey,submissionZipName,SUBMISSION_LIMITS} from '../src/domain/submissions';
const input=()=>({revisionId:'frozen',number:'TR-01',recipient:'Owner',purpose:'For Review',note:'Draft only',items:[{exportJobId:'job1',reference:'DOC-01',title:'BBS'}]});
describe('controlled Draft submission inputs',()=>{
 it('requires a Frozen reference, recipient and actual document selection',()=>{for(const p of [{revisionId:''},{recipient:''},{number:''},{items:[]}])expect(()=>validateSubmissionInput({...input(),...p})).toThrow();});
 it('forbids unsupported approved/issued purpose aliases',()=>{for(const purpose of ['Issued','Approved'])expect(()=>validateSubmissionInput({...input(),purpose})).toThrow();});
 it('allows review and tender as explicit Draft purposes',()=>{expect(validateSubmissionInput(input()).purpose).toBe('For Review');expect(validateSubmissionInput({...input(),purpose:'Tender'}).purpose).toBe('Tender');});
 it('same export cannot be included twice under different document references',()=>{expect(()=>validateSubmissionInput({...input(),items:[input().items[0],{...input().items[0],reference:'DOC-02'}]})).toThrow(/ไฟล์ส่งออกซ้ำ/);});
 it('references compare NFC, trimmed and case-insensitively',()=>{expect(submissionReferenceKey(' DOc-é ')).toBe(submissionReferenceKey('doc-e\u0301'));expect(()=>validateSubmissionInput({...input(),items:[input().items[0],{...input().items[0],exportJobId:'job2',reference:' doc-01 '}]})).toThrow(/รหัสเอกสาร/);});
 it('30 independent rows are valid and31 rejects',()=>{const rows=Array.from({length:30},(_,i)=>({exportJobId:'job'+i,reference:'DOC'+i,title:'Document'}));expect(validateSubmissionInput({...input(),items:rows}).items).toHaveLength(30);expect(()=>validateSubmissionInput({...input(),items:[...rows,{exportJobId:'extra',reference:'extra',title:'extra'}]})).toThrow();});
 it('ZIP keys keep ordering and sanitize path/control characters',()=>{expect(submissionDocumentKey(0,'../bad\\file\u0000.pdf')).toBe('documents/001_.._bad_file_.pdf');expect(submissionDocumentKey(1,'แบบ.pdf')).toBe('documents/002_แบบ.pdf');});
 it('ZIP filenames cannot introduce directories even with owner supplied numbers',()=>{expect(submissionZipName({number:'../../TR01',project:{code:'P/01'} as any})).toBe('P_01-______TR01-DRAFT.zip');});
 it('bounded source/ZIP guards preserve distinct limits',()=>{expect(SUBMISSION_LIMITS.sourceBytes).toBeLessThan(SUBMISSION_LIMITS.zipBytes);expect(SUBMISSION_LIMITS.documents).toBe(30);});
});
