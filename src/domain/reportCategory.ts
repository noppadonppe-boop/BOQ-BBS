import {z} from 'zod';
import type {Category,Member} from './model';

/** BOQ category of a Custom element (reported with beams / footings … instead of "other elements"). */
export const boqCategories=['Foundation','Beam','Column','Slab','Wall','Other'] as const;
export const boqCategorySchema=z.enum(boqCategories);
export type BoqCategory=typeof boqCategories[number];
export const boqCategoryLabels:Record<BoqCategory,string>={Foundation:'ฐานราก',Beam:'คาน',Column:'เสา',Slab:'พื้น',Wall:'ผนัง',Other:'อื่นๆ'};
/** Category used for BOQ grouping: a Custom member's chosen BOQ category, otherwise its own category. */
export const reportCategory=(m:Pick<Member,'category'|'boqCategory'>):Category=>m.category==='Custom'&&m.boqCategory&&m.boqCategory!=='Other'?m.boqCategory:m.category;
