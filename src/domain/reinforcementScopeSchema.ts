import {z} from 'zod';
// A manual scope statement, never engineering/owner approval or inferred zero.
export const noRebarSchema=z.object({version:z.literal(1),basis:z.string().trim().min(1).max(500)}).strict();
export const declaredNoRebar=(m:{bars:unknown[];sourceSchedule?:unknown;noRebar?:unknown})=>!m.bars.length&&!m.sourceSchedule&&noRebarSchema.safeParse(m.noRebar).success;
