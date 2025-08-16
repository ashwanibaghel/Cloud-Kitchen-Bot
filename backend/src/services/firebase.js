const admin = require('firebase-admin');

function logEnvSafe() {
  const proj = process.env.FIREBASE_PROJECT_ID || '(missing)';
  const email = process.env.FIREBASE_CLIENT_EMAIL || '(missing)';
  console.log('[Firebase Init] projectId:', proj);
  console.log('[Firebase Init] clientEmail:', email);
}

const required = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
for (const k of required) {
  if (!process.env[k]) {
    console.warn(`[Firebase Init] Missing env ${k}`);
  }
}

let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
// Convert escaped \n into real newlines
if (privateKey.includes('\\n')) {
  privateKey = privateKey.replace(/\\n/g, '\n');
}

if (!admin.apps.length) {
  logEnvSafe();
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db = admin.firestore();
module.exports = db;