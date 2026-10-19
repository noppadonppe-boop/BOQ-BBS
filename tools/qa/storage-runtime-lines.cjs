'use strict';
// Local emulator compatibility only. No Rules or application authorization changes.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');

function frameRuntimeSource(source) {
  const needle = '(_b = this._childprocess.stdout) === null || _b === void 0 ? void 0 : _b.on("data", (buf) => {';
  if (source.split(needle).length !== 2) throw Error('Unsupported Storage runtime listener; refusing to modify it');
  return source.replace(needle, `const lines = require('node:readline').createInterface({input:this._childprocess.stdout,crlfDelay:Infinity});
        this._childprocess.once('exit',()=>lines.close());
        lines.on('line', (line) => {
            const buf = Buffer.from(line, 'utf8');`);
}

function encodeFirestoreFetchSource(source) {
  const needle = 'const pathname = `projects/${projectId}${request.context.path}`;';
  if (source.split(needle).length !== 2) throw Error('Unsupported Firestore fetch layout; refusing to modify it');
  return source.replace(needle, 'const pathname = `projects/${projectId}${request.context.path}`.split("/").map(encodeURIComponent).join("/");');
}

function install(root) {
  const pkg = require.resolve('firebase-tools/package.json', { paths: [root] });
  if (JSON.parse(fs.readFileSync(pkg, 'utf8')).version !== '14.27.0') throw Error('This adapter is verified only with firebase-tools 14.27.0');
  const target = path.join(path.dirname(pkg), 'lib/emulator/storage/rules/runtime.js');
  if (require.cache[target]) throw Error('Install before loading the emulator runtime');
  const source = fs.readFileSync(target, 'utf8');
  const adapted = encodeFirestoreFetchSource(frameRuntimeSource(source));
  const mod = new Module(target, module);
  mod.filename = target;
  mod.paths = Module._nodeModulePaths(path.dirname(target));
  mod._compile(adapted, target);
  mod.loaded = true;
  require.cache[target] = mod;
  return { version: '14.27.0', sourceSha256: createHash('sha256').update(source).digest('hex'), lineFraming: true, encodedFirestoreLookup: true };
}

module.exports = { frameRuntimeSource, encodeFirestoreFetchSource, install };
