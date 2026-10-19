'use strict';
// Only the isolated local cold-import CLI uses this preloader.
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
require('./storage-runtime-lines.cjs').install(root);
const {StorageEmulator}=require('firebase-tools/lib/emulator/storage');
StorageEmulator.prototype.getPersistenceTmpDir=()=>path.join(root,'tmp/cold-restore-qa/runtime-blobs');
