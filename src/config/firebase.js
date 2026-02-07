const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  try {
    // Check if already initialized
    if (admin.apps.length > 0) {
      return admin;
    }

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    
    if (!serviceAccountPath) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_PATH not set in environment variables');
      return null;
    }

    const serviceAccount = require(path.resolve(serviceAccountPath));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin SDK initialized');
    return admin;
  } catch (error) {
    console.error('❌ Error initializing Firebase:', error.message);
    return null;
  }
};

// Initialize on module load
const firebase = initializeFirebase();

module.exports = { admin, firebase };
