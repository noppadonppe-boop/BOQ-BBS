export function drawingPageNumbers(records:{page:number;memberId:string}[]){
 if(records.length>500)throw Error('แบ่งชุด: แบบ BBS เกิน500หน้า');
 const pages=new Set<number>(),counts=new Map<string,number>();
 for(const r of records){if(!Number.isInteger(r.page)||r.page<1||!r.memberId||pages.has(r.page))throw Error('ทะเบียนหน้าแบบซ้ำหรือไม่ถูกต้อง');pages.add(r.page);counts.set(r.memberId,(counts.get(r.memberId)||0)+1);}
 const ordered=[...records].sort((a,b)=>a.page-b.page);if(ordered.some((r,i)=>r.page!==i+1))throw Error('ทะเบียนหน้าแบบไม่ครบ');
 const current=new Map<string,number>();return new Map(ordered.map(r=>{const index=(current.get(r.memberId)||0)+1;current.set(r.memberId,index);return [r.page,{index,total:counts.get(r.memberId)!}];}));
}
