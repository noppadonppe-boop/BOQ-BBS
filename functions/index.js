const admin = require('firebase-admin');
const {setGlobalOptions} = require('firebase-functions/v2');
const {onRequest} = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

admin.initializeApp();
setGlobalOptions({region: 'asia-southeast1', maxInstances: 10});

const db = admin.firestore();
const APP_NAME = process.env.APP_NAME || process.env.VITE_APP_NAME || 'my-boq-app';
const ALLOWED_ORIGINS = new Set([
  'https://cmg-boq-bbs.web.app',
  'https://cmg-boq-bbs.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

class GatewayError extends Error {
  constructor(message, status = 400, code = 'invalid-argument') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function decodeStorage(value) {
  if (Array.isArray(value)) return value.map(decodeStorage);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && Array.isArray(value.__formArray)) {
      return value.__formArray.map(decodeStorage);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeStorage(item)]));
  }
  return value;
}

function stringValue(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function validId(value) {
  return /^[a-zA-Z0-9_-]{1,80}$/.test(String(value || ''));
}

function providerConfigPath() {
  return `${APP_NAME}/root/apiProviders/config`;
}

function profilePath(email) {
  return `${APP_NAME}/root/users/${String(email).trim().toLowerCase()}`;
}

function profileRoles(profile) {
  return Array.isArray(profile?.roles) ? profile.roles : profile?.role ? [profile.role] : [];
}

function isMasterAdmin(profile) {
  return profile?.status === 'approved' && profileRoles(profile).includes('MasterAdmin');
}

function approvedProfile(profile, decodedToken) {
  const email = stringValue(decodedToken.email).toLowerCase();
  return Boolean(
    profile &&
    profile.uid === decodedToken.uid &&
    String(profile.email || '').toLowerCase() === email &&
    profile.status === 'approved',
  );
}

async function authenticate(req) {
  const authorization = String(req.get('authorization') || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new GatewayError('ต้องเข้าสู่ระบบก่อนใช้งานบริการวิเคราะห์แบบ', 401, 'unauthenticated');

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    logger.warn('AI drawing token rejected', {message: error instanceof Error ? error.message : String(error)});
    throw new GatewayError('Token ของ Firebase ไม่ถูกต้องหรือหมดอายุ', 401, 'unauthenticated');
  }
  if (!decodedToken.email || decodedToken.firebase?.sign_in_provider === 'anonymous') {
    throw new GatewayError('ต้องใช้บัญชีผู้ใช้ที่ยืนยันอีเมลแล้ว', 403, 'permission-denied');
  }

  const snapshot = await db.doc(profilePath(decodedToken.email)).get();
  const profile = snapshot.exists ? decodeStorage(snapshot.data()) : null;
  if (!approvedProfile(profile, decodedToken)) {
    throw new GatewayError('บัญชีหรือสิทธิ์ผู้ใช้ยังไม่ได้รับอนุมัติ', 403, 'permission-denied');
  }
  return {decodedToken, profile};
}

async function assertProjectAccess(authContext, context) {
  const projectId = stringValue(context.projectId);
  if (!validId(projectId)) throw new GatewayError('ข้อมูลโครงการไม่ถูกต้อง', 400, 'invalid-argument');
  const projectSnapshot = await db.doc(`projects/${projectId}`).get();
  if (!projectSnapshot.exists) throw new GatewayError('ไม่พบโครงการ', 404, 'not-found');
  if (isMasterAdmin(authContext.profile)) return projectId;

  const assignedProjects = Array.isArray(authContext.profile.assignedProjects)
    ? authContext.profile.assignedProjects.map(String)
    : [];
  if (!assignedProjects.includes(projectId)) {
    throw new GatewayError('ไม่มีสิทธิ์ใช้บริการวิเคราะห์ของโครงการนี้', 403, 'permission-denied');
  }
  return projectId;
}

async function parseAnalysisRequest(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new GatewayError('คำขอวิเคราะห์ต้องส่งเฉพาะข้อมูลอ้างอิงแบบ JSON โดยให้ Backend ดึงไฟล์จาก Storage', 415, 'invalid-argument');
  }
  let body = req.body;
  if (Buffer.isBuffer(req.rawBody)) body = req.rawBody.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { throw new GatewayError('ข้อมูลคำขอวิเคราะห์ไม่ใช่ JSON ที่ถูกต้อง', 400, 'invalid-argument'); }
  }
  const context = body?.context && typeof body.context === 'object' ? body.context : body;
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new GatewayError('ต้องระบุ context ของแบบ', 400, 'invalid-argument');
  return {context};
}

