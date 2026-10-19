// Uses Vite's resolved Firebase modules, avoiding duplicate SDK instances in
// dynamically imported browser fixtures. This file is not in the app bundle.
export * from 'firebase/firestore';
export * from 'firebase/storage';
export * from 'firebase/auth';
export * from 'firebase/app';
