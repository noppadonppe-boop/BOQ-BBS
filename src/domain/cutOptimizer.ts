import type {Stock} from './model';

export type Cut={member:string;mark:string;length:number;diameter:number;grade:string;memberId?:string;barId?:string};
export type Pattern={stockId:string;length:number;diameter:number;grade:string;cuts:Cut[];remainder:number};
export const cuttingObjectives=['material','scrap','offcuts'] as const;
export type CuttingObjective=typeof cuttingObjectives[number];
export const cuttingObjectiveLabels:Record<CuttingObjective,string>={material:'ใช้วัตถุดิบน้อยที่สุด',scrap:'ลดเศษทิ้ง',offcuts:'ใช้เศษเดิมก่อน'};
export const CUT_OPTIMIZER_VERSION='cut-optimizer-2.0';
export type CutTotals={unfilled:number;unfilledLength:number;inputLength:number;cutLength:number;kerfLoss:number;scrap:number;offcut:number;standardInputLength:number;stockBars:number};
export type CutPlan=Omit<CutTotals,'unfilled'|'unfilledLength'|'stockBars'> & {patterns:Pattern[];unfilled:Cut[];method:string;optimizer:{version:string;objective:CuttingObjective;optimal:boolean;baseline:CutTotals;selected:CutTotals;groups:{diameter:number;grade:string;demand:number;stock:number;candidate:string;exact:'complete'|'budget'|'size';nodes:number}[]}};
export type CutProgress={phase:'preparing'|'searching'|'checking';completed:number;total:number};
type Bin={stock:Stock;index:number;length:number;remaining:number;cuts:Cut[];offcut:boolean};
type Result={patterns:Pattern[];unfilled:Cut[];totals:CutTotals;candidate:string};
const SCALE=1000;
// The solver uses integer 0.001 mm units. Reject excess precision rather than
// silently shortening a bar or permitting an over-capacity pattern.
function units(value:number,label:string){
 const n=Math.round(value*SCALE);
 if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(n)||Math.abs(n/SCALE-value)>1e-8)throw Error(label+': ใช้ค่าที่ไม่ติดลบและละเอียดไม่เกิน 0.001 mm');
 return n;
}
const mm=(n:number)=>n/SCALE;
const isOffcut=(s:Stock)=>s.kind==='Offcut'||s.source.startsWith('Cut ');
const key=(d:number,g:string)=>JSON.stringify([d,g]);
const total=(a:number[])=>a.reduce((n,v)=>n+v,0);
function score(t:CutTotals,objective:CuttingObjective){
 const head=[t.unfilled,t.unfilledLength];
 const tail=objective==='scrap'?[t.scrap,t.inputLength,t.standardInputLength]:objective==='offcuts'?[t.standardInputLength,t.inputLength,t.scrap]:[t.inputLength,t.scrap,t.standardInputLength];
 return [...head,...tail,t.stockBars,t.offcut];
}
function compare(a:CutTotals,b:CutTotals,objective:CuttingObjective){const x=score(a,objective),y=score(b,objective);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;return 0;}
function result(bins:Bin[],unfilled:Cut[],kerf:number,min:number,candidate:string):Result{
 const used=bins.filter(b=>b.cuts.length),patterns=used.map(b=>({stockId:b.stock.id,length:b.stock.length,diameter:b.stock.diameter,grade:b.stock.grade,cuts:[...b.cuts],remainder:mm(b.remaining)}));
 const cut=total(used.flatMap(b=>b.cuts.map(c=>units(c.length,'ความยาวตัด')))),input=total(used.map(b=>b.length)),loss=total(used.map(b=>b.cuts.length*kerf)),scrap=total(used.map(b=>b.remaining<min?b.remaining:0)),offcut=total(used.map(b=>b.remaining>=min?b.remaining:0));
 return {patterns,unfilled:[...unfilled],candidate,totals:{unfilled:unfilled.length,unfilledLength:mm(total(unfilled.map(c=>units(c.length,'ความยาวตัด')))),inputLength:mm(input),cutLength:mm(cut),kerfLoss:mm(loss),scrap:mm(scrap),offcut:mm(offcut),standardInputLength:mm(total(used.filter(b=>!b.offcut).map(b=>b.length))),stockBars:used.length}};
}

