import {z} from 'zod';
import type {Attachment} from './model';
import {sourceCurrent} from './sourceRevisions';
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const legacySourceEligible=(a:Attachment)=>sourceCurrent(a)&&!a.sourceRevision&&!a.sourceIntake&&!a.sourceAdoption&&!a.supersededById;
const row=z.object({attachmentId:id,version:z.number().int().positive(),kind:z.string().trim().min(1).max(60),revision:z.string().trim().min(1).max(40),memberVersion:z.number().int().positive().optional()});
export const sourceAdoptionInputSchema=z.discriminatedUnion('scope',[
 z.object({scope:z.literal('Member'),note:z.string().trim().min(1).max(500),acknowledged:z.literal(true),items:z.array(row).min(1).max(60)}),
 z.object({scope:z.literal('GeneralSpec'),note:z.string().trim().min(1).max(500),acknowledged:z.literal(true),items:z.array(row).min(1).max(20)})
]);
export function validateSourceAdoptionInput(data:unknown){const value=sourceAdoptionInputSchema.parse(data);if(new Set(value.items.map(i=>i.attachmentId)).size!==value.items.length)throw Error('ไฟล์เดิมซ้ำในชุด');if(value.scope==='Member'&&value.items.some(i=>!i.memberVersion))throw Error('ระบุ version ของสมาชิกทุกไฟล์');return value;}
