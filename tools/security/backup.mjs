// Shared by the migration scripts: before any write (`--apply` runs), every document the run will change or delete is saved as
// JSON ({path, exists, data}) so it can be put back with `restoreBackup.mjs`. Backups of migrateApiKeys hold API keys:
// keep them outside the repository and delete them once the keys are rotated.
import {mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

export function backupDir(argv) {
 const i = argv.indexOf('--backup');
 return i > 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? resolve(argv[i + 1]) : '';
}

/** Firestore Timestamps survive the JSON round trip as {__timestamp: [seconds, nanoseconds]} (see restoreBackup.mjs) */
export function encode(v) {
 if (v && typeof v === 'object') {
  if (typeof v.toDate === 'function' && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') return {__timestamp: [v.seconds, v.nanoseconds]};
  if (Array.isArray(v)) return v.map(encode);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
 }
 return v;
}
export function decode(v, Timestamp) {
 if (v && typeof v === 'object') {
  if (Array.isArray(v.__timestamp) && Object.keys(v).length === 1) return new Timestamp(v.__timestamp[0], v.__timestamp[1]);
  if (Array.isArray(v)) return v.map(x => decode(x, Timestamp));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x, Timestamp)]));
 }
 return v;
}

/** refs → backup file; returns its path */
export async function writeBackup(db, dir, name, refs) {
 const docs = [];
 for (const ref of refs) {
  const s = await ref.get();
  docs.push({path: ref.path, exists: s.exists, data: s.exists ? encode(s.data()) : null});
 }
 mkdirSync(dir, {recursive: true});
 const file = join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
 writeFileSync(file, JSON.stringify({script: name, project: db.app?.options?.projectId || '', at: new Date().toISOString(), docs}, null, 1));
 return file;
}
