import {describe,expect,it} from 'vitest';
import {extractDrawingText,extractionToMemberPatch} from '../src/domain/drawingExtraction';
import {blankMember} from '../src/domain/model';

describe('drawing extraction draft',()=>{
  it('extracts common dimensions and reinforcement notation from PDF text',()=>{
    const result=extractDrawingText({attachmentId:'pdf-1',fileName:'F1.pdf',pages:1,category:'Foundation',text:'F1 SIZE 2400 x 2400 x 600 COVER 75 BOTTOM 12T16@200 EACH WAY'});
    expect(result.dimensions.map(d=>[d.axis,d.value])).toEqual(expect.arrayContaining([['cover',75],['x',2400],['y',2400],['z',600]]));
    expect(result.reinforcement.some(row=>row.diameter===16&&row.spacing===200)).toBe(true);
    expect(result.status).toBe('Needs review');
  });

  it('does not invent data when a scanned PDF has no text layer',()=>{
    const result=extractDrawingText({attachmentId:'pdf-2',fileName:'scan.pdf',pages:2,category:'Beam',text:''});
    expect(result.dimensions).toHaveLength(0);
    expect(result.reinforcement).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('OCR');
  });

  it('maps only explicit extracted X/Y/Z dimensions into a member draft',()=>{
    const member=blankMember('Beam','B-01');
    const result=extractDrawingText({attachmentId:'pdf-3',fileName:'B1.pdf',pages:1,category:'Beam',text:'L=7200 W=300 H=650 T16@200'});
    const patch=extractionToMemberPatch(result,member);
    expect(patch.dimensions).toEqual({x:7200,y:300,z:650});
    expect(patch.hasDimensionChanges).toBe(true);
  });
});

