const express = require('express');
const Joi = require('joi');
const authService = require('../services/firebase-auth');
const { 
  verifyFirebaseToken,
  requireAdmin,
  addFirebaseContext,
  logFirebaseOperation 
} = require('../middleware/firebase-auth');
const {
  validateUserCreation,
  validateUserUpdate,
  validateFirebase,
  FirebaseSchemas,
  createFirebaseRateLimit,
  commonValidations
} = require('../middleware/firebase-validation');
const Logger = require('../utils/firebase-logger');

const router = express.Router();

router.use(addFirebaseContext);
router.use(createFirebaseRateLimit(50, 15 * 60 * 1000));

router.post('/verify-token',
  logFirebaseOperation('verifyToken'),
  validateFirebase(Joi.object({
    idToken: Joi.string().required(),
    checkRevoked: Joi.boolean().default(false)
  })),
  async (req, res) => {
    try {
      const { idToken, checkRevoked } = req.body;
      const result = await authService.verifyIdToken(idToken, checkRevoked);
      return res.status(result.success ? 200 : 401).json(result);
    } catch (error) {
      Logger.failure('verifyToken', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/custom-token',
  logFirebaseOperation('createCustomToken'),
  validateFirebase(Joi.object({
    uid: FirebaseSchemas.firebaseUid.required(),
    additionalClaims: FirebaseSchemas.customClaims.optional()
  })),
  async (req, res) => {
    try {
      const { uid, additionalClaims } = req.body;
      const result = await authService.createCustomToken(uid, additionalClaims);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('createCustomToken', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/profile',
  verifyFirebaseToken(),
  logFirebaseOperation('getUserProfile'),
  async (req, res) => {
    try {
      const result = await authService.getUserByUid(req.user.uid);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('getUserProfile', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.put('/profile',
  verifyFirebaseToken(),
  ...commonValidations.userAuth,
  validateUserUpdate,
  logFirebaseOperation('updateUserProfile'),
  async (req, res) => {
    try {
      const result = await authService.updateUser(req.user.uid, req.body);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('updateUserProfile', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.delete('/profile',
  verifyFirebaseToken(),
  logFirebaseOperation('deleteUserProfile'),
  async (req, res) => {
    try {
      const result = await authService.deleteUser(req.user.uid);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('deleteUserProfile', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/revoke-tokens',
  verifyFirebaseToken(),
  logFirebaseOperation('revokeTokens'),
  async (req, res) => {
    try {
      const result = await authService.revokeRefreshTokens(req.user.uid);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('revokeTokens', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/admin/users',
  verifyFirebaseToken(),
  requireAdmin,
  ...commonValidations.userAuth,
  validateUserCreation,
  logFirebaseOperation('createUser'),
  async (req, res) => {
    try {
      const result = await authService.createUser(req.body);
      return res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
      Logger.failure('createUser', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/admin/users/:uid',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    uid: FirebaseSchemas.firebaseUid.required()
  }), 'params'),
  logFirebaseOperation('getUser'),
  async (req, res) => {
    try {
      const { uid } = req.params;
      const result = await authService.getUserByUid(uid);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('getUser', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/admin/users/email/:email',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    email: FirebaseSchemas.email.required()
  }), 'params'),
  logFirebaseOperation('getUserByEmail'),
  async (req, res) => {
    try {
      const { email } = req.params;
      const result = await authService.getUserByEmail(email);
      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      Logger.failure('getUserByEmail', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.put('/admin/users/:uid',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    uid: FirebaseSchemas.firebaseUid.required()
  }), 'params'),
  ...commonValidations.userAuth,
  validateUserUpdate,
  logFirebaseOperation('updateUser'),
  async (req, res) => {
    try {
      const { uid } = req.params;
      const result = await authService.updateUser(uid, req.body);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('updateUser', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.delete('/admin/users/:uid',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    uid: FirebaseSchemas.firebaseUid.required()
  }), 'params'),
  logFirebaseOperation('deleteUser'),
  async (req, res) => {
    try {
      const { uid } = req.params;
      const result = await authService.deleteUser(uid);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('deleteUser', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/admin/users',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    maxResults: Joi.number().integer().min(1).max(1000).default(100),
    pageToken: Joi.string().optional()
  }), 'query'),
  logFirebaseOperation('listUsers'),
  async (req, res) => {
    try {
      const { maxResults, pageToken } = req.query;
      const result = await authService.listUsers(maxResults, pageToken);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('listUsers', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/admin/users/:uid/claims',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    uid: FirebaseSchemas.firebaseUid.required()
  }), 'params'),
  validateFirebase(Joi.object({
    customClaims: FirebaseSchemas.customClaims.required()
  })),
  logFirebaseOperation('setCustomClaims'),
  async (req, res) => {
    try {
      const { uid } = req.params;
      const { customClaims } = req.body;
      const result = await authService.setCustomUserClaims(uid, customClaims);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('setCustomClaims', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/admin/users/:uid/revoke-tokens',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    uid: FirebaseSchemas.firebaseUid.required()
  }), 'params'),
  logFirebaseOperation('revokeUserTokens'),
  async (req, res) => {
    try {
      const { uid } = req.params;
      const result = await authService.revokeRefreshTokens(uid);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('revokeUserTokens', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/admin/password-reset-link',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    email: FirebaseSchemas.email.required(),
    actionCodeSettings: Joi.object().optional()
  })),
  logFirebaseOperation('generatePasswordResetLink'),
  async (req, res) => {
    try {
      const { email, actionCodeSettings } = req.body;
      const result = await authService.generatePasswordResetLink(email, actionCodeSettings);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('generatePasswordResetLink', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.post('/admin/email-verification-link',
  verifyFirebaseToken(),
  requireAdmin,
  validateFirebase(Joi.object({
    email: FirebaseSchemas.email.required(),
    actionCodeSettings: Joi.object().optional()
  })),
  logFirebaseOperation('generateEmailVerificationLink'),
  async (req, res) => {
    try {
      const { email, actionCodeSettings } = req.body;
      const result = await authService.generateEmailVerificationLink(email, actionCodeSettings);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      Logger.failure('generateEmailVerificationLink', error, req.firebaseContext);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

module.exports = router;