async function loadAttachmentFromStorage(projectId, context) {
  const attachmentId = stringValue(context.attachmentId);
  const snapshot = await db.doc(`projects/${projectId}/attachments/${attachmentId}`).get();
  const attachment = snapshot.exists ? decodeStorage(snapshot.data()) : {};
  attachment.id = stringValue(attachment.id, attachmentId);
  attachment.memberId = stringValue(attachment.memberId, stringValue(context.memberId));
  attachment.name = stringValue(attachment.name, stringValue(context.fileName, 'drawing'));
  attachment.contentType = stringValue(attachment.contentType, stringValue(context.contentType, 'application/octet-stream'));
  attachment.pageCount = Number(attachment.pageCount) || Number(context.pages) || 1;
  const path = stringValue(attachment.path);

  let buffer;
  try {
    [buffer] = await admin.storage().bucket().file(path).download();
  } catch (error) {
    logger.error('AI drawing source download failed', {projectId, attachmentId, message: error instanceof Error ? error.message : String(error)});
    throw new GatewayError('Backend ไม่สามารถดึงไฟล์ต้นฉบับจาก Firebase Storage ได้', 502, 'storage-error');
  }
  return {
    file: {buffer, filename: attachment.name.replace(/[\\/]/g, '_').slice(0, 250), mimeType: attachment.contentType, size: buffer.length},
    attachment,
  };
}

function selectedProvider(config) {
  const activeProvider = stringValue(config?.activeProvider);
  const provider = config?.providers?.[activeProvider];
  if (!['openai', 'anthropic', 'google-ai-studio'].includes(activeProvider) || !provider) {
    throw new GatewayError('ยังไม่ได้เลือกค่าย AI ในหน้า จัดการ API', 412, 'failed-precondition');
  }
  if (!stringValue(provider.apiKey)) {
    throw new GatewayError('ค่าย AI ที่เลือกยังไม่มี API Key', 412, 'failed-precondition');
  }
  if (!stringValue(provider.model)) {
    throw new GatewayError('ค่าย AI ที่เลือกยังไม่มีโมเดล', 412, 'failed-precondition');
  }
  return {activeProvider, provider};
}

function base64Data(file) { return file.buffer.toString('base64'); }
function dataUrl(file) { return `data:${file.mimeType};base64,${base64Data(file)}`; }