// Treap indexes stock remainders; each choice/update is O(log stock) on average.
// Node priorities come from fixed indices, so retries produce the same plan.
class Remainders{
 private root=-1;private left:number[]=[];private right:number[]=[];private priority:number[]=[];
 constructor(private bins:Bin[]){}
 private less(a:number,b:number){return this.bins[a].remaining===this.bins[b].remaining?a<b:this.bins[a].remaining<this.bins[b].remaining;}
 private merge(a:number,b:number):number{if(a<0)return b;if(b<0)return a;if(this.priority[a]<this.priority[b]){this.right[a]=this.merge(this.right[a],b);return a;}this.left[b]=this.merge(a,this.left[b]);return b;}
 private insert(root:number,n:number):number{if(root<0)return n;if(this.less(n,root)){this.left[root]=this.insert(this.left[root],n);if(this.priority[this.left[root]]<this.priority[root]){const l=this.left[root];this.left[root]=this.right[l];this.right[l]=root;return l;}}else{this.right[root]=this.insert(this.right[root],n);if(this.priority[this.right[root]]<this.priority[root]){const r=this.right[root];this.right[root]=this.left[r];this.left[r]=root;return r;}}return root;}
 add(n:number){this.left[n]=this.right[n]=-1;let h=(n+1)>>>0;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);this.priority[n]=(h^(h>>>16))>>>0;this.root=this.insert(this.root,n);}
  remove(n:number){const walk=(r:number):number=>{if(r<0)return r;if(r===n)return this.merge(this.left[r],this.right[r]);if(this.less(n,r))this.left[r]=walk(this.left[r]);else this.right[r]=walk(this.right[r]);return r;};this.root=walk(this.root);}
 fit(need:number){let r=this.root,found=-1;while(r>=0){if(this.bins[r].remaining>=need){found=r;r=this.left[r];}else r=this.right[r];}return found;}
 longest(need:number){let r=this.root;if(r<0)return -1;while(this.right[r]>=0)r=this.right[r];return this.bins[r].remaining>=need?r:-1;}
}
function binsOf(stock:Stock[]){return stock.flatMap(s=>Array.from({length:s.quantity-s.reserved},()=>({stock:s,index:0,length:units(s.length,'ความยาวสต็อก'),remaining:units(s.length,'ความยาวสต็อก'),cuts:[] as Cut[],offcut:isOffcut(s)}))).map((b,index)=>({...b,index}));}
type Strategy='best-fit'|'opened-first'|'longest-stock'|'offcuts-first';
function greedy(demand:Cut[],stock:Stock[],kerf:number,min:number,strategy:Strategy,name:string){
 const bins=binsOf(stock),all=new Remainders(bins),opened=new Remainders(bins),closed=new Remainders(bins),offcuts=new Remainders(bins);bins.forEach((b,i)=>{all.add(i);closed.add(i);if(b.offcut)offcuts.add(i);});const unfilled:Cut[]=[];
 for(const c of demand){const need=units(c.length,'ความยาวตัด')+kerf;let i=-1;
  if(strategy==='offcuts-first')i=offcuts.fit(need);
  if(i<0&&strategy!=='best-fit')i=opened.fit(need);
  if(i<0)i=strategy==='longest-stock'?closed.longest(need):all.fit(need);
  if(i<0){unfilled.push(c);continue;}const b=bins[i],used=!!b.cuts.length;
  all.remove(i);if(used)opened.remove(i);else closed.remove(i);if(b.offcut)offcuts.remove(i);
  b.cuts.push(c);b.remaining-=need;all.add(i);opened.add(i);if(b.offcut)offcuts.add(i);
 }
 return result(bins,unfilled,kerf,min,name);
}
function shuffled(items:Cut[],seed:number){const a=[...items];let state=seed>>>0;for(let i=a.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function exact(demand:Cut[],stock:Stock[],kerf:number,min:number,objective:CuttingObjective,best:Result,budget:number){
 const bins=binsOf(stock),unfilled:Cut[]=[];let nodes=0,complete=true;
 const visit=(at:number)=>{if(nodes>=budget){complete=false;return;}nodes++;if(unfilled.length>best.totals.unfilled)return;
  if(at===demand.length){const r=result(bins,unfilled,kerf,min,'exact search');if(compare(r.totals,best.totals,objective)<0)best=r;return;}
  const c=demand[at],need=units(c.length,'ความยาวตัด')+kerf,seen=new Set<string>();
  for(const b of bins){if(b.remaining<need)continue;const signature=JSON.stringify([b.length,b.remaining,b.offcut,!!b.cuts.length]);if(seen.has(signature))continue;seen.add(signature);b.cuts.push(c);b.remaining-=need;visit(at+1);b.remaining+=need;b.cuts.pop();if(!complete)return;}
  if(unfilled.length<best.totals.unfilled){unfilled.push(c);visit(at+1);unfilled.pop();}
 };visit(0);return {best,nodes,complete};
}
export function optimizeCuts(demand:Cut[],stock:Stock[],kerfMm:number,minOffcutMm:number,objective:CuttingObjective='material',onProgress:(p:CutProgress)=>void=()=>{},nodeBudget=200000):CutPlan{
 if(!cuttingObjectives.includes(objective))throw Error('เป้าหมายแผนตัดไม่ถูกต้อง');
 if(!Number.isInteger(nodeBudget)||nodeBudget<1||nodeBudget>200000)throw Error('งบค้นหาแผนตัดไม่ถูกต้อง');
 const kerf=units(kerfMm,'รอยตัด'),min=units(minOffcutMm,'เศษเก็บขั้นต่ำ');if(kerfMm>20||minOffcutMm>12000)throw Error('รอยตัดหรือเกณฑ์เศษเกินช่วงที่รองรับ');
 if(demand.length>100000)throw Error('แยกแผนตัดให้เล็กลง: เกิน 100,000 ชิ้น');
 const ids=new Set<string>();let stockCount=0;for(const s of stock){if(typeof s.grade!=='string'||s.kind!==undefined&&!['Standard','Offcut'].includes(s.kind))throw Error('เกรดหรือประเภทสต็อกไม่ถูกต้อง');if(ids.has(s.id)||!s.id||!Number.isInteger(s.quantity)||!Number.isInteger(s.reserved)||s.reserved<0||s.quantity<s.reserved||s.quantity>100000||!Number.isFinite(s.diameter)||s.diameter<=0||s.diameter>100||!s.grade||s.grade.length>40||typeof s.source!=='string'||s.length<=0||s.length>50000)throw Error('ข้อมูลสต็อกไม่ถูกต้องหรือรหัสซ้ำ');ids.add(s.id);units(s.length,'ความยาวสต็อก');stockCount+=s.quantity-s.reserved;}
 if(stockCount>100000)throw Error('แยกคลัง/แผนตัด: เกิน 100,000 เส้นในสต็อก');
 const groups=new Map<string,{demand:Cut[];stock:Stock[]}>();let demandUnits=0;
 for(const c of demand){if(typeof c.grade!=='string')throw Error('เกรดชิ้นงานไม่ถูกต้อง');const n=units(c.length,'ความยาวตัด');if(n<=0||!Number.isFinite(c.diameter)||c.diameter<=0||c.diameter>100||!c.grade||c.grade.length>40)throw Error('ข้อมูลความต้องการตัดไม่ถูกต้อง');demandUnits+=n+kerf;const k=key(c.diameter,c.grade);if(!groups.has(k))groups.set(k,{demand:[],stock:[]});groups.get(k)!.demand.push(c);}
 if(!Number.isSafeInteger(demandUnits))throw Error('ความยาวรวมเกินช่วงตัวเลข แบ่งแผนตัดเป็นชุด');
 for(const s of stock)if(s.quantity>s.reserved)groups.get(key(s.diameter,s.grade))?.stock.push(s);
 const patterns:Pattern[]=[],unfilled:Cut[]=[],details:CutPlan['optimizer']['groups']=[],baselines:CutTotals[]=[];let completed=0,remainingBudget=1000000;
 onProgress({phase:'preparing',completed:0,total:groups.size});
 for(const g of groups.values()){
  const desc=[...g.demand].sort((a,b)=>b.length-a.length||a.member.localeCompare(b.member)||a.mark.localeCompare(b.mark)),stock=[...g.stock].sort((a,b)=>a.id.localeCompare(b.id)),asc=[...desc].reverse(),ends:Cut[]=[];for(let l=0,r=desc.length-1;l<=r;l++,r--){ends.push(desc[l]);if(l<r)ends.push(desc[r]);}
  let best=greedy(desc,stock,kerf,min,'best-fit','Best fit decreasing');baselines.push(best.totals);
  const trials:[Cut[],Strategy,string][]=[[desc,'opened-first','Opened first decreasing'],[desc,'longest-stock','Longest stock decreasing'],[desc,'offcuts-first','Offcuts first decreasing'],[asc,'best-fit','Best fit increasing'],[ends,'opened-first','Large/small alternating'],[shuffled(desc,104729),'opened-first','Fixed shuffle 104729'],[shuffled(desc,13007),'offcuts-first','Fixed shuffle 13007']];
  for(const [order,strategy,name] of trials){const r=greedy(order,stock,kerf,min,strategy,name);if(compare(r.totals,best.totals,objective)<0)best=r;}
  const count=total(stock.map(s=>s.quantity-s.reserved));let status:'complete'|'budget'|'size'='size',nodes=0;
  if(desc.length<=14&&count<=16){const e=exact(desc,stock,kerf,min,objective,best,Math.min(nodeBudget,Math.max(1,remainingBudget)));best=e.best;nodes=e.nodes;remainingBudget-=nodes;status=e.complete?'complete':'budget';}
  for(const pattern of best.patterns)patterns.push(pattern);for(const cut of best.unfilled)unfilled.push(cut);details.push({diameter:desc[0].diameter,grade:desc[0].grade,demand:desc.length,stock:count,candidate:best.candidate,exact:status,nodes});onProgress({phase:'searching',completed:++completed,total:groups.size});
 }
 const addTotals=(values:CutTotals[]):CutTotals=>Object.fromEntries(Object.keys(values[0]||{unfilled:0,unfilledLength:0,inputLength:0,cutLength:0,kerfLoss:0,scrap:0,offcut:0,standardInputLength:0,stockBars:0}).map(k=>[k,total(values.map(v=>v[k as keyof CutTotals]))])) as CutTotals;
 const baseline=addTotals(baselines),byId=new Map(stock.map(s=>[s.id,s])),selectedBins:Bin[]=patterns.map((p,index)=>({stock:byId.get(p.stockId)!,index,length:units(p.length,'สต็อก'),remaining:units(p.remainder,'เศษ'),cuts:p.cuts,offcut:isOffcut(byId.get(p.stockId)!)})),selected=result(selectedBins,unfilled,kerf,min,'selected').totals,optimal=details.every(g=>g.exact==='complete');
 const plan:CutPlan={patterns,unfilled,inputLength:selected.inputLength,cutLength:selected.cutLength,kerfLoss:selected.kerfLoss,scrap:selected.scrap,offcut:selected.offcut,standardInputLength:selected.standardInputLength,method:optimal?'Bounded exhaustive search / entered stock optimum':'Multi-strategy / heuristic',optimizer:{version:CUT_OPTIMIZER_VERSION,objective,optimal,baseline,selected,groups:details}};
 onProgress({phase:'checking',completed:completed,total:groups.size});assertCutPlan(plan,demand,stock,kerfMm,minOffcutMm);return plan;
}

export function assertCutPlan(plan:Pick<CutPlan,'patterns'|'unfilled'|'inputLength'|'cutLength'|'kerfLoss'|'scrap'|'offcut'>,demand:Cut[],stock:Stock[],kerfMm:number,minMm:number){
 const kerf=units(kerfMm,'รอยตัด'),min=units(minMm,'เศษเก็บ'),inventory=new Map(stock.map(s=>[s.id,s])),used=new Map<string,number>(),counts=new Map<string,number>();
 const signature=(c:Cut)=>JSON.stringify([c.memberId||'',c.barId||'',c.member,c.mark,c.length,c.diameter,c.grade]);for(const c of demand){const k=signature(c);counts.set(k,(counts.get(k)||0)+1);}
 const consume=(c:Cut)=>{const k=signature(c),n=counts.get(k)||0;if(!n)throw Error('แผนตัดมีชิ้นงานซ้ำหรือไม่ตรง BBS');counts.set(k,n-1);};
 let input=0,cut=0,loss=0,scrap=0,offcut=0;
 for(const p of plan.patterns){const s=inventory.get(p.stockId);if(!s||!p.cuts.length||p.length!==s.length||p.diameter!==s.diameter||p.grade!==s.grade)throw Error('แผนตัดไม่ตรงสต็อก');used.set(s.id,(used.get(s.id)||0)+1);let occupied=0;for(const c of p.cuts){if(c.diameter!==p.diameter||c.grade!==p.grade)throw Error('แผนตัดปนขนาดหรือเกรดเหล็ก');consume(c);occupied+=units(c.length,'ชิ้นงาน')+kerf;cut+=units(c.length,'ชิ้นงาน');loss+=kerf;}
  const length=units(p.length,'สต็อก'),rest=units(p.remainder,'เศษ');if(rest<0||occupied+rest!==length)throw Error('แผนตัดเกินความยาวสต็อกหรือยอดไม่ลงตัว');input+=length;if(rest<min)scrap+=rest;else offcut+=rest;
 }
 for(const c of plan.unfilled)consume(c);if([...counts.values()].some(n=>n!==0))throw Error('แผนตัดตกหล่นชิ้นงาน');for(const [id,n] of used)if(n>inventory.get(id)!.quantity-inventory.get(id)!.reserved)throw Error('แผนตัดใช้สต็อกเกินจำนวนพร้อมใช้');
 for(const [name,n] of Object.entries({inputLength:input,cutLength:cut,kerfLoss:loss,scrap,offcut}))if(units(plan[name as keyof typeof plan] as number,name)!==n)throw Error('ยอดรวมแผนตัดไม่ตรงรายการ');
}
