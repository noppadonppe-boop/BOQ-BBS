import type {Bar,Member,Spec,Vec3} from './model';
import {planarPathInputSchema,planarInputPoints,pathPlaneAxes,type PlanarPathInput} from './planarPathInput';
import {BAR_PLACEMENT_POLICY,barPlacementSchema,matrix} from './barPlacement';
import {roundedPath,validateMember} from './engine';

export function buildPlanarPath(member:Member,bar:Bar,spec:Spec,input:PlanarPathInput,anchor:Vec3,normalEnd:number,preserveLayout=false){
 if(spec.barPlacementPolicy!==BAR_PLACEMENT_POLICY)throw Error('เปิดการวางเหล็กรายแท่งใน General Spec ก่อนใช้เครื่องมือสร้างแนวเหล็ก');
 if(!Number.isInteger(bar.count)||bar.count<1||bar.count>2000)throw Error('จำนวนต่อองค์ประกอบต้องเป็นจำนวนเต็ม 1–2000 แท่ง');
 const d=planarPathInputSchema.parse(input);if(d.outsideDiameter<bar.diameter)throw Error('ขนาดผิวนอกต้องไม่น้อยกว่าขนาด nominal');
 if(anchor.length!==3||!anchor.every(Number.isFinite)||!Number.isFinite(normalEnd))throw Error('ระบุพิกัดแม่แบบและปลายช่วงให้ครบ');
 const keep=preserveLayout&&!!bar.placementLayout,normal=pathPlaneAxes[d.plane][2],span=normalEnd-anchor[normal];if(!keep&&bar.count>1&&Math.abs(span)<.001)throw Error('จำนวนมากกว่า1แท่งต้องมีช่วงตำแหน่งที่ไม่ซ้ำกัน');if(!keep&&bar.count===1&&Math.abs(span)>.000001)throw Error('1แท่งให้ปลายช่วงเท่ากับตำแหน่งแม่แบบ ไม่ใช้ค่ากลางของช่วง');
 if(!keep&&bar.count>1&&Math.abs(span)/(bar.count-1)*Math.abs(matrix(d.templateRotation||[0,0,0])[normal*3+normal])<d.outsideDiameter-.000001)throw Error('ช่วงเรียงทำให้ผิวเหล็กของแท่งติดกันทับกัน ทบทวนจำนวนและตำแหน่ง');
 const g=planarInputPoints(d),rounded=roundedPath(g.points as Vec3[],g.centerRadius);if(rounded.errors.length)throw Error(rounded.errors.join(' · '));
 const layout=keep?barPlacementSchema.parse(bar.placementLayout):barPlacementSchema.parse({version:1,reference:d.reference,anchor,pivot:anchor,poses:Array.from({length:bar.count},(_,i)=>{const offset=[0,0,0];offset[normal]=bar.count===1?0:span*i/(bar.count-1);return {id:'P'+String(i+1).padStart(4,'0'),offset,rotation:[0,0,0]};})});
 const candidate:Bar={...bar,shape:'polyline',shapeCode:'99',points:g.points as Vec3[],pathInput:d,outsideDiameter:d.outsideDiameter,radius:g.centerRadius,placementLayout:layout,axis:'X',face:'bottom',start:0,end:0,tail:0,distributionStart:0,distributionEnd:0,curve:undefined,helix:undefined,cutOverride:0,lengthMethod:'centerline',dimensions:undefined,spatialDimensions:undefined,dimensionView:undefined,freeDimensionLeg:undefined,bsDimensionsConfirmed:false,placementConfirmed:false,fabricationInspections:undefined};
 const problems=validateMember({...member,bars:[candidate]},spec);if(problems.length)throw Error(problems.join(' · '));return candidate;
}