function providerInstruction(context, file) {
  const requestedFields = Array.isArray(context.requestedFields) ? context.requestedFields : [];
  return [
    'คุณเป็นวิศวกรตรวจแบบโครงสร้าง ช่วยอ่านแบบจากไฟล์ที่แนบและส่งผลลัพธ์เป็น JSON object เท่านั้น ห้ามใส่ Markdown หรือข้อความนอก JSON',
    'อ่านข้อมูลจากไฟล์จริงเป็นหลักและส่งกลับเป็นข้อมูลสำหรับพรีวิว/ตรวจทานเท่านั้น ไม่ต้องรับรองวิศวกรรมหรือเดาค่าที่มองไม่เห็น',
    'หน่วยใน JSON ต้องเป็นมิลลิเมตรเสมอ ถ้าในแบบพิมพ์เป็นเมตร เช่น 2.20, 1.75, 0.35, 0.75 ให้แปลงเป็น 2200, 1750, 350, 750 mm และเก็บตัวเลข/ข้อความเดิมไว้ใน evidence.quote',
    'อย่าใช้ currentMember หรือค่า Default เป็นค่าที่อ่านจากแบบ หากอ่านไม่ชัดให้เว้นฟิลด์นั้นไว้และใส่ warnings แทน',
    'ไฟล์อาจมีหลายรูป/หลาย Detail และหลายชุดมิติ ให้คืนทุกค่าที่สำคัญใน dimensions พร้อม field และ evidence ที่บอกหน้า/ข้อความต้นทาง ไม่รวมหลายฐานรากเข้าด้วยกัน',
    'รายการ reinforcement เป็นข้อมูลอ้างอิงจากแบบเท่านั้น ห้ามสร้าง shape/พิกัด/ยาวตัด หรือเดา Mark ที่ไม่มีในแบบ',
    `ไฟล์: ${stringValue(context.fileName, file.filename)}; จำนวนหน้าที่ทราบ: ${Number(context.pages) || 1}; หมวด: ${stringValue(context.category, 'Custom')}`,
    `รหัสสมาชิก: ${stringValue(context.memberCode)}; สมาชิก: ${stringValue(context.memberId)}`,
    `ฟิลด์ที่ต้องพยายามอ่าน: ${requestedFields.join(', ') || 'x, y, z, cover, description, reinforcement, quantity preview'}`,
    `ค่าปัจจุบันของสมาชิกเพื่อใช้เปรียบเทียบเท่านั้น: ${JSON.stringify(context.currentMember || {})}`,
    'รูปแบบ JSON ที่ต้องส่งกลับ:',
    JSON.stringify({
      version: 1, attachmentId: stringValue(context.attachmentId, ''), fileName: stringValue(context.fileName, file.filename),
      pages: Number(context.pages) || 1, category: stringValue(context.category, 'Custom'), confidence: 'Low',
      dimensions: [{axis: 'x', value: 0, label: 'ตัวอย่างรูปแบบเท่านั้น', source: 'หน้า 1'}],
      reinforcement: [{mark: 'B1', diameter: 16, spacing: 200, count: 1, grade: 'SD40', axis: 'X', face: 'bottom', source: 'หน้า 1'}],
      fields: {description: 'ข้อความที่อ่านได้', x: 0, y: 0, z: 0, cover: 0},
      calculated: {concrete: 0, formwork: 0, rebar: 0, quantity: 0},
      evidence: [{page: 1, field: 'x', quote: 'ข้อความหรือมิติที่อ่านจากแบบ'}], textSample: 'ข้อความสำคัญที่อ่านได้จากแบบ', warnings: [],
    }),
    'ค่า 0 ในตัวอย่างมีไว้แสดงชนิดข้อมูลเท่านั้น ห้ามส่งค่า 0 เว้นแต่เป็นค่าที่ระบุจริงในแบบ และต้องตอบกลับเป็น JSON หนึ่ง object เท่านั้น',
  ].join('\n');
}

