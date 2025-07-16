const authService = require('../services/firebase-auth');
const Logger = require('../utils/firebase-logger');
const { FirebaseResponse } = require('../utils/firebase-response');

const verifyFirebaseToken = (options = {}) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    try {
      const { checkRevoked = false, optional = false } = options;
      
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (optional) {
          req.user = null;
          return next();
        }
        
        Logger.auth('tokenMissing', { 
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip 
        });
        
        const response = FirebaseResponse.unauthorized('Authorization token required', 'MISSING_TOKEN');
        return res.status(401).json(response);
      }

      const idToken = authHeader.split('Bearer ')[1];
      
      if (!idToken) {
        if (optional) {
          req.user = null;
          return next();
        }
        
        Logger.auth('tokenInvalid', { 
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip 
        });
        
        const response = FirebaseResponse.unauthorized('Invalid authorization format', 'INVALID_FORMAT');
        return res.status(401).json(response);
      }

      const verificationResult = await authService.verifyIdToken(idToken, checkRevoked);
      
      const timing = Date.now() - startTime;
      
      if (!verificationResult.success) {
        Logger.auth('tokenVerificationFailed', {
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip,
          error: verificationResult.error,
          timing
        });
        
        const statusCode = verificationResult.error?.code === 'MISSING_TOKEN' ? 401 : 401;
        return res.status(statusCode).json(verificationResult);
      }

      req.user = verificationResult.data;
      req.authTiming = timing;
      
      Logger.auth('tokenVerified', {
        uid: req.user.uid,
        email: req.user.email,
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip,
        timing
      });

      next();
      
    } catch (error) {
      const timing = Date.now() - startTime;
      
      Logger.failure('verifyFirebaseToken', error, {
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip,
        timing
      });

      const response = FirebaseResponse.error(error, 'token verification', {}, timing);
      return res.status(500).json(response);
    }
  };
};

const optionalFirebaseAuth = verifyFirebaseToken({ optional: true });

const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        Logger.auth('roleCheckNoUser', {
          requiredRole,
          endpoint: req.originalUrl,
          method: req.method
        });
        
        const response = FirebaseResponse.unauthorized('Authentication required for role check');
        return res.status(401).json(response);
      }

      const userResult = await authService.getUserByUid(req.user.uid);
      
      if (!userResult.success) {
        Logger.auth('roleCheckUserFetchFailed', {
          uid: req.user.uid,
          requiredRole,
          error: userResult.error
        });
        
        const response = FirebaseResponse.error(userResult.error, 'role verification');
        return res.status(500).json(response);
      }

      const userRoles = userResult.data.customClaims?.roles || [];
      const userRole = userResult.data.customClaims?.role;
      
      const hasRole = userRoles.includes(requiredRole) || userRole === requiredRole;
      
      if (!hasRole) {
        Logger.auth('roleCheckFailed', {
          uid: req.user.uid,
          requiredRole,
          userRoles: userRoles,
          userRole: userRole,
          endpoint: req.originalUrl,
          method: req.method
        });
        
        const response = FirebaseResponse.forbidden(`Role '${requiredRole}' required`, 'INSUFFICIENT_ROLE');
        return res.status(403).json(response);
      }

      req.userRoles = userRoles;
      req.userRole = userRole;
      
      Logger.auth('roleCheckPassed', {
        uid: req.user.uid,
        requiredRole,
        userRoles,
        endpoint: req.originalUrl
      });

      next();
      
    } catch (error) {
      Logger.failure('requireRole', error, {
        requiredRole,
        uid: req.user?.uid,
        endpoint: req.originalUrl
      });

      const response = FirebaseResponse.error(error, 'role verification');
      return res.status(500).json(response);
    }
  };
};

const requireAnyRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        const response = FirebaseResponse.unauthorized('Authentication required for role check');
        return res.status(401).json(response);
      }

      const userResult = await authService.getUserByUid(req.user.uid);
      
      if (!userResult.success) {
        const response = FirebaseResponse.error(userResult.error, 'role verification');
        return res.status(500).json(response);
      }

      const userRoles = userResult.data.customClaims?.roles || [];
      const userRole = userResult.data.customClaims?.role;
      
      const hasAnyRole = allowedRoles.some(role => 
        userRoles.includes(role) || userRole === role
      );
      
      if (!hasAnyRole) {
        Logger.auth('multiRoleCheckFailed', {
          uid: req.user.uid,
          allowedRoles,
          userRoles,
          userRole,
          endpoint: req.originalUrl
        });
        
        const response = FirebaseResponse.forbidden(`One of these roles required: ${allowedRoles.join(', ')}`, 'INSUFFICIENT_ROLE');
        return res.status(403).json(response);
      }

      req.userRoles = userRoles;
      req.userRole = userRole;
      
      Logger.auth('multiRoleCheckPassed', {
        uid: req.user.uid,
        allowedRoles,
        userRoles,
        endpoint: req.originalUrl
      });

      next();
      
    } catch (error) {
      Logger.failure('requireAnyRole', error, {
        allowedRoles,
        uid: req.user?.uid,
        endpoint: req.originalUrl
      });

      const response = FirebaseResponse.error(error, 'role verification');
      return res.status(500).json(response);
    }
  };
};

