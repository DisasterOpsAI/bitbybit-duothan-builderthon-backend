const express = require('express');
const Joi = require('joi');
const firestoreService = require('../services/firebase-firestore');
const { 
  verifyFirebaseToken,
  optionalFirebaseAuth,
  addFirebaseContext,
  logFirebaseOperation 
} = require('../middleware/firebase-auth');
const {
  validateFirestoreDocument,
  validateFirestoreQuery,
  validateFirebase,
  FirebaseSchemas,
  createFirebaseRateLimit,
  commonValidations
} = require('../middleware/firebase-validation');
const Logger = require('../utils/firebase-logger');

const router = express.Router();

router.use(addFirebaseContext);
router.use(createFirebaseRateLimit(200, 15 * 60 * 1000));

router.post('/collections/:collection/documents',
  verifyFirebaseToken(),
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    data: Joi.object().required().max(1048576),
    docId: FirebaseSchemas.documentId.optional()
  })),
  logFirebaseOperation('createDocument'),
  async (req, res) => {
    try {
      const { collection } = req.params;
      const { data, docId } = req.body;
      const userId = req.user.uid;

      const result = await firestoreService.createDocument(collection, data, docId, userId);
      return res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
      Logger.failure('createDocument', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/collections/:collection/documents/:id',
  optionalFirebaseAuth,
  ...commonValidations.firestore,
  logFirebaseOperation('getDocument'),
  async (req, res) => {
    try {
      const { collection, id } = req.params;

      const result = await firestoreService.getDocument(collection, id);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('getDocument', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.put('/collections/:collection/documents/:id',
  verifyFirebaseToken(),
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    data: Joi.object().required().max(1048576)
  })),
  logFirebaseOperation('updateDocument'),
  async (req, res) => {
    try {
      const { collection, id } = req.params;
      const { data } = req.body;
      const userId = req.user.uid;

      const result = await firestoreService.updateDocument(collection, id, data, userId);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('updateDocument', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.delete('/collections/:collection/documents/:id',
  verifyFirebaseToken(),
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    hardDelete: Joi.boolean().default(false)
  }), 'query'),
  logFirebaseOperation('deleteDocument'),
  async (req, res) => {
    try {
      const { collection, id } = req.params;
      const { hardDelete } = req.query;
      const userId = req.user.uid;

      const result = await firestoreService.deleteDocument(collection, id, hardDelete, userId);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('deleteDocument', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/collections/:collection/query',
  optionalFirebaseAuth,
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    filters: FirebaseSchemas.firestoreFilters.optional(),
    orderBy: Joi.object({
      field: Joi.string().required(),
      direction: Joi.string().valid('asc', 'desc').default('asc')
    }).optional(),
    limit: Joi.number().integer().min(1).max(1000).default(50),
    startAfter: FirebaseSchemas.documentId.optional(),
    includeDeleted: Joi.boolean().default(false)
  })),
  logFirebaseOperation('queryDocuments'),
  async (req, res) => {
    try {
      const { collection } = req.params;
      const options = req.body;

      const result = await firestoreService.queryDocuments(collection, options);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('queryDocuments', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/collections/:collection/documents',
  optionalFirebaseAuth,
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(50),
    orderBy: Joi.string().default('createdAt'),
    orderDirection: Joi.string().valid('asc', 'desc').default('desc'),
    startAfter: FirebaseSchemas.documentId.optional(),
    includeDeleted: Joi.boolean().default(false)
  }), 'query'),
  logFirebaseOperation('getAllDocuments'),
  async (req, res) => {
    try {
      const { collection } = req.params;
      const { limit, orderBy, orderDirection, startAfter, includeDeleted } = req.query;

      const options = {
        orderBy: { field: orderBy, direction: orderDirection },
        limit,
        startAfter,
        includeDeleted
      };

      const result = await firestoreService.queryDocuments(collection, options);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('getAllDocuments', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/collections/:collection/search',
  optionalFirebaseAuth,
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    q: Joi.string().required().min(1).max(100),
    fields: Joi.array().items(Joi.string()).max(10).default(['name', 'title', 'description'])
  }), 'query'),
  logFirebaseOperation('searchDocuments'),
  async (req, res) => {
    try {
      const { collection } = req.params;
      const { q: searchTerm, fields: searchFields } = req.query;

      const result = await firestoreService.searchDocuments(collection, searchTerm, searchFields);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('searchDocuments', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/collections/:collection/count',
  optionalFirebaseAuth,
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    filters: FirebaseSchemas.firestoreFilters.optional()
  })),
  logFirebaseOperation('countDocuments'),
  async (req, res) => {
    try {
      const { collection } = req.params;
      const { filters = [] } = req.body;

      const result = await firestoreService.countDocuments(collection, filters);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('countDocuments', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/batch',
  verifyFirebaseToken(),
  validateFirebase(Joi.object({
    operations: Joi.array().items(
      Joi.object({
        type: Joi.string().valid('create', 'update', 'delete').required(),
        collection: FirebaseSchemas.collectionName.required(),
        id: FirebaseSchemas.documentId.when('type', {
          is: Joi.valid('update', 'delete'),
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        data: Joi.object().when('type', {
          is: Joi.valid('create', 'update'),
          then: Joi.required(),
          otherwise: Joi.forbidden()
        })
      })
    ).min(1).max(500).required()
  })),
  logFirebaseOperation('batchOperations'),
  async (req, res) => {
    try {
      const { operations } = req.body;

      const result = await firestoreService.batchOperations(operations);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('batchOperations', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/collections/:collection/documents/:id/array/:field/add',
  verifyFirebaseToken(),
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    value: Joi.any().required()
  })),
  logFirebaseOperation('addToArray'),
  async (req, res) => {
    try {
      const { collection, id, field } = req.params;
      const { value } = req.body;
      const userId = req.user.uid;

      const result = await firestoreService.addToArray(collection, id, field, value, userId);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('addToArray', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/collections/:collection/documents/:id/array/:field/remove',
  verifyFirebaseToken(),
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    value: Joi.any().required()
  })),
  logFirebaseOperation('removeFromArray'),
  async (req, res) => {
    try {
      const { collection, id, field } = req.params;
      const { value } = req.body;
      const userId = req.user.uid;

      const result = await firestoreService.removeFromArray(collection, id, field, value, userId);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('removeFromArray', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/collections/:collection/documents/:id/increment/:field',
  verifyFirebaseToken(),
  ...commonValidations.firestore,
  validateFirebase(Joi.object({
    amount: Joi.number().default(1)
  })),
  logFirebaseOperation('incrementField'),
  async (req, res) => {
    try {
      const { collection, id, field } = req.params;
      const { amount } = req.body;
      const userId = req.user.uid;

      const result = await firestoreService.incrementField(collection, id, field, amount, userId);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('incrementField', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/health',
  logFirebaseOperation('healthCheck'),
  async (req, res) => {
    try {
      const testData = { 
        test: true, 
        timestamp: Date.now(),
        requestId: req.firebaseContext?.requestId 
      };
      
      const createResult = await firestoreService.createDocument('health-check', testData);
      
      if (createResult.success) {
        await firestoreService.deleteDocument('health-check', createResult.data.id, true);
        
        return res.status(200).json({
          success: true,
          message: 'Firestore service is healthy',
          timestamp: new Date().toISOString(),
          service: 'Firebase Firestore',
          version: '1.0.0'
        });
      } else {
        return res.status(503).json({
          success: false,
          message: 'Firestore service is unhealthy',
          error: createResult.error,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      Logger.failure('healthCheck', error, req.firebaseContext);
      return res.status(503).json({
        success: false,
        message: 'Firestore health check failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

router.get('/info',
  async (req, res) => {
    try {
      return res.status(200).json({
        success: true,
        service: 'Firebase Firestore API',
        version: '1.0.0',
        features: [
          'Document CRUD operations',
          'Advanced querying with filters',
          'Search functionality',
          'Batch operations',
          'Array and field operations',
          'Soft delete support',
          'Comprehensive logging',
          'Authentication integration'
        ],
        endpoints: {
          documents: {
            create: 'POST /collections/:collection/documents',
            get: 'GET /collections/:collection/documents/:id',
            update: 'PUT /collections/:collection/documents/:id',
            delete: 'DELETE /collections/:collection/documents/:id',
            list: 'GET /collections/:collection/documents',
            query: 'POST /collections/:collection/query',
            search: 'GET /collections/:collection/search',
            count: 'POST /collections/:collection/count'
          },
          batch: 'POST /batch',
          arrays: {
            add: 'POST /collections/:collection/documents/:id/array/:field/add',
            remove: 'POST /collections/:collection/documents/:id/array/:field/remove'
          },
          fields: {
            increment: 'POST /collections/:collection/documents/:id/increment/:field'
          },
          utility: {
            health: 'GET /health',
            info: 'GET /info'
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

module.exports = router;
