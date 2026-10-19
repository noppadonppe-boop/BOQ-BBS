import type {jsPDF as Pdf} from 'jspdf';
import type {Bar} from '../domain/model';
import {helixDrawing} from '../domain/helixDrawing';
export function drawHelix(doc:Pdf,b:Bar,x:number,y:number,w:number,h:number){
 const s=helixDrawing(b);if(!s.available)return false;
 const scale=Math.min(w/s.width,h/s.height),at=(p:number[])=>[x+(w-s.width*scale)/2+p[0]*scale,y+(h-s.height*scale)/2+p[1]*scale],line=(a:number[],b:number[])=>{const p=at(a),q=at(b);doc.line(p[0],p[1],q[0],q[1]);},path=(points:number[][])=>{for(let i=1;i<points.length;i++)line(points[i-1],points[i]);};
 doc.setDrawColor(31,117,88);doc.setLineWidth(.2);s.paths.forEach(path);doc.setDrawColor(146,165,158);doc.setLineWidth(.1);doc.setLineDashPattern([1,1],0);s.centrelines.forEach(path);doc.setLineDashPattern([],0);doc.setDrawColor(80,108,98);s.lines.forEach(([a,b])=>line(a,b));doc.setTextColor(34,59,66);doc.setFontSize(Math.min(12,Math.max(6.5,15*scale/.3528)));for(const l of s.labels){const p=at(l.at);doc.text(l.text,p[0],p[1],{align:'center'});}return true;
}
