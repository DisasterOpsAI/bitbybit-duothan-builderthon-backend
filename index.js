const firebaseConfig = require('./config/firebase-admin');
const firestoreService = require('./services/firebase-firestore');
const authService = require('./services/firebase-auth');
const storageService = require('./services/firebase-storage');
const realtimeDbService = require('./services/firebase-realtime-db');

const Logger = require('./utils/firebase-logger');
const { FirebaseResponse, FirebaseResponses } = require('./utils/firebase-response');

const firebaseAuth = require('./middleware/firebase-auth');
const firebaseValidation = require('./middleware/firebase-validation');

const authRoutes = require('./routes/firebase-auth');
const firestoreRoutes = require('./routes/firebase-firestore');

class FirebaseAdmin {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      Logger.info('Firebase Admin SDK already initialized');
      return this;
    }

    try {
      Logger.info('Initializing Firebase Admin SDK...');
      
      firebaseConfig.initializeFirebaseApp();
      
      firestoreService.initialize();
      authService.initialize();
      storageService.initialize();
      realtimeDbService.initialize();
      
      this.initialized = true;
      
      Logger.info('Firebase Admin SDK initialized successfully', {
        services: ['Firestore', 'Auth', 'Storage', 'RealtimeDB'],
        configured: firebaseConfig.isConfigured()
      });
      
      return this;
    } catch (error) {
      Logger.error('Failed to initialize Firebase Admin SDK', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  isConfigured() {
    return firebaseConfig.isConfigured();
  }

  async getHealthStatus() {
    const services = {
      firestore: { status: 'unknown', error: null },
      auth: { status: 'unknown', error: null },
      storage: { status: 'unknown', error: null },
      realtimeDb: { status: 'unknown', error: null }
    };

    try {
      const testResult = await firestoreService.createDocument('health-test', { test: true });
      if (testResult.success) {
        await firestoreService.deleteDocument('health-test', testResult.data.id, true);
        services.firestore.status = 'healthy';
      } else {
        services.firestore.status = 'unhealthy';
        services.firestore.error = testResult.error;
      }
    } catch (error) {
      services.firestore.status = 'error';
      services.firestore.error = error.message;
    }

    try {
      const testResult = await authService.createCustomToken('test-user');
      services.auth.status = testResult.success ? 'healthy' : 'unhealthy';
      if (!testResult.success) {
        services.auth.error = testResult.error;
      }
    } catch (error) {
      services.auth.status = 'error';
      services.auth.error = error.message;
    }

    try {
      storageService.initialize();
      services.storage.status = 'healthy';
    } catch (error) {
      services.storage.status = 'error';
      services.storage.error = error.message;
    }

    try {
      const testResult = await realtimeDbService.set('health-test', { test: true });
      if (testResult.success) {
        await realtimeDbService.remove('health-test');
        services.realtimeDb.status = 'healthy';
      } else {
        services.realtimeDb.status = 'unhealthy';
        services.realtimeDb.error = testResult.error;
      }
    } catch (error) {
      services.realtimeDb.status = 'error';
      services.realtimeDb.error = error.message;
    }

    const overallHealthy = Object.values(services).every(service => 
      service.status === 'healthy'
    );

    return {
      overall: overallHealthy ? 'healthy' : 'degraded',
      services,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }
}

const firebaseAdmin = new FirebaseAdmin();

if (firebaseConfig.isConfigured()) {
  firebaseAdmin.initialize().catch(error => {
    Logger.warn('Auto-initialization failed', { error: error.message });
  });
}

module.exports = {
  firebaseAdmin,
  config: firebaseConfig,
  services: {
    firestore: firestoreService,
    auth: authService,
    storage: storageService,
    realtimeDb: realtimeDbService
  },
  firestore: firestoreService,
  auth: authService,
  storage: storageService,
  realtimeDb: realtimeDbService,
  Logger,
  FirebaseResponse,
  FirebaseResponses,
  middleware: {
    auth: firebaseAuth,
    validation: firebaseValidation
  },
  routes: {
    auth: authRoutes,
    firestore: firestoreRoutes
  },
  async initialize() {
    return await firebaseAdmin.initialize();
  },
  isConfigured() {
    return firebaseAdmin.isConfigured();
  },
  async healthCheck() {
    return await firebaseAdmin.getHealthStatus();
  }
};

module.exports.firestoreService = firestoreService;
module.exports.authService = authService;
module.exports.storageService = storageService;
module.exports.realtimeDbService = realtimeDbService;

module.exports.verifyFirebaseToken = firebaseAuth.verifyFirebaseToken;
module.exports.requireRole = firebaseAuth.requireRole;
module.exports.validateFirebase = firebaseValidation.validateFirebase;