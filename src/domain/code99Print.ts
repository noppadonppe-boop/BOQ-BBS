import type {Bar,Member} from './model';
import {specialBar} from './tangentBar';

export function code99Print(member:Member,bar:Bar){
 const drawing=specialBar(member,bar);
 const frame=bar.pathInput?.basis==='support'?'Declared input plane before template/placement rotations':'First-leg local drawing frame';
 if(!drawing.available)return {available:false as const,drawing,frame,parts:[{number:1,dimensions:[]}],points:drawing.detail.points,reason:drawing.reason};
 const legacyAcute='tangents' in drawing&&!('chain' in drawing);
 const dimensions=drawing.dimensions.map((d,index)=>{
  const leg=legacyAcute?(d.label==='C'?0:d.label==='A'?1:-1):index;
  const bend=legacyAcute&&leg>=0?drawing.angles[1]:drawing.angles[leg+1],hasBend=leg>=0&&(bend||0)>1e-5;
  return {...d,leg:leg<0?null:leg+1,straight:leg<0?null:drawing.detail.legs[leg].straightLength,bendDegrees:hasBend?bend*180/Math.PI:null,innerRadius:hasBend?drawing.innerRadius:null};
 });
 return {available:true as const,drawing,frame,points:drawing.detail.points,reason:'',parts:Array.from({length:Math.ceil(dimensions.length/6)},(_,i)=>({number:i+1,dimensions:dimensions.slice(i*6,i*6+6)}))};
}
export type Code99Print=ReturnType<typeof code99Print>;