const requireOwnership = (ownershipField = 'userId', paramName = 'id') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        const response = FirebaseResponse.unauthorized('Authentication required for ownership check');
        return res.status(401).json(response);
      }

      const resourceId = req.params[paramName] || req.body[ownershipField];
      const userId = req.user.uid;

      if (!resourceId) {
        Logger.auth('ownershipCheckMissingResource', {
          uid: userId,
          ownershipField,
          paramName,
          endpoint: req.originalUrl
        });
        
        const response = FirebaseResponse.error(
          new Error(`${ownershipField} is required for ownership verification`),
          'ownership verification'
        );
        return res.status(400).json(response);
      }

      if (resourceId !== userId) {
        Logger.auth('ownershipCheckFailed', {
          uid: userId,
          resourceId,
          ownershipField,
          endpoint: req.originalUrl
        });
        
        const response = FirebaseResponse.forbidden('You can only access your own resources', 'OWNERSHIP_REQUIRED');
        return res.status(403).json(response);
      }

      Logger.auth('ownershipCheckPassed', {
        uid: userId,
        resourceId,
        endpoint: req.originalUrl
      });

      next();
      
    } catch (error) {
      Logger.failure('requireOwnership', error, {
        uid: req.user?.uid,
        ownershipField,
        endpoint: req.originalUrl
      });

      const response = FirebaseResponse.error(error, 'ownership verification');
      return res.status(500).json(response);
    }
  };
};

const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        const response = FirebaseResponse.unauthorized('Authentication required for permission check');
        return res.status(401).json(response);
      }

      const userResult = await authService.getUserByUid(req.user.uid);
      
      if (!userResult.success) {
        const response = FirebaseResponse.error(userResult.error, 'permission verification');
        return res.status(500).json(response);
      }

      const userPermissions = userResult.data.customClaims?.permissions || [];
      
      if (!userPermissions.includes(permission)) {
        Logger.auth('permissionCheckFailed', {
          uid: req.user.uid,
          requiredPermission: permission,
          userPermissions,
          endpoint: req.originalUrl
        });
        
        const response = FirebaseResponse.forbidden(`Permission '${permission}' required`, 'INSUFFICIENT_PERMISSION');
        return res.status(403).json(response);
      }

      req.userPermissions = userPermissions;
      
      Logger.auth('permissionCheckPassed', {
        uid: req.user.uid,
        requiredPermission: permission,
        endpoint: req.originalUrl
      });

      next();
      
    } catch (error) {
      Logger.failure('requirePermission', error, {
        permission,
        uid: req.user?.uid,
        endpoint: req.originalUrl
      });

      const response = FirebaseResponse.error(error, 'permission verification');
      return res.status(500).json(response);
    }
  };
};

const addFirebaseContext = (req, res, next) => {
  req.firebaseContext = {
    requestId: Math.random().toString(36).substring(2, 15),
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    endpoint: req.originalUrl,
    method: req.method,
    userId: req.user?.uid || null
  };

  Logger.info('Request context added', req.firebaseContext);
  next();
};

const logFirebaseOperation = (operationType) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    const originalJson = res.json;
    res.json = function(body) {
      const timing = Date.now() - startTime;
      
      Logger.info(`Firebase ${operationType} operation completed`, {
        ...req.firebaseContext,
        operationType,
        statusCode: res.statusCode,
        success: body.success,
        timing,
        hasData: !!body.data
      });
      
      return originalJson.call(this, body);
    };

    Logger.operation(operationType, req.firebaseContext);
    next();
  };
};

const requireAdmin = requireRole('admin');

const requireModerator = requireAnyRole(['admin', 'moderator']);

module.exports = {
  verifyFirebaseToken,
  optionalFirebaseAuth,
  requireRole,
  requireAnyRole,
  requireOwnership,
  requirePermission,
  requireAdmin,
  requireModerator,
  addFirebaseContext,
  logFirebaseOperation
};