// ---------- task "shape": read a custom element's concrete shape (parts + levels + piles) ----------
function shapeInstruction(context, file) {
  const current = context.currentShape && typeof context.currentShape === 'object' ? context.currentShape : null;
  return [
    'คุณเป็นวิศวกรตรวจแบบโครงสร้าง ช่วยอ่าน "รูปทรงคอนกรีต" ขององค์ประกอบพิเศษจากไฟล์แบบที่แนบ (แปลน / รูปตัด / Top view / 3D) และตอบเป็น JSON object เท่านั้น ห้ามมี Markdown',
    'แยกรูปทรงเป็นชิ้นส่วนแนวตั้ง แต่ละชิ้นคือรูปในแปลนยกขึ้นจากระดับล่าง z0 สูง height: shape = box (x,y,w,d) | polygon (points [[x,y],...]) | circle (cx,cy,diameter,inner: 0 = ทรงกระบอกตัน, >0 = ผนังกลม/ปล่องกลม) | shaft (x,y,w,d,wall ปล่องสี่เหลี่ยม)',
    'role = solid (คอนกรีต) หรือ void (ช่องเปิด/หลุม/ร่องลดระดับ ที่หักออก) · stage = ลำดับการเท (First-stage = 1, Second-stage = 2) · ชิ้นส่วนซ้อนกันได้ ระบบนับปริมาตรครั้งเดียว',
    'พิกัด: หน่วย mm เสมอ (แปลงเมตรเป็น mm) · จุดกำเนิด X=0,Y=0 ที่มุมล่างซ้ายของกรอบแปลนคอนกรีตทั้งหมด X ไปทางขวา Y ขึ้นบนในแปลน · Z=0 ที่ผิวล่างของคอนกรีตต่ำสุด (ไม่รวม Lean) Z ขึ้นบน · ใช้ระดับ (เช่น -0.250) และความหนาในรูปตัดหาค่า z0 / height',
    'ใช้ผลรวมมิติย่อยตรวจกับมิติรวม ถ้าไม่ตรงกันให้ใส่ใน conflicts · ห้ามเดามิติที่ไม่มีในแบบ ให้ใส่คำถามใน missing (part = ชื่อชิ้นส่วน, field, question) และเว้นค่านั้นเป็น null',
    'เสาเข็ม (ถ้ามี): piles = {type: round|square, size (Ø mm), length (m, null ถ้าไม่ระบุ), cutoff (mm), embed (mm ฝังในคอนกรีต), positions [[x,y],...]} · Lean / ทราย: site = {leanThickness, leanProjection, excavationDepth (null ถ้าไม่ระบุ), workingSpace: null, slope: 0}',
    'ผนัง/พื้นที่หล่อต่อเนื่องแต่ไม่ใช่ส่วนนี้ (RC WALL, FLOOR SLAB) ให้ใส่ใน references ไม่ใช่ parts · ข้อความเหล็ก (เช่น Y32-150 (B), Y16-200 LOOPS, 15d) ให้ใส่ใน rebarNotes ห้ามสร้างเหล็ก',
    'ทุกชิ้นส่วนต้องมี source บอกรูป/หน้า/ข้อความที่ใช้ เช่น "Plan F-01 · 9200" หรือ "Section 1-1 · 2000"',
    current ? `รูปทรงที่ได้จากไฟล์ก่อนหน้า (ปรับปรุงและเติมให้ครบด้วยไฟล์นี้ คงค่าที่ไม่ขัดแย้ง ใช้ชื่อชิ้นส่วนเดิม): ${JSON.stringify(current).slice(0, 12000)}` : 'ยังไม่มีรูปทรงจากไฟล์ก่อนหน้า',
    `บทบาทของไฟล์ตามผู้ใช้: ${stringValue(context.drawingRole, 'ไม่ระบุ (อาจมีทั้งแปลนและรูปตัดในหน้าเดียว)')} · ไฟล์: ${stringValue(context.fileName, file.filename)} · หน้า: ${Number(context.pages) || 1}`,
    'รูปแบบ JSON:',
    JSON.stringify({version: 1, confidence: 'Medium', parts: [{label: 'ฐานหลัก', role: 'solid', shape: 'box', x: 0, y: 0, w: 0, d: 0, z0: 0, height: 0, stage: 1, source: 'Plan · Section'}],
      piles: {type: 'round', size: 0, length: null, cutoff: 0, embed: 0, positions: [[0, 0]]}, site: {leanThickness: 0, leanProjection: 0, excavationDepth: null, workingSpace: null, slope: 0},
      references: [{label: 'RC WALL 300', source: 'Section 1-1'}], rebarNotes: [{text: 'Y32-150 (B)', meaning: 'เหล็กล่าง DB32@150', source: 'Section 1-1'}],
      missing: [{part: 'ตอม่อตัว L', field: 'd', question: 'ความยาวขาแนว Y ไม่พบในแบบ'}], conflicts: [], warnings: []}),
    'ค่า 0 ในตัวอย่างแสดงชนิดข้อมูลเท่านั้น ต้องตอบเป็น JSON หนึ่ง object',
  ].join('\n');
}
function normaliseShapeProposal(raw, context, providerName, model) {
  const r = raw?.result || raw || {};
  const num = (v, min = -200000) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= 200000 ? n : null; };
  const text = (v, max = 200) => stringValue(v).slice(0, max);
  const parts = (Array.isArray(r.parts) ? r.parts : []).slice(0, 40).map((p, i) => {
    const shape = ['box', 'polygon', 'circle', 'shaft'].includes(p?.shape) ? p.shape : 'box';
    const out = {label: text(p?.label, 80) || `ชิ้นส่วน ${i + 1}`, role: p?.role === 'void' ? 'void' : 'solid', shape, z0: num(p?.z0), height: num(p?.height, 0), stage: Math.max(1, Math.min(9, Math.round(Number(p?.stage) || 1))), source: text(p?.source)};
    if (shape === 'box' || shape === 'shaft') Object.assign(out, {x: num(p?.x), y: num(p?.y), w: num(p?.w, 0), d: num(p?.d, 0)}, shape === 'shaft' ? {wall: num(p?.wall, 0)} : {});
    if (shape === 'circle') Object.assign(out, {cx: num(p?.cx), cy: num(p?.cy), diameter: num(p?.diameter, 0), inner: num(p?.inner, 0) ?? 0});
    if (shape === 'polygon') out.points = (Array.isArray(p?.points) ? p.points : []).slice(0, 64).map((q) => [num(q?.[0]), num(q?.[1])]).filter((q) => q[0] !== null && q[1] !== null);
    return out;
  });
  const pl = r.piles && typeof r.piles === 'object' ? r.piles : null;
  const piles = pl ? {type: pl.type === 'square' ? 'square' : 'round', size: num(pl.size, 0), length: num(pl.length, 0), cutoff: num(pl.cutoff, 0) ?? 0, embed: num(pl.embed, 0) ?? 0,
    positions: (Array.isArray(pl.positions) ? pl.positions : []).slice(0, 100).map((q) => [num(q?.[0]), num(q?.[1])]).filter((q) => q[0] !== null && q[1] !== null)} : null;
  const st = r.site && typeof r.site === 'object' ? r.site : null;
  const site = st ? {leanThickness: num(st.leanThickness, 0), leanProjection: num(st.leanProjection, 0), excavationDepth: num(st.excavationDepth, 0), workingSpace: num(st.workingSpace, 0), slope: num(st.slope, 0)} : null;
  const list = (v, map, max = 60) => (Array.isArray(v) ? v : []).slice(0, max).map(map).filter(Boolean);
  return {
    version: 1, task: 'shape', analysisId: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, provider: providerName, model,
    attachmentId: stringValue(context.attachmentId), fileName: stringValue(context.fileName),
    confidence: ['High', 'Medium', 'Low'].includes(r.confidence) ? r.confidence : 'Low', parts, piles, site,
    references: list(r.references, (x) => text(x?.label) ? {label: text(x.label), source: text(x?.source)} : null),
    rebarNotes: list(r.rebarNotes, (x) => text(x?.text) ? {text: text(x.text), meaning: text(x?.meaning), source: text(x?.source)} : null),
    missing: list(r.missing, (x) => text(x?.question) ? {part: text(x?.part, 80), field: text(x?.field, 40), question: text(x.question, 300)} : null),
    conflicts: list(r.conflicts, (x) => typeof x === 'string' ? x.slice(0, 300) : text(x?.text || x?.question, 300) || null),
    warnings: list(r.warnings, (x) => stringValue(x).slice(0, 300) || null, 30),
  };
}

