const { getRealtimeDatabase } = require('../config/firebase-admin');
const Logger = require('../utils/firebase-logger');
const { FirebaseResponse, FirebaseResponses } = require('../utils/firebase-response');

class RealtimeDatabaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;
    
    try {
      this.db = getRealtimeDatabase();
      this.initialized = true;
      Logger.info('Firebase Realtime Database service initialized');
    } catch (error) {
      Logger.error('Failed to initialize Realtime Database service', { error: error.message });
      throw error;
    }
  }

  ref(path) {
    this.initialize();
    return this.db.ref(path);
  }

  async set(path, data, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.realtimeDb('set', path, { 
        dataType: typeof data,
        dataSize: JSON.stringify(data).length,
        userId 
      });
      
      const dataWithTimestamp = {
        ...data,
        updatedAt: Date.now(),
        ...(userId && { updatedBy: userId })
      };

      const ref = this.db.ref(path);
      await ref.set(dataWithTimestamp);

      const timing = Date.now() - startTime;
      
      Logger.success('set', { path }, timing);

      return FirebaseResponses.realtimeDb.set(path, dataWithTimestamp, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('set', error, { path, timing });
      return FirebaseResponse.error(error, 'realtimeDb.set', { path }, timing);
    }
  }

  async get(path) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.realtimeDb('get', path);
      
      const ref = this.db.ref(path);
      const snapshot = await ref.once('value');
      const data = snapshot.val();

      const timing = Date.now() - startTime;
      
      Logger.success('get', { 
        path, 
        hasData: data !== null,
        dataSize: data ? JSON.stringify(data).length : 0
      }, timing);

      return FirebaseResponses.realtimeDb.retrieved(path, data, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('get', error, { path, timing });
      return FirebaseResponse.error(error, 'realtimeDb.get', { path }, timing);
    }
  }

  async update(path, updates, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.realtimeDb('update', path, { 
        updateKeys: Object.keys(updates),
        userId 
      });
      
      const updatesWithTimestamp = {
        ...updates,
        updatedAt: Date.now(),
        ...(userId && { updatedBy: userId })
      };

      const ref = this.db.ref(path);
      await ref.update(updatesWithTimestamp);

      const timing = Date.now() - startTime;
      
      Logger.success('update', { path }, timing);

      return FirebaseResponses.realtimeDb.updated(path, updatesWithTimestamp, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('update', error, { path, timing });
      return FirebaseResponse.error(error, 'realtimeDb.update', { path }, timing);
    }
  }

  async remove(path, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.realtimeDb('remove', path, { userId });
      
      const ref = this.db.ref(path);
      await ref.remove();

      const timing = Date.now() - startTime;
      
      Logger.success('remove', { path }, timing);

      return FirebaseResponses.realtimeDb.removed(path, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('remove', error, { path, timing });
      return FirebaseResponse.error(error, 'realtimeDb.remove', { path }, timing);
    }
  }

  async push(path, data, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.realtimeDb('push', path, { 
        dataType: typeof data,
        userId 
      });
      
      const dataWithTimestamp = {
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...(userId && { createdBy: userId })
      };

      const ref = this.db.ref(path);
      const newRef = await ref.push(dataWithTimestamp);

      const timing = Date.now() - startTime;
      
      Logger.success('push', { 
        path, 
        newKey: newRef.key 
      }, timing);

      return FirebaseResponse.success({
        path,
        key: newRef.key,
        data: dataWithTimestamp,
        fullPath: `${path}/${newRef.key}`
      }, 'Data pushed successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('push', error, { path, timing });
      return FirebaseResponse.error(error, 'realtimeDb.push', { path }, timing);
    }
  }

  async query(path, options = {}) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      const {
        orderByChild = null,
        orderByKey = false,
        orderByValue = false,
        limitToFirst = null,
        limitToLast = null,
        startAt = null,
        endAt = null,
        equalTo = null
      } = options;

      Logger.realtimeDb('query', path, { options });
      
      let ref = this.db.ref(path);

      if (orderByChild) {
        ref = ref.orderByChild(orderByChild);
      } else if (orderByKey) {
        ref = ref.orderByKey();
      } else if (orderByValue) {
        ref = ref.orderByValue();
      }

      if (startAt !== null) {
        ref = ref.startAt(startAt);
      }
      if (endAt !== null) {
        ref = ref.endAt(endAt);
      }
      if (equalTo !== null) {
        ref = ref.equalTo(equalTo);
      }

      if (limitToFirst !== null) {
        ref = ref.limitToFirst(limitToFirst);
      }
      if (limitToLast !== null) {
        ref = ref.limitToLast(limitToLast);
      }

      const snapshot = await ref.once('value');
      const data = snapshot.val();

      let results = data;
      if (data && typeof data === 'object') {
        results = Object.keys(data).map(key => ({
          key,
          ...data[key]
        }));
      }

      const timing = Date.now() - startTime;
      
      Logger.success('query', { 
        path,
        resultCount: Array.isArray(results) ? results.length : (results ? 1 : 0)
      }, timing);

      return FirebaseResponse.success({
        path,
        data: results,
        count: Array.isArray(results) ? results.length : (results ? 1 : 0),
        query: options
      }, 'Query completed successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('query', error, { path, options, timing });
      return FirebaseResponse.error(error, 'realtimeDb.query', { path, options }, timing);
    }
  }

  async listen(path, eventType = 'value', callback) {
    try {
      this.initialize();
      
      Logger.realtimeDb('listen', path, { eventType });
      
      const ref = this.db.ref(path);
      
      const wrappedCallback = (snapshot) => {
        const data = snapshot.val();
        Logger.realtimeDb('dataChanged', path, { 
          eventType,
          hasData: data !== null,
          key: snapshot.key
        });
        
        callback({
          success: true,
          data,
          key: snapshot.key,
          path,
          timestamp: new Date().toISOString()
        });
      };

      const errorCallback = (error) => {
        Logger.failure('listen', error, { path, eventType });
        callback({
          success: false,
          error: {
            message: error.message,
            code: error.code || 'LISTENER_ERROR'
          },
          path,
          timestamp: new Date().toISOString()
        });
      };

      ref.on(eventType, wrappedCallback, errorCallback);
      
      Logger.success('listen', { path, eventType });

      return {
        success: true,
        message: 'Listener attached successfully',
        detach: () => {
          ref.off(eventType, wrappedCallback);
          Logger.realtimeDb('detach', path, { eventType });
          return FirebaseResponse.success({
            path,
            eventType,
            detached: true
          }, 'Listener detached successfully');
        }
      };
      
    } catch (error) {
      Logger.failure('listen', error, { path, eventType });
      return FirebaseResponse.error(error, 'realtimeDb.listen', { path, eventType });
    }
  }

  async transaction(path, updateFunction, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.realtimeDb('transaction', path, { userId });
      
      const ref = this.db.ref(path);
      
      const result = await ref.transaction((currentData) => {
        const updatedData = updateFunction(currentData);
        
        if (updatedData && typeof updatedData === 'object') {
          return {
            ...updatedData,
            updatedAt: Date.now(),
            ...(userId && { updatedBy: userId })
          };
        }
        
        return updatedData;
      });

      const timing = Date.now() - startTime;
      
      if (result.committed) {
        Logger.success('transaction', { 
          path,
          committed: true 
        }, timing);

        return FirebaseResponse.success({
          path,
          committed: true,
          data: result.snapshot.val(),
          snapshot: {
            key: result.snapshot.key,
            exists: result.snapshot.exists()
          }
        }, 'Transaction completed successfully', timing);
      } else {
        Logger.warn('Transaction aborted', { path, timing });
        
        return FirebaseResponse.success({
          path,
          committed: false,
          aborted: true,
          data: result.snapshot.val()
        }, 'Transaction was aborted', timing);
      }
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('transaction', error, { path, timing });
      return FirebaseResponse.error(error, 'realtimeDb.transaction', { path }, timing);
    }
  }

  async batchUpdate(updates, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.realtimeDb('batchUpdate', 'multiple', { 
        pathCount: Object.keys(updates).length,
        userId 
      });
      
      const updatesWithTimestamp = {};
      Object.keys(updates).forEach(path => {
        if (updates[path] && typeof updates[path] === 'object') {
          updatesWithTimestamp[path] = {
            ...updates[path],
            updatedAt: Date.now(),
            ...(userId && { updatedBy: userId })
          };
        } else {
          updatesWithTimestamp[path] = updates[path];
        }
      });

      const ref = this.db.ref();
      await ref.update(updatesWithTimestamp);

      const timing = Date.now() - startTime;
      
      Logger.success('batchUpdate', { 
        pathCount: Object.keys(updates).length 
      }, timing);

      return FirebaseResponse.success({
        updates: updatesWithTimestamp,
        pathCount: Object.keys(updates).length,
        batchCompleted: true
      }, 'Batch update completed successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('batchUpdate', error, { 
        pathCount: Object.keys(updates).length,
        timing 
      });
      return FirebaseResponse.error(error, 'realtimeDb.batchUpdate', { 
        pathCount: Object.keys(updates).length 
      }, timing);
    }
  }

  async exists(path) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.realtimeDb('exists', path);
      
      const ref = this.db.ref(path);
      const snapshot = await ref.once('value');
      const exists = snapshot.exists();

      const timing = Date.now() - startTime;
      
      Logger.success('exists', { path, exists }, timing);

      return FirebaseResponse.success({
        path,
        exists,
        key: snapshot.key
      }, `Path ${exists ? 'exists' : 'does not exist'}`, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('exists', error, { path, timing });
      return FirebaseResponse.error(error, 'realtimeDb.exists', { path }, timing);
    }
  }

  getServerTimestamp() {
    this.initialize();
    return this.db.ServerValue.TIMESTAMP;
  }

  generateKey(path = '') {
    this.initialize();
    const ref = this.db.ref(path);
    return ref.push().key;
  }
}

module.exports = new RealtimeDatabaseService();
