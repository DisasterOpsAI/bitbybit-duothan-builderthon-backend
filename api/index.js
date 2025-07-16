const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.get('/', (req, res) => {
  res.json({
    service: 'Firebase Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      main: '/',
      api_docs: '/api',
      firebase_info: '/api/firebase/info'
    }
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Firebase Backend API',
    version: '1.0.0',
    description: 'Firebase Admin SDK with modular architecture',
    endpoints: {
      info: 'GET /',
      docs: 'GET /api',
      firebase_routes: 'Available when Firebase is configured'
    }
  });
});

app.get('/api/firebase/info', (req, res) => {
  try {
    const { firebaseAdmin } = require('../index');
    res.json({
      service: 'Firebase Admin SDK',
      version: '1.0.0',
      configured: firebaseAdmin.isConfigured(),
      initialized: firebaseAdmin.initialized
    });
  } catch (error) {
    res.json({
      service: 'Firebase Admin SDK',
      version: '1.0.0',
      configured: false,
      error: 'Configuration error'
    });
  }
});
try {
  const { firebaseAdmin } = require('../index');
  
  if (firebaseAdmin.isConfigured()) {
    const firebaseAuthRoutes = require('../routes/firebase-auth');
    const firebaseFirestoreRoutes = require('../routes/firebase-firestore');
    
    app.use('/api/firebase/auth', firebaseAuthRoutes);
    app.use('/api/firebase/firestore', firebaseFirestoreRoutes);
  } else {
    app.all('/api/firebase/*', (req, res) => {
      res.status(503).json({
        success: false,
        message: 'Firebase not configured',
        error: 'Add Firebase credentials to .env file'
      });
    });
  }
} catch (error) {
  app.all('/api/firebase/*', (req, res) => {
    res.status(500).json({
      success: false,
      message: 'Firebase setup error',
      error: error.message
    });
  });
}

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

app.use((error, req, res, next) => {
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
  });
});

module.exports = app;