async function readProviderResponse(response, providerName) {
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) {
    const providerMessage = stringValue(body?.error?.message || body?.error?.status || body?.message);
    logger.error('AI provider request failed', {provider: providerName, status: response.status, message: providerMessage.slice(0, 500)});
    throw new GatewayError(`บริการ ${providerName} ตอบกลับผิดพลาด (${response.status})`, 502, 'provider-error');
  }
  return body;
}

function openAiText(body) {
  if (typeof body?.output_text === 'string') return body.output_text;
  const parts = [];
  for (const item of body?.output || []) for (const content of item?.content || []) if (typeof content?.text === 'string') parts.push(content.text);
  return parts.join('\n');
}

function providerStreamText(providerName, event) {
  if (providerName === 'OpenAI' && event?.type === 'response.output_text.delta') return stringValue(event.delta);
  if (providerName === 'Anthropic' && event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') return stringValue(event.delta.text);
  if (providerName === 'Google AI Studio') {
    return (event?.candidates?.[0]?.content?.parts || []).filter((part) => typeof part?.text === 'string').map((part) => part.text).join('');
  }
  return '';
}

function providerResponseText(providerName, body) {
  if (providerName === 'OpenAI') return openAiText(body);
  if (providerName === 'Anthropic') return (body.content || []).filter((item) => item?.type === 'text').map((item) => item.text).join('\n');
  return (body.candidates?.[0]?.content?.parts || []).filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n');
}

async function readProviderStream(response, providerName) {
  if (!response.ok) {
    const raw = await response.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const providerMessage = stringValue(body?.error?.message || body?.error?.status || body?.message);
    logger.error('AI provider request failed', {provider: providerName, status: response.status, message: providerMessage.slice(0, 500)});
    throw new GatewayError(`บริการ ${providerName} ตอบกลับผิดพลาด (${response.status})`, 502, 'provider-error');
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/event-stream')) {
    const raw = await response.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { throw new GatewayError(`บริการ ${providerName} ส่งข้อมูลที่อ่านไม่ได้`, 502, 'provider-error'); }
    const text = providerResponseText(providerName, body);
    if (!text) throw new GatewayError(`${providerName} ไม่ส่งผลวิเคราะห์กลับมา`, 502, 'provider-error');
    return text;
  }

  if (!response.body) throw new GatewayError(`บริการ ${providerName} ไม่เปิด Stream`, 502, 'provider-error');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const consume = (frame) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n').trim();
    if (!data || data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { return; }
    text += providerStreamText(providerName, event);
  };
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) consume(frame);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
  if (!text) throw new GatewayError(`${providerName} ไม่ส่งผลวิเคราะห์กลับมา`, 502, 'provider-error');
  return text;
}

