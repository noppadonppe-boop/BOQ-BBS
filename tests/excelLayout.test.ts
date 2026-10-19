import {describe,it,expect} from 'vitest';
import {excelRowRanges,excelSumParts,excelPageBreaks} from '../src/domain/excelLayout';
describe('Printable workbook ranges and physical pagination',()=>{
 it('compresses adjacent source rows without counting duplicates twice',()=>expect(excelRowRanges([9,4,5,5,7,6,12])).toEqual([{first:4,last:7},{first:9,last:9},{first:12,last:12}]));
 it('quotes sheet names and retains disjoint literal source rows',()=>expect(excelSumParts([4,5,9],'M',"Owner's BBS")).toEqual(["SUM('Owner''s BBS'!M4:M5,'Owner''s BBS'!M9)"]));
 it('partitions a 520-row irregular group below formula argument and character limits',()=>{const parts=excelSumParts(Array.from({length:520},(_,i)=>4+i*2),'K');expect(parts).toHaveLength(4);expect(parts.every(p=>p.length<8192&&p.split(',').length<=150)).toBe(true);expect(parts.join()).toContain("'BBS'!K1042");});
 it('does not split an adjacent 520-row group',()=>expect(excelSumParts(Array.from({length:520},(_,i)=>i+4),'M')).toEqual(["SUM('BBS'!M4:M523)"]));
 it('rejects invalid or out-of-range source rows and columns',()=>{for(const n of [0,1.5,1048577,NaN])expect(()=>excelRowRanges([n])).toThrow();expect(()=>excelSumParts([4],"M4);evil")).toThrow();});
 it('breaks by row heights and retains the last record beside the total',()=>{expect(excelPageBreaks([100,100,100,100,100,100,100],606)).toEqual([6]);expect(excelPageBreaks([100,100,100,100,100,100],606)).toEqual([5]);expect(excelPageBreaks([28,60,28,60,28],160)).toEqual([3]);});
 it('preserves an exact-fit page and handles an empty schedule',()=>{expect(excelPageBreaks([100,100],228)).toEqual([]);expect(excelPageBreaks([],606)).toEqual([]);});
 it('rejects oversized records without clipping or silently reducing font size',()=>{expect(()=>excelPageBreaks([600],606)).toThrow();expect(()=>excelPageBreaks([NaN],606)).toThrow();});
});
