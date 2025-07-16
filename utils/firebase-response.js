const Logger = require('./firebase-logger');

class FirebaseResponse {
  static success(data = null, message = 'Operation successful', timing = null, meta = {}) {
    const response = {
      success: true,
      message,
      timestamp: new Date().toISOString(),
      ...(data && { data }),
      ...(timing && { timing: { duration: timing, unit: 'ms' } }),
      ...(Object.keys(meta).length > 0 && { meta })
    };

    Logger.debug('Success response created', { 
      hasData: !!data, 
      timing, 
      messageLength: message.length 
    });

    return response;
  }

  static error(error, operation = 'unknown', additionalContext = {}, timing = null) {
    const errorInfo = {
      message: error.message || 'Unknown error occurred',
      code: error.code || 'UNKNOWN_ERROR',
      operation,
      timestamp: new Date().toISOString(),
      ...(timing && { timing: { duration: timing, unit: 'ms' } }),
      ...(process.env.NODE_ENV === 'development' && { 
        stack: error.stack,
        details: error.details || null 
      }),
      ...additionalContext
    };

    Logger.failure(operation, error, additionalContext);

    return {
      success: false,
      error: errorInfo,
      timestamp: new Date().toISOString()
    };
  }

  static validation(errors, message = 'Validation failed') {
    const response = {
      success: false,
      message,
      errors: Array.isArray(errors) ? errors : [errors],
      timestamp: new Date().toISOString(),
      type: 'VALIDATION_ERROR'
    };

    Logger.warn('Validation failed', { 
      errorCount: Array.isArray(errors) ? errors.length : 1,
      errors 
    });

    return response;
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    const response = {
      success: false,
      message,
      error: {
        code,
        type: 'AUTHENTICATION_ERROR',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    Logger.auth('Authentication failed', { code, message });

    return response;
  }

  static forbidden(message = 'Access forbidden', code = 'FORBIDDEN') {
    const response = {
      success: false,
      message,
      error: {
        code,
        type: 'AUTHORIZATION_ERROR',
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    Logger.auth('Access forbidden', { code, message });

    return response;
  }

  static notFound(resource = 'Resource', identifier = null) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;

    const response = {
      success: false,
      message,
      error: {
        code: 'NOT_FOUND',
        type: 'RESOURCE_ERROR',
        resource,
        identifier,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    Logger.warn('Resource not found', { resource, identifier });

    return response;
  }

  static paginated(data, pagination, message = 'Data retrieved successfully') {
    const response = {
      success: true,
      message,
      data,
      pagination: {
        currentPage: pagination.page || 1,
        limit: pagination.limit || 20,
        total: pagination.total || data.length,
        hasMore: pagination.hasMore || false,
        ...pagination
      },
      timestamp: new Date().toISOString()
    };

    Logger.info('Paginated response created', { 
      itemCount: data.length,
      pagination 
    });

    return response;
  }

  static batch(results, operation = 'batch operation') {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const response = {
      success: failed.length === 0,
      message: `${operation} completed: ${successful.length} successful, ${failed.length} failed`,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        successRate: ((successful.length / results.length) * 100).toFixed(2) + '%'
      },
      results,
      timestamp: new Date().toISOString()
    };

    Logger.info(`Batch operation completed`, {
      operation,
      total: results.length,
      successful: successful.length,
      failed: failed.length
    });

    return response;
  }

  static async wrap(operation, operationName = 'operation', context = {}) {
    const startTime = Date.now();
    
    try {
      Logger.operation(operationName, context);
      
      const result = await operation();
      const timing = Date.now() - startTime;
      
      Logger.success(operationName, { timing }, timing);
      
      return this.success(result, `${operationName} completed successfully`, timing, context);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      
      return this.error(error, operationName, context, timing);
    }
  }

  static builder() {
    return new ResponseBuilder();
  }
}

class ResponseBuilder {
  constructor() {
    this.response = {
      success: true,
      timestamp: new Date().toISOString()
    };
  }

  setSuccess(success) {
    this.response.success = success;
    return this;
  }

  setMessage(message) {
    this.response.message = message;
    return this;
  }

  setData(data) {
    this.response.data = data;
    return this;
  }

  setError(error) {
    this.response.success = false;
    this.response.error = error;
    return this;
  }

  setTiming(duration) {
    this.response.timing = { duration, unit: 'ms' };
    return this;
  }

  setMeta(meta) {
    this.response.meta = meta;
    return this;
  }

  addMeta(key, value) {
    if (!this.response.meta) this.response.meta = {};
    this.response.meta[key] = value;
    return this;
  }

  build() {
    return this.response;
  }
}

class FirebaseResponses {
  static document = {
    created: (doc, timing) => FirebaseResponse.success(doc, 'Document created successfully', timing),
    updated: (doc, timing) => FirebaseResponse.success(doc, 'Document updated successfully', timing),
    deleted: (docId, timing) => FirebaseResponse.success({ id: docId, deleted: true }, 'Document deleted successfully', timing),
    retrieved: (doc, timing) => FirebaseResponse.success(doc, 'Document retrieved successfully', timing),
    notFound: (collection, docId) => FirebaseResponse.notFound('Document', `${collection}/${docId}`)
  };

  static auth = {
    tokenVerified: (decoded, timing) => FirebaseResponse.success(decoded, 'Token verified successfully', timing),
    tokenCreated: (token, timing) => FirebaseResponse.success({ token }, 'Custom token created successfully', timing),
    userCreated: (user, timing) => FirebaseResponse.success(user, 'User created successfully', timing),
    userDeleted: (uid, timing) => FirebaseResponse.success({ uid, deleted: true }, 'User deleted successfully', timing),
    invalidToken: () => FirebaseResponse.unauthorized('Invalid or expired token', 'INVALID_TOKEN'),
    missingToken: () => FirebaseResponse.unauthorized('Authorization token required', 'MISSING_TOKEN')
  };

  static storage = {
    uploaded: (fileInfo, timing) => FirebaseResponse.success(fileInfo, 'File uploaded successfully', timing),
    downloaded: (fileInfo, timing) => FirebaseResponse.success(fileInfo, 'File downloaded successfully', timing),
    deleted: (path, timing) => FirebaseResponse.success({ path, deleted: true }, 'File deleted successfully', timing),
    metadata: (metadata, timing) => FirebaseResponse.success(metadata, 'File metadata retrieved successfully', timing),
    notFound: (path) => FirebaseResponse.notFound('File', path)
  };

  static realtimeDb = {
    set: (path, data, timing) => FirebaseResponse.success({ path, data }, 'Data set successfully', timing),
    updated: (path, updates, timing) => FirebaseResponse.success({ path, updates }, 'Data updated successfully', timing),
    retrieved: (path, data, timing) => FirebaseResponse.success({ path, data }, 'Data retrieved successfully', timing),
    removed: (path, timing) => FirebaseResponse.success({ path, removed: true }, 'Data removed successfully', timing)
  };
}

module.exports = {
  FirebaseResponse,
  FirebaseResponses,
  ResponseBuilder
};