async function callOpenAi(apiKey, model, thinking, file, prompt, signal) {
  const content = file.mimeType === 'application/pdf'
    ? [{type: 'input_file', filename: file.filename, file_data: dataUrl(file)}, {type: 'input_text', text: prompt}]
    : [{type: 'input_image', image_url: dataUrl(file), detail: 'high'}, {type: 'input_text', text: prompt}];
  const body = {model, store: false, stream: true, input: [{role: 'user', content}]};
  if (thinking?.kind === 'openai-reasoning-effort') body.reasoning = {effort: thinking.effort};
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: {'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json'}, body: JSON.stringify(body), signal,
  });
  return readProviderStream(response, 'OpenAI');
}

function anthropicContent(file, prompt) {
  const source = {type: 'base64', media_type: file.mimeType, data: base64Data(file)};
  const document = file.mimeType === 'application/pdf' ? {type: 'document', source, title: file.filename} : {type: 'image', source};
  return [document, {type: 'text', text: prompt}];
}

async function callAnthropic(apiKey, model, thinking, file, prompt, signal) {
  const body = {model, max_tokens: 12000, stream: true, messages: [{role: 'user', content: anthropicContent(file, prompt)}]};
  if (thinking?.kind === 'anthropic-adaptive-effort') {
    body.thinking = {type: 'adaptive'};
    body.output_config = {effort: thinking.effort};
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: {'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'}, body: JSON.stringify(body), signal,
  });
  return readProviderStream(response, 'Anthropic');
}

async function callGoogle(apiKey, model, thinking, file, prompt, signal) {
  const thinkingConfig = {};
  if (thinking?.kind === 'gemini-thinking-level') thinkingConfig.thinkingLevel = thinking.level;
  if (thinking?.kind === 'gemini-thinking-budget') thinkingConfig.thinkingBudget = thinking.budgetTokens;
  const generationConfig = {responseMimeType: 'application/json'};
  if (Object.keys(thinkingConfig).length) generationConfig.thinkingConfig = thinkingConfig;
  const body = {contents: [{role: 'user', parts: [{inlineData: {mimeType: file.mimeType, data: base64Data(file)}}, {text: prompt}]}], generationConfig};
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {method: 'POST', headers: {'x-goog-api-key': apiKey, 'content-type': 'application/json'}, body: JSON.stringify(body), signal});
  return readProviderStream(response, 'Google AI Studio');
}

function parseModelJson(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new GatewayError('ผลลัพธ์จาก AI ไม่ใช่ JSON ที่รองรับ', 502, 'provider-error');
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { throw new GatewayError('ผลลัพธ์จาก AI อ่านเป็น JSON ไม่ได้', 502, 'provider-error'); }
}

function positiveNumber(value, max = 200000) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= max ? number : undefined;
}

function nonnegativeNumber(value, max = 200000) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : undefined;
}

function dimensionMillimetres(value, axis, context, source = '') {
  const number = positiveNumber(value);
  if (!number) return undefined;
  const sourceText = String(source || '').toLowerCase();
  const explicitMetres = /(?:\bmeters?\b|\bmetres?\b|\b[mม]\.?\b|เมตร)/i.test(sourceText);
  // Structural drawings commonly label foundation dimensions as 1.75 / 2.20 m.
  // Keep cover untouched; a sub-20 mm X/Y/Z value is otherwise almost certainly
  // a metre value for the supported structural member categories.
  if (axis !== 'cover' && number < 20 && (explicitMetres || context.category !== 'Custom')) return number * 1000;
  return number;
}

