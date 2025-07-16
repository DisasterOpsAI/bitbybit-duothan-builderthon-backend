class FirebaseLogger {
  static levels = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
  };

  static log(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const functionName = context.function || this.getFunctionName();
    const requestId = context.requestId || context.uid || 'N/A';
    
    const logEntry = {
      timestamp,
      level,
      message,
      function: functionName,
      requestId,
      service: 'Firebase',
      ...context
    };

    if (process.env.NODE_ENV !== 'production') {
      const colors = {
        DEBUG: '\x1b[36m',
        INFO: '\x1b[32m',
        WARN: '\x1b[33m',
        ERROR: '\x1b[31m'
      };
      
      const reset = '\x1b[0m';
      const color = colors[level] || '';
      
      console.log(`${color}[${timestamp}] 🔥 ${level} [${functionName}] ${message}${reset}`);
      
      if (Object.keys(context).length > 0) {
        const contextToShow = { ...context };
        delete contextToShow.function;
        delete contextToShow.requestId;
        
        if (Object.keys(contextToShow).length > 0) {
          console.log(`${color}Context:${reset}`, JSON.stringify(contextToShow, null, 2));
        }
      }
    }
    
    return logEntry;
  }

  static getFunctionName() {
    const stack = new Error().stack;
    const caller = stack.split('\n')[4];
    const match = caller?.match(/at\s+([^\s]+)/);
    return match ? match[1].replace('Object.', '') : 'unknown';
  }

  static debug(message, context = {}) {
    return this.log(this.levels.DEBUG, message, { 
      ...context, 
      function: context.function || this.getFunctionName() 
    });
  }

  static info(message, context = {}) {
    return this.log(this.levels.INFO, message, { 
      ...context, 
      function: context.function || this.getFunctionName() 
    });
  }

  static warn(message, context = {}) {
    return this.log(this.levels.WARN, message, { 
      ...context, 
      function: context.function || this.getFunctionName() 
    });
  }

  static error(message, context = {}) {
    return this.log(this.levels.ERROR, message, { 
      ...context, 
      function: context.function || this.getFunctionName() 
    });
  }

  static operation(operationType, details = {}) {
    return this.info(`Starting ${operationType}`, {
      operationType,
      ...details,
      function: `Firebase.${operationType}`
    });
  }

  static success(operationType, result = {}, timing = null) {
    const message = `${operationType} completed successfully`;
    return this.info(message, {
      operationType,
      success: true,
      timing: timing ? `${timing}ms` : undefined,
      ...result,
      function: `Firebase.${operationType}`
    });
  }

  static failure(operationType, error, context = {}) {
    const message = `${operationType} failed`;
    return this.error(message, {
      operationType,
      success: false,
      error: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      ...context,
      function: `Firebase.${operationType}`
    });
  }

  static performance(operationType, duration, details = {}) {
    const message = `Performance: ${operationType} took ${duration}ms`;
    
    let level = this.levels.INFO;
    if (duration > 5000) level = this.levels.WARN;
    if (duration > 10000) level = this.levels.ERROR;
    
    return this.log(level, message, {
      operationType,
      duration,
      performance: true,
      ...details,
      function: `Firebase.${operationType}`
    });
  }

  static auth(event, details = {}) {
    return this.info(`Auth: ${event}`, {
      authEvent: event,
      ...details,
      function: 'Firebase.Auth'
    });
  }

  static firestore(operation, collection, docId = null, details = {}) {
    const message = `Firestore: ${operation} in ${collection}${docId ? `/${docId}` : ''}`;
    return this.info(message, {
      firestoreOperation: operation,
      collection,
      documentId: docId,
      ...details,
      function: 'Firebase.Firestore'
    });
  }

  static storage(operation, path, details = {}) {
    const message = `Storage: ${operation} - ${path}`;
    return this.info(message, {
      storageOperation: operation,
      path,
      ...details,
      function: 'Firebase.Storage'
    });
  }

  static realtimeDb(operation, path, details = {}) {
    const message = `RealtimeDB: ${operation} at ${path}`;
    return this.info(message, {
      realtimeDbOperation: operation,
      path,
      ...details,
      function: 'Firebase.RealtimeDB'
    });
  }
}

module.exports = FirebaseLogger;
