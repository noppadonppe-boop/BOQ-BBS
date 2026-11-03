import type {Bar,Member} from './model';
import {type PartPurpose,type ShapeModel,type ShapePart} from './shapeModelSchema';
import {nextMark} from './rebarSketch';

// Tag no. of shape-model parts and bar groups (custom elements): names a part on the drawings, prefixes the Marks
// of the bars it owns (`F-01/01`) and splits the BBS sheets per part. Owner of a bar = the part / group whose id
// follows `pp-` (preset) or `sk-` (drawn) in the bar id; longest id wins so `a` never claims `a-b`'s bars.
// Kept free of runtime imports from partRebar.ts (which uses `tagMarks`).
export const tagPrefixes:Record<PartPurpose,string>={footing:'F',column:'C',beam:'B',slab:'S',wall:'W',other:'X'};
export type BarGroup=NonNullable<ShapeModel['groups']>[number];

/** Letter of a part's tag: purpose (set or guessed), reference = R, pit walls = P, plain voids = V. */
export function tagLetter(p:ShapePart,purpose?:PartPurpose){
 if(p.role==='reference')return 'R';if(p.role==='void')return p.rebar?.purpose==='wall'?'P':'V';
 return tagPrefixes[p.rebar?.purpose||purpose||'other'];
}
/** Next free tag `<letter>-<nn>` (case-insensitive against `used`). */
export function nextTag(letter:string,used:Iterable<string>){
 const u=new Set([...used].map(t=>t.toUpperCase()));for(let i=1;i<1000;i++){const t=`${letter}-${String(i).padStart(2,'0')}`;if(!u.has(t))return t;}return `${letter}-${Date.now()%1000}`;
}
export const modelTags=(sm:ShapeModel)=>[...sm.parts.flatMap(p=>p.tag?[p.tag]:[]),...(sm.groups||[]).map(g=>g.tag)];
/** Fills missing part tags in part order (`purpose` = guess for parts without preset rebar). */
export function withAutoTags(sm:ShapeModel,purpose?:(p:ShapePart)=>PartPurpose):ShapeModel{
 if(sm.parts.every(p=>p.tag))return sm;const used=modelTags(sm);
 return {...sm,parts:sm.parts.map(p=>{if(p.tag)return p;const tag=nextTag(tagLetter(p,purpose?.(p)),used);used.push(tag);return {...p,tag};})};
}
/** Part or group owning a bar (by id prefix). */
export function barOwner(sm:ShapeModel|undefined,b:Pick<Bar,'id'>):string|undefined{
 if(!sm)return;let best:string|undefined;
 for(const id of [...sm.parts.map(p=>p.id),...(sm.groups||[]).map(g=>g.id)])if((b.id.startsWith(`pp-${id}-`)||b.id.startsWith(`sk-${id}-`))&&(!best||id.length>best.length))best=id;
 return best;
}
export function ownerTag(sm:ShapeModel|undefined,id:string|undefined){
 if(!sm||!id)return;return sm.parts.find(p=>p.id===id)?.tag||sm.groups?.find(g=>g.id===id)?.tag;
}
export const markPrefix=(tag:string|undefined)=>tag?`${tag}/`:'';
/** Next free Mark for a bar of `owner` (tagged: `F-01/01`, else C01). */
export function markFor(m:Member,owner?:string){const t=ownerTag(m.shapeModel,owner);return t?nextMark(m,markPrefix(t)):nextMark(m);}
const tagOfMark=(mark:string)=>{const k=mark.indexOf('/');return k>0?mark.slice(0,k):undefined;};
/** Marks follow the owner's tag: a bar whose Mark lacks its owner's prefix is renumbered `<tag>/nn`; a bar that lost
 * its tag (prefix of a tag no longer on its owner) gets a plain Mark. Other Marks are kept. */
export function tagMarks(m:Member):Member{
 const sm=m.shapeModel;if(!sm)return m;
 const tags=new Set(modelTags(sm).map(t=>t.toUpperCase()));
 const want=m.bars.map(b=>markPrefix(ownerTag(sm,barOwner(sm,b))));
 // untagged owner: only Marks carrying a current tag or an automatic tag (`F-01/…`) are stale
 const stale=(b:Bar,i:number)=>{if(want[i])return !b.mark.startsWith(want[i]);const t=tagOfMark(b.mark);return !!t&&(tags.has(t.toUpperCase())||/^[A-Z]-\d{2,3}$/i.test(t));};
 if(!m.bars.some(stale))return m;
 const bars=m.bars.map((b,i)=>stale(b,i)?{...b,mark:''}:b);
 // a renamed tag keeps the number after the slash when it is free
 for(let i=0;i<bars.length;i++)if(!bars[i].mark){const old=m.bars[i].mark,k=old.indexOf('/'),used=new Set(bars.map(b=>b.mark)),keep=want[i]&&k>0?`${want[i]}${old.slice(k+1)}`:'';
  const mark=keep&&keep.length<=32&&!used.has(keep)?keep:nextMark({...m,bars:bars.filter(b=>b.mark)},want[i]||'C');bars[i]={...bars[i],mark,placementConfirmed:false};}
 return {...m,bars};
}
/** Parts of an owner (a part, or every part of a group). */
export function ownerParts(sm:ShapeModel,id:string):ShapePart[]{
 const g=sm.groups?.find(x=>x.id===id);return g?sm.parts.filter(p=>g.parts.includes(p.id)):sm.parts.filter(p=>p.id===id);
}
/** Groups after parts were removed: members that no longer exist are dropped, groups left with < 2 parts go. */
export function pruneGroups(sm:ShapeModel):ShapeModel{
 if(!sm.groups)return sm;const ids=new Set(sm.parts.map(p=>p.id)),groups=sm.groups.map(g=>({...g,parts:g.parts.filter(p=>ids.has(p))})).filter(g=>g.parts.length>=2);
 return {...sm,groups:groups.length?groups:undefined};
}
export const newGroupId=(sm:ShapeModel)=>{const ids=new Set([...sm.parts.map(p=>p.id),...(sm.groups||[]).map(g=>g.id)]);for(let i=1;;i++)if(!ids.has(`g${i}`))return `g${i}`;};