function normaliseAnalysis(raw, context, file, providerName, model) {
  const result = raw?.analysis || raw?.result || raw || {};
  const dimensions = Array.isArray(result.dimensions) ? result.dimensions.map((item) => {
    const axis = ['x', 'y', 'z', 'cover', 'unknown'].includes(item?.axis) ? item.axis : 'unknown';
    const value = dimensionMillimetres(item?.value, axis, context, `${item?.label || ''} ${item?.source || ''}`); if (!value) return null;
    return {axis, value, label: stringValue(item?.label, axis), source: stringValue(item?.source, 'AI · ไม่ระบุหน้า')};
  }).filter(Boolean) : [];
  const reinforcement = Array.isArray(result.reinforcement) ? result.reinforcement.map((item) => {
    const diameter = positiveNumber(item?.diameter, 100); if (!diameter) return null;
    const output = {mark: stringValue(item?.mark, 'ไม่ระบุ').slice(0, 32), diameter, source: stringValue(item?.source, 'AI · ไม่ระบุหน้า')};
    const spacing = positiveNumber(item?.spacing, 10000); const count = Number(item?.count);
    if (spacing) output.spacing = spacing;
    if (Number.isInteger(count) && count > 0 && count <= 2000) output.count = count;
    if (stringValue(item?.grade)) output.grade = stringValue(item.grade).slice(0, 40);
    if (['X', 'Y', 'Z'].includes(item?.axis)) output.axis = item.axis;
    if (['bottom', 'top', 'side'].includes(item?.face)) output.face = item.face;
    if (stringValue(item?.shapeCode)) output.shapeCode = stringValue(item.shapeCode).slice(0, 40);
    return output;
  }).filter(Boolean) : [];
  const inputFields = result.fields && typeof result.fields === 'object' ? result.fields : {};
  const fields = {};
  if (stringValue(inputFields.description)) fields.description = stringValue(inputFields.description).slice(0, 500);
  for (const name of ['x', 'y', 'z']) { const value = dimensionMillimetres(inputFields[name], name, context, inputFields[name + 'Source']); if (value) fields[name] = value; }
  const cover = nonnegativeNumber(inputFields.cover); if (cover !== undefined) fields.cover = cover;
  for (const name of ['pedestal', 'lean', 'excavation']) {
    const source = inputFields[name]; if (!source || typeof source !== 'object') continue;
    const target = {}; for (const [key, value] of Object.entries(source)) { const number = nonnegativeNumber(value); if (number !== undefined) target[key] = number; }
    if (Object.keys(target).length) fields[name] = target;
  }
  const calculated = {};
  if (result.calculated && typeof result.calculated === 'object') for (const name of ['concrete', 'formwork', 'rebar', 'quantity']) {
    const value = nonnegativeNumber(result.calculated[name]); if (value !== undefined) calculated[name] = value;
  }
  const evidence = Array.isArray(result.evidence) ? result.evidence.map((item) => {
    const page = Number(item?.page); const quote = stringValue(item?.quote);
    if (!Number.isInteger(page) || page < 1 || !stringValue(item?.field) || !quote) return null;
    return {page, field: stringValue(item.field).slice(0, 80), quote: quote.slice(0, 500)};
  }).filter(Boolean).slice(0, 200) : [];
  const confidence = ['High', 'Medium', 'Low'].includes(result.confidence) ? result.confidence : String(result.confidence || '').toLowerCase() === 'high' ? 'High' : String(result.confidence || '').toLowerCase() === 'medium' ? 'Medium' : 'Low';
  const warnings = Array.isArray(result.warnings) ? result.warnings.map((item) => stringValue(item)).filter(Boolean).slice(0, 50) : [];
  return {
    version: 1, attachmentId: stringValue(context.attachmentId, stringValue(context.memberId, 'drawing-analysis')),
    fileName: stringValue(context.fileName, file.filename), pages: Math.max(1, Math.min(9999, Number.isInteger(Number(result.pages)) ? Number(result.pages) : Number(context.pages) || 1)),
    category: stringValue(context.category, 'Custom'), provider: providerName, model,
    analysisId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    confidence, dimensions, reinforcement, fields: Object.keys(fields).length ? fields : undefined,
    calculated: Object.keys(calculated).length ? calculated : undefined, evidence,
    textSample: stringValue(result.textSample).slice(0, 2400), warnings: warnings.slice(0, 50),
  };
}

