'use strict';
// Dedicated private blob directory; never reuse the existing C1 QA storage directory.
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
require('./storage-runtime-lines.cjs').install(root);
const {StorageEmulator} = require('firebase-tools/lib/emulator/storage');
StorageEmulator.prototype.getPersistenceTmpDir = () => path.join(root, 'tmp/full-current-cold-qa/runtime-blobs');
