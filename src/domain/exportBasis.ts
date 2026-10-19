/** Optional preview binding. Older callers can still export without a preview. */
export type ExportBasis = {
  expectedVersion?: number;
  expectedStockEpoch?: string;
  expectedRevisionDigest?: string;
  expectedRevisionStatus?: string;
  expectedRevisionStateDigest?: string;
};

export function exportBasisProblem(data: ExportBasis & {revisionId?: string}, current: {version: number; digest?: string; status?: string;stockEpoch?:string;stateDigest?:string}): string {
  const working = data.expectedVersion !== undefined;
  const frozen = data.expectedRevisionDigest !== undefined || data.expectedRevisionStatus !== undefined || data.expectedRevisionStateDigest !== undefined;
  if (working && (data.revisionId || frozen)) return 'ข้อมูลยืนยันชุดส่งออกใช้ Working และ Revision พร้อมกันไม่ได้';
  if (frozen && !data.revisionId) return 'ข้อมูลยืนยัน Revision ต้องระบุฉบับที่ตรึงไว้';
  if (working && (!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion! < 1)) return 'รุ่นข้อมูลยืนยันชุดส่งออกไม่ถูกต้อง';
  if (data.expectedRevisionDigest !== undefined && !/^[a-f0-9]{64}$/.test(data.expectedRevisionDigest)) return 'Checksum ยืนยัน Revision ไม่ถูกต้อง';
  if(data.expectedRevisionStateDigest!==undefined&&(typeof data.expectedRevisionStateDigest!=='string'||!/^[a-f0-9]{64}$/.test(data.expectedRevisionStateDigest)))return 'Checksum สถานะ/หลักฐาน Revision ไม่ถูกต้อง';
  if (data.expectedRevisionStatus !== undefined && !['Frozen','Superseded','Issued','TestIssued'].includes(data.expectedRevisionStatus)) return 'สถานะยืนยัน Revision ไม่ถูกต้อง';
  if (working && data.expectedVersion !== current.version) return 'ข้อมูลทำงานเปลี่ยนจากตัวอย่างก่อนส่งออก กรุณาโหลดข้อมูลล่าสุดแล้วตรวจขอบเขตอีกครั้ง';
  if(data.expectedStockEpoch!==undefined&&(typeof data.expectedStockEpoch!=='string'||data.expectedStockEpoch.length>80||data.revisionId))return 'รุ่นสต็อกยืนยันไม่ถูกต้อง';
  if(data.expectedStockEpoch!==undefined&&data.expectedStockEpoch!==(current.stockEpoch||''))return 'สต็อกเปลี่ยนจากตัวอย่าง ให้โหลดทะเบียนใหม่ก่อนส่งออก';
  if (data.expectedRevisionDigest !== undefined && data.expectedRevisionDigest !== current.digest) return 'Revision เปลี่ยนจากตัวอย่างก่อนส่งออก กรุณาเลือกฉบับใหม่อีกครั้ง';
  if (data.expectedRevisionStatus !== undefined && data.expectedRevisionStatus !== current.status) return 'สถานะ Revision เปลี่ยนจากตัวอย่างก่อนส่งออก กรุณาโหลดฉบับนี้อีกครั้ง';
  if(data.expectedRevisionStateDigest!==undefined&&data.expectedRevisionStateDigest!==current.stateDigest)return 'สถานะ/หลักฐาน Revision เปลี่ยนจากตัวอย่างก่อนส่งออก กรุณาโหลดฉบับนี้อีกครั้ง';
  return '';
}
