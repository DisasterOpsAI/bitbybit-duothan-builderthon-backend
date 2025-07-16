const Joi = require('joi');
const Logger = require('../utils/firebase-logger');
const { FirebaseResponse } = require('../utils/firebase-response');

const FirebaseSchemas = {
  firebaseUid: Joi.string().min(1).max(128).pattern(/^[a-zA-Z0-9]+$/).messages({
    'string.pattern.base': 'Firebase UID must contain only alphanumeric characters'
  }),

  collectionName: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9_-]+$/).messages({
    'string.pattern.base': 'Collection name must contain only alphanumeric characters, hyphens, and underscores'
  }),

  documentId: Joi.string().min(1).max(1500).messages({
    'string.max': 'Document ID must be less than 1500 characters'
  }),

  firebasePath: Joi.string().min(1).max(768).pattern(/^[^.#$[\]]*$/).messages({
    'string.pattern.base': 'Firebase path cannot contain ".", "#", "$", "[", or "]"'
  }),

  email: Joi.string().email().lowercase().messages({
    'string.email': 'Please provide a valid email address'
  }),

  password: Joi.string().min(6).max(128).messages({
    'string.min': 'Password must be at least 6 characters long',
    'string.max': 'Password must be less than 128 characters'
  }),

  displayName: Joi.string().min(1).max(100).trim().messages({
    'string.min': 'Display name is required',
    'string.max': 'Display name must be less than 100 characters'
  }),

  phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).messages({
    'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)'
  }),

  url: Joi.string().uri().messages({
    'string.uri': 'Please provide a valid URL'
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(1000).default(50),
    orderBy: Joi.string().max(100).default('createdAt'),
    orderDirection: Joi.string().valid('asc', 'desc').default('desc'),
    startAfter: Joi.string().optional()
  }),

  firestoreFilters: Joi.array().items(
    Joi.object({
      field: Joi.string().required(),
      operator: Joi.string().valid('==', '!=', '<', '<=', '>', '>=', 'array-contains', 'array-contains-any', 'in', 'not-in').required(),
      value: Joi.any().required()
    })
  ).max(30),

  customClaims: Joi.object().pattern(
    Joi.string(),
    Joi.alternatives().try(
      Joi.string(),
      Joi.number(),
      Joi.boolean(),
      Joi.array(),
      Joi.object()
    )
  ).max(1000),

  uploadOptions: Joi.object({
    contentType: Joi.string().max(100).optional(),
    metadata: Joi.object().optional(),
    resumable: Joi.boolean().default(true),
    validation: Joi.boolean().default(true)
  }),

  realtimeDbUpdate: Joi.object().pattern(
    Joi.string().pattern(/^[^.#$[\]]*$/),
    Joi.any()
  )
};

const validateFirebase = (schema, source = 'body') => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    try {
      const data = source === 'body' ? req.body :
                   source === 'params' ? req.params :
                   source === 'query' ? req.query :
                   source === 'headers' ? req.headers :
                   req[source];

      const { error, value } = schema.validate(data, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
        convert: true
      });

      const timing = Date.now() - startTime;

      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
          type: detail.type
        }));

        Logger.warn('Firebase validation failed', {
          source,
          errors: validationErrors,
          endpoint: req.originalUrl,
          method: req.method,
          timing,
          userId: req.user?.uid
        });

        const response = FirebaseResponse.validation(validationErrors);
        return res.status(400).json(response);
      }

      if (source === 'body') req.body = value;
      else if (source === 'params') req.params = value;
      else if (source === 'query') req.query = value;
      else if (source === 'headers') req.headers = value;
      else req[source] = value;

      Logger.debug('Firebase validation passed', {
        source,
        fieldCount: Object.keys(value).length,
        timing,
        userId: req.user?.uid
      });

      next();

    } catch (validationError) {
      const timing = Date.now() - startTime;
      
      Logger.error('Firebase validation middleware error', {
        error: validationError.message,
        source,
        timing,
        userId: req.user?.uid
      });

      const response = FirebaseResponse.error(validationError, 'validation middleware', {}, timing);
      return res.status(500).json(response);
    }
  };
};

const validateFirestoreDocument = validateFirebase(Joi.object({
  collection: FirebaseSchemas.collectionName.required(),
  data: Joi.object().required().max(1048576),
  docId: FirebaseSchemas.documentId.optional()
}));