function setCors(req, res) {
  const origin = String(req.get('origin') || '');
  if (origin && !ALLOWED_ORIGINS.has(origin)) throw new GatewayError('Origin นี้ไม่ได้รับอนุญาตให้เรียกบริการ', 403, 'permission-denied');
  if (origin) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin'); res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function startSse(res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function writeSse(res, event) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

exports.analyseDrawing = onRequest({timeoutSeconds: 540, memory: '1GiB'}, async (req, res) => {
  const requestId = `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let streaming = false;
  let clientClosed = false;
  let providerController;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
      providerController?.abort();
    }
  });
  try {
    setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') throw new GatewayError('รองรับเฉพาะ POST /analyse-drawing', 405, 'method-not-allowed');
    const authContext = await authenticate(req);
    const parsed = await parseAnalysisRequest(req);
    const projectId = await assertProjectAccess(authContext, parsed.context);
    startSse(res);
    streaming = true;
    writeSse(res, {type: 'progress', phase: 'loading-storage', label: 'Backend กำลังดึงไฟล์ต้นฉบับจาก Firebase Storage…'});
    const stored = await loadAttachmentFromStorage(projectId, parsed.context);
    const context = {
      ...parsed.context,
      attachmentId: stored.attachment.id,
      memberId: stored.attachment.memberId,
      fileName: stored.file.filename,
      contentType: stored.file.mimeType,
      pages: Number(stored.attachment.pageCount) || Number(parsed.context.pages) || 1,
    };
    const configSnapshot = await db.doc(providerConfigPath()).get();
    const config = configSnapshot.exists ? decodeStorage(configSnapshot.data()) : null;
    const {activeProvider, provider} = selectedProvider(config);
    const shapeTask = context.task === 'shape';
    const prompt = shapeTask ? shapeInstruction(context, stored.file) : providerInstruction(context, stored.file);
    writeSse(res, {type: 'progress', phase: 'sending-to-ai', label: 'ดึงไฟล์จาก Storage แล้ว กำลังส่งไฟล์ต้นฉบับให้ AI อ่าน…', detail: `${stored.file.filename} · ${(stored.file.size / 1024 / 1024).toFixed(2)} MiB`});
    writeSse(res, {type: 'progress', phase: 'analyzing', label: `AI กำลังอ่านและวิเคราะห์แบบ…`, detail: `${activeProvider === 'openai' ? 'OpenAI' : activeProvider === 'anthropic' ? 'Anthropic' : 'Google AI Studio'} · ${provider.model}`});
    providerController = new AbortController();
    if (clientClosed) { providerController.abort(); return; }
    let raw;
    if (activeProvider === 'openai') raw = await callOpenAi(provider.apiKey, provider.model, provider.thinking, stored.file, prompt, providerController.signal);
    if (activeProvider === 'anthropic') raw = await callAnthropic(provider.apiKey, provider.model, provider.thinking, stored.file, prompt, providerController.signal);
    if (activeProvider === 'google-ai-studio') raw = await callGoogle(provider.apiKey, provider.model, provider.thinking, stored.file, prompt, providerController.signal);
    if (clientClosed) return;
    writeSse(res, {type: 'progress', phase: 'preparing-json', label: 'AI อ่านแบบเสร็จแล้ว กำลังเตรียมผลลัพธ์ JSON…'});
    const result = shapeTask ? normaliseShapeProposal(parseModelJson(raw), context, activeProvider, provider.model) : normaliseAnalysis(parseModelJson(raw), context, stored.file, activeProvider, provider.model);
    logger.info('AI drawing analysis completed', {requestId, uid: authContext.decodedToken.uid, projectId, provider: activeProvider, model: provider.model, fileSize: stored.file.size});
    writeSse(res, {type: 'progress', phase: 'complete', label: 'วิเคราะห์เสร็จแล้ว กำลังนำผลไปแสดง…'});
    writeSse(res, {type: 'result', result});
    res.end();
  } catch (error) {
    const gatewayError = error instanceof GatewayError ? error : new GatewayError('บริการวิเคราะห์แบบขัดข้อง กรุณาลองใหม่', 500, 'internal');
    logger.error('AI drawing analysis failed', {requestId, code: gatewayError.code, status: gatewayError.status, message: error instanceof Error ? error.message : String(error)});
    if (streaming) {
      if (!clientClosed && !res.writableEnded) {
        writeSse(res, {type: 'error', message: gatewayError.message, requestId});
        res.end();
      }
    } else if (!res.headersSent) res.status(gatewayError.status).json({error: {code: gatewayError.code, message: gatewayError.message, requestId}});
  }
});
