import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {PDFDocument,degrees} from 'pdf-lib';
import {readablePdfInput,readablePdfPageCount,inspectAttachmentDocument} from '../src/data/documentInspection';
import type {Attachment} from '../src/domain/model';

const viewer=vi.hoisted(()=>({getDocument:vi.fn(),destroy:vi.fn(),taskDestroy:vi.fn()}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{workerSrc:''},getDocument:viewer.getDocument}));
const bytes=(file:string)=>new Uint8Array(readFileSync(file)).slice().buffer;
const protectedPdf=()=>bytes('Referrence/BS 8666.pdf');
let plain:ArrayBuffer,cropped:ArrayBuffer;
beforeAll(async()=>{const p=await PDFDocument.create();p.addPage();plain=(await p.save()).slice().buffer;const c=await PDFDocument.create();for(const angle of [0,90,180,270,0]){const page=c.addPage([540,410]);page.setCropBox(30,40,440,250);page.setRotation(degrees(angle));}cropped=(await c.save()).slice().buffer;});
beforeEach(()=>{vi.clearAllMocks();viewer.getDocument.mockImplementation(()=>({promise:Promise.resolve({numPages:24,destroy:viewer.destroy}),destroy:viewer.taskDestroy}));});

describe('shared attachment/source export PDF parser',()=>{
 it('retains a normal PDF document for vector embedding without invoking the raster reader',async()=>{const result=await readablePdfInput(plain);expect(result.pageCount).toBe(1);expect(result.pdf?.getPageCount()).toBe(1);expect(viewer.getDocument).not.toHaveBeenCalled();});
 it('keeps CropBox and rotation in the vector input rather than normalizing source bytes',async()=>{const input=cropped.slice(0),original=new Uint8Array(input).slice(),result=await readablePdfInput(input);expect(result.pageCount).toBe(5);expect(result.pdf?.getPage(1).getRotation().angle).toBe(90);expect(result.pdf?.getPage(1).getCropBox()).toEqual({x:30,y:40,width:440,height:250});expect(new Uint8Array(input)).toEqual(original);expect(viewer.getDocument).not.toHaveBeenCalled();});
 it('requires a successful viewer parse for a protected source and returns no unusable vector document',async()=>{const result=await readablePdfInput(protectedPdf());expect(result).toEqual({pageCount:24});expect(viewer.getDocument).toHaveBeenCalledOnce();expect(viewer.getDocument.mock.calls[0][0].password).toBe('');expect(viewer.destroy).toHaveBeenCalledOnce();});
 it('passes the worker an independent copy so transferring or changing worker bytes cannot alter the original',async()=>{viewer.getDocument.mockImplementation(q=>{q.data.fill(0);return {promise:Promise.resolve({numPages:24,destroy:viewer.destroy}),destroy:viewer.taskDestroy};});const input=protectedPdf(),original=new Uint8Array(input).slice();expect(await readablePdfPageCount(input)).toBe(24);expect(new Uint8Array(input)).toEqual(original);});
 it('rejects a password-required source without retrying passwords and destroys the rejected loading task',async()=>{viewer.getDocument.mockImplementation(()=>({promise:Promise.reject(Object.assign(Error('Password required'),{name:'PasswordException'})),destroy:viewer.taskDestroy}));await expect(readablePdfInput(protectedPdf())).rejects.toMatchObject({code:'failed-precondition',message:expect.stringContaining('รหัสผ่าน')});expect(viewer.getDocument).toHaveBeenCalledOnce();expect(viewer.taskDestroy).toHaveBeenCalledOnce();expect(viewer.destroy).not.toHaveBeenCalled();});
 it('does not treat an invalid source or its encryption flag as evidence of readability',async()=>{viewer.getDocument.mockImplementation(()=>({promise:Promise.reject(Error('Invalid PDF structure')),destroy:viewer.taskDestroy}));await expect(readablePdfInput(new TextEncoder().encode('not a PDF').buffer)).rejects.toThrow('Invalid PDF');expect(viewer.taskDestroy).toHaveBeenCalledOnce();});
 it.each([{pageCount:23},{page:25},{annotations:[{mark:'S01',page:25,x:.2,y:.3}]},{calibrations:{'25':{mmPerPoint:1}}}])('keeps attachment metadata guards for viewer-parsed input: %j',async patch=>{const a={id:'q',name:'reference.pdf',path:'q',memberId:'m',kind:'Detail',revision:'QA',page:1,contentType:'application/pdf',size:1,...patch} as Attachment;await expect(inspectAttachmentDocument(a,new Blob([protectedPdf()]))).rejects.toMatchObject({code:'failed-precondition'});expect(viewer.destroy).toHaveBeenCalledOnce();});
});
