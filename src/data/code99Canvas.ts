import type {Code99Print} from '../domain/code99Print';
import {generalSketch,type GeneralBar} from '../domain/generalBar';
import {tangentSketch,type TangentBar} from '../domain/tangentBar';

export function code99Canvas(plan:Extract<Code99Print,{available:true}>,part=0){
 const canvas=document.createElement('canvas');canvas.width=1140;canvas.height=660;
 const c=canvas.getContext('2d');if(!c)throw Error('ไม่สามารถสร้างรูป Code99 ใน Excel ได้');
 c.scale(1.5,1.5);c.fillStyle='#fff';c.fillRect(0,0,760,440);
 const e=plan.drawing as GeneralBar|TangentBar,acuteSketch='tangents' in e?tangentSketch(e,760,440,part):undefined,s=acuteSketch??generalSketch(e,part);
 const line=(a:number[],b:number[])=>{c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();};
 c.strokeStyle='#217b64';c.lineWidth=1.5;c.beginPath();s.outline.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();
 c.strokeStyle='#92aaa2';c.lineWidth=.7;c.setLineDash([3,3]);c.beginPath();s.centerline.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.setLineDash([]);
 if(acuteSketch){c.strokeStyle='#4574a5';c.lineWidth=.8;c.font='11px Arial';
  const near=new Set(s.dimensions.flatMap(d=>{const n=Number(d.label.slice(1));return [n-1,n];}));
  for(const t of acuteSketch.tangents.filter(t=>!('chain' in e)||near.has(Number(t.label.slice(1,3))))){c.setLineDash([6,3]);line(t.from,t.to);c.setLineDash([]);line(t.touch,[t.labelAt[0]-3,t.labelAt[1]-3]);c.fillStyle='#fff';c.fillRect(t.labelAt[0]-2,t.labelAt[1]-12,t.label.length*7+4,16);c.fillStyle='#4574a5';c.fillText(t.label,...t.labelAt);}
 }
 c.font='16px Arial';c.textAlign='center';c.textBaseline='middle';
 for(const d of s.dimensions){c.strokeStyle='#8da19c';c.lineWidth=.7;line(d.from,d.a);line(d.to,d.b);c.strokeStyle='#35584d';line(d.a,d.b);for(const p of [d.a,d.b])line([p[0]-3,p[1]+3],[p[0]+3,p[1]-3]);const width=c.measureText(d.text).width;c.fillStyle='#fff';c.fillRect(d.labelAt[0]-width/2-3,d.labelAt[1]-11,width+6,22);c.fillStyle='#244f40';c.fillText(d.text,...d.labelAt);}
 c.font='11px Arial';c.textAlign='left';c.fillStyle='#687d74';for(const v of s.vertices)c.fillText(v.label,v.at[0]+4,v.at[1]-5);
 if(acuteSketch){c.strokeStyle='#8da19c';line(acuteSketch.radius.center,acuteSketch.radius.surface);line(acuteSketch.radius.surface,[acuteSketch.radius.labelAt[0]-5,acuteSketch.radius.labelAt[1]]);c.font='14px Arial';c.fillStyle='#fff';c.fillRect(acuteSketch.radius.labelAt[0]-3,acuteSketch.radius.labelAt[1]-10,190,20);c.fillStyle='#244f40';c.fillText(acuteSketch.radius.text,...acuteSketch.radius.labelAt);}
 return canvas.toDataURL('image/png');
}