const validateFirestoreQuery = validateFirebase(Joi.object({
  collection: FirebaseSchemas.collectionName.required(),
  filters: FirebaseSchemas.firestoreFilters.optional(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  orderBy: Joi.string().default('createdAt'),
  orderDirection: Joi.string().valid('asc', 'desc').default('desc'),
  startAfter: Joi.string().optional()
}));

const validateUserCreation = validateFirebase(Joi.object({
  email: FirebaseSchemas.email.required(),
  password: FirebaseSchemas.password.optional(),
  displayName: FirebaseSchemas.displayName.optional(),
  phoneNumber: FirebaseSchemas.phoneNumber.optional(),
  photoURL: FirebaseSchemas.url.optional(),
  emailVerified: Joi.boolean().default(false),
  disabled: Joi.boolean().default(false)
}));

const validateUserUpdate = validateFirebase(Joi.object({
  email: FirebaseSchemas.email.optional(),
  displayName: FirebaseSchemas.displayName.optional(),
  phoneNumber: FirebaseSchemas.phoneNumber.optional(),
  photoURL: FirebaseSchemas.url.optional(),
  emailVerified: Joi.boolean().optional(),
  disabled: Joi.boolean().optional(),
  customClaims: FirebaseSchemas.customClaims.optional()
}));

const validateRealtimeDbPath = (req, res, next) => {
  const { path } = req.params;
  
  const { error } = FirebaseSchemas.firebasePath.validate(path);
  
  if (error) {
    Logger.warn('Invalid Realtime Database path', {
      path,
      error: error.message,
      endpoint: req.originalUrl,
      userId: req.user?.uid
    });
    
    const response = FirebaseResponse.validation([{
      field: 'path',
      message: error.message,
      value: path
    }]);
    
    return res.status(400).json(response);
  }
  
  next();
};

const validateFileUpload = validateFirebase(Joi.object({
  remotePath: Joi.string().required().max(1024).messages({
    'string.max': 'Remote path must be less than 1024 characters'
  }),
  options: FirebaseSchemas.uploadOptions.optional()
}));

const validatePagination = validateFirebase(FirebaseSchemas.pagination, 'query');

const sanitizeFirebaseData = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return value
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/data:/gi, '')
        .trim();
    } else if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    } else if (value && typeof value === 'object') {
      const sanitized = {};
      for (const [key, val] of Object.entries(value)) {
        const sanitizedKey = key.replace(/[.#$[\]]/g, '_');
        sanitized[sanitizedKey] = sanitizeValue(val);
      }
      return sanitized;
    }
    return value;
  };

  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  if (req.query) {
    req.query = sanitizeValue(req.query);
  }

  Logger.debug('Firebase data sanitized', {
    hasBody: !!req.body,
    hasQuery: !!req.query,
    userId: req.user?.uid
  });

  next();
};

const createFirebaseRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.user?.uid || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    for (const [reqKey, timestamps] of requests.entries()) {
      const filtered = timestamps.filter(timestamp => timestamp > windowStart);
      if (filtered.length === 0) {
        requests.delete(reqKey);
      } else {
        requests.set(reqKey, filtered);
      }
    }

    const keyRequests = requests.get(key) || [];
    const recentRequests = keyRequests.filter(timestamp => timestamp > windowStart);

    if (recentRequests.length >= maxRequests) {
      Logger.warn('Firebase rate limit exceeded', {
        key,
        requests: recentRequests.length,
        maxRequests,
        windowMs,
        endpoint: req.originalUrl,
        userId: req.user?.uid
      });

      const response = FirebaseResponse.error(
        new Error('Rate limit exceeded'),
        'rate limiting',
        {
          maxRequests,
          windowMs,
          retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
        }
      );

      return res.status(429).json(response);
    }

    recentRequests.push(now);
    requests.set(key, recentRequests);

    next();
  };
};

const validateFirebaseParams = validateFirebase(Joi.object({
  collection: FirebaseSchemas.collectionName.optional(),
  id: FirebaseSchemas.documentId.optional(),
  uid: FirebaseSchemas.firebaseUid.optional()
}), 'params');

const commonValidations = {
  firestore: [sanitizeFirebaseData, validateFirebaseParams],
  
  userAuth: [sanitizeFirebaseData, validateFirebaseParams],
  
  storage: [sanitizeFirebaseData],
  
  realtimeDb: [sanitizeFirebaseData, validateRealtimeDbPath]
};

module.exports = {
  validateFirebase,
  
  FirebaseSchemas,
  
  validateFirestoreDocument,
  validateFirestoreQuery,
  validateUserCreation,
  validateUserUpdate,
  validateRealtimeDbPath,
  validateFileUpload,
  validatePagination,
  validateFirebaseParams,
  
  sanitizeFirebaseData,
  createFirebaseRateLimit,
  
  commonValidations
};
