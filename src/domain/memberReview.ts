import {z} from 'zod';
import type {Member} from './model';

/** Member review trail: who drew / checked / approved the current state, the last issued (IFC) revision and a
 * capped log of every edit and review step. Written only by the member commands (never trusted from the client). */
const person=z.object({uid:z.string().max(128),name:z.string().max(200),at:z.string().max(40)});
export const reviewActions=['Created','Edited','Checked','Approved','Returned'] as const;
export const reviewEventSchema=z.object({at:z.string().max(40),uid:z.string().max(128),name:z.string().max(200),action:z.enum(reviewActions),from:z.string().max(30),to:z.string().max(30),rev:z.number().int().min(0).max(999).nullable(),note:z.string().max(300).default('')});
export const memberReviewSchema=z.object({drawn:person.optional(),checked:person.optional(),approved:person.optional(),issuedRev:z.number().int().min(0).max(999).optional(),log:z.array(reviewEventSchema).max(100).default([])});
export type MemberReview=z.infer<typeof memberReviewSchema>;
export type ReviewEvent=z.infer<typeof reviewEventSchema>;
export const REVIEW_LOG_MAX=100;

type Status=Member['status'];
export const statusLabel=(s:Status)=>s==='ApprovedForIssue'?'IFC':s;
export const statusText:Record<Status,string>={Draft:'Draft · รอตรวจ',Checked:'Checked · รออนุมัติ',ApprovedForIssue:'IFC · อนุมัติใช้งาน'};
export const actionText:Record<ReviewEvent['action'],string>={Created:'สร้าง',Edited:'แก้ไข',Checked:'ตรวจแล้ว',Approved:'อนุมัติ IFC',Returned:'ส่งกลับ Draft'};
export const revText=(rev:number)=>`R${rev}`;

/** Revision shown in tables: last IFC revision, plus the pending one while a revised member is not approved yet. */
export function revisionLabel(m:Pick<Member,'status'|'review'>){
 const r=m.review?.issuedRev;
 if(r===undefined)return m.status==='ApprovedForIssue'?revText(0):'—';
 return m.status==='ApprovedForIssue'?revText(r):`${revText(r)} → ${revText(r+1)}`;
}
/** People of the current state: checked / approved only count while the status still holds them. */
export function reviewPeople(m:Pick<Member,'status'|'review'>){
 const v=m.review;return {drawn:v?.drawn,checked:m.status!=='Draft'?v?.checked:undefined,approved:m.status==='ApprovedForIssue'?v?.approved:undefined};
}

/** Next review trail after an edit or review step by `actor`. */
export function nextReview(old:MemberReview|undefined,e:{action:ReviewEvent['action'];from:Status|'';to:Status;actor:{uid:string;name:string};at:string;note?:string}):MemberReview{
 const who={uid:e.actor.uid,name:e.actor.name.slice(0,200),at:e.at},v:MemberReview={log:[],...old};
 let issuedRev=v.issuedRev,drawn=v.drawn,checked=v.checked,approved=v.approved;
 if(e.action==='Created'||e.action==='Edited'){drawn=who;if(e.to==='Draft'){checked=undefined;approved=undefined;}}
 else if(e.action==='Checked'){checked=who;approved=undefined;}
 else if(e.action==='Approved'){approved=who;issuedRev=(issuedRev??-1)+1;}
 else{checked=undefined;approved=undefined;}
 const rev=e.action==='Approved'?issuedRev!:issuedRev??null;
 const log=[...v.log,{at:e.at,uid:who.uid,name:who.name,action:e.action,from:e.from,to:e.to,rev,note:(e.note||'').slice(0,300)}].slice(-REVIEW_LOG_MAX);
 return {...(drawn?{drawn}:{}),...(checked?{checked}:{}),...(approved?{approved}:{}),...(issuedRev!==undefined?{issuedRev}:{}),log};
}
