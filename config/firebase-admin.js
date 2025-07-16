require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const Logger = require('../utils/firebase-logger');

let firebaseApp = null;

function initializeFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    let credential;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';
    
    if (fs.existsSync(serviceAccountPath)) {
      credential = admin.credential.cert(serviceAccountPath);
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
      };
      credential = admin.credential.cert(serviceAccount);
    } else {
      credential = admin.credential.applicationDefault();
    }

    const config = {
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID,
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    };

    firebaseApp = admin.initializeApp(config);
    return firebaseApp;
    
  } catch (error) {
    Logger.error('Failed to initialize Firebase Admin SDK', { error: error.message });
    throw error;
  }
}

function getFirebaseApp() {
  if (!firebaseApp) {
    return initializeFirebaseApp();
  }
  return firebaseApp;
}

function getFirestore() {
  const app = getFirebaseApp();
  return admin.firestore(app);
}

function getRealtimeDatabase() {
  const app = getFirebaseApp();
  return admin.database(app);
}

function getAuth() {
  const app = getFirebaseApp();
  return admin.auth(app);
}

function getStorage() {
  const app = getFirebaseApp();
  return admin.storage(app);
}

function isConfigured() {
  return !!(
    process.env.FIREBASE_PROJECT_ID && 
    (
      process.env.FIREBASE_PRIVATE_KEY || 
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    )
  );
}

module.exports = {
  admin,
  initializeFirebaseApp,
  getFirebaseApp,
  getFirestore,
  getRealtimeDatabase,
  getAuth,
  getStorage,
  isConfigured
};