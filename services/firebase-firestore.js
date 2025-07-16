const { getFirestore, admin } = require('../config/firebase-admin');
const Logger = require('../utils/firebase-logger');
const { FirebaseResponse, FirebaseResponses } = require('../utils/firebase-response');

class FirestoreService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;
    
    try {
      this.db = getFirestore();
      this.initialized = true;
      Logger.info('Firestore service initialized');
    } catch (error) {
      Logger.error('Failed to initialize Firestore service', { error: error.message });
      throw error;
    }
  }

  async createDocument(collection, data, docId = null, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('create', collection, docId, { 
        dataKeys: Object.keys(data),
        userId 
      });
      
      const docData = {
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userId && { createdBy: userId })
      };

      let docRef;
      if (docId) {
        docRef = this.db.collection(collection).doc(docId);
        await docRef.set(docData);
      } else {
        docRef = await this.db.collection(collection).add(docData);
      }

      const timing = Date.now() - startTime;
      
      Logger.success('createDocument', { 
        collection, 
        documentId: docRef.id 
      }, timing);

      return FirebaseResponses.document.created({
        id: docRef.id,
        ...docData
      }, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('createDocument', error, { collection, docId, timing });
      return FirebaseResponse.error(error, 'createDocument', { collection, docId }, timing);
    }
  }

  async getDocument(collection, docId) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('read', collection, docId);
      
      const docRef = this.db.collection(collection).doc(docId);
      const doc = await docRef.get();

      const timing = Date.now() - startTime;

      if (!doc.exists) {
        Logger.warn('Document not found', { collection, docId, timing });
        return FirebaseResponses.document.notFound(collection, docId);
      }

      const data = { id: doc.id, ...doc.data() };
      
      Logger.success('getDocument', { collection, docId }, timing);

      return FirebaseResponses.document.retrieved(data, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('getDocument', error, { collection, docId, timing });
      return FirebaseResponse.error(error, 'getDocument', { collection, docId }, timing);
    }
  }

  async updateDocument(collection, docId, data, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('update', collection, docId, { 
        updateKeys: Object.keys(data),
        userId 
      });
      
      const docRef = this.db.collection(collection).doc(docId);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        const timing = Date.now() - startTime;
        return FirebaseResponses.document.notFound(collection, docId);
      }

      const updateData = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userId && { updatedBy: userId })
      };

      await docRef.update(updateData);

      const timing = Date.now() - startTime;
      
      const updatedDoc = await docRef.get();
      const result = { id: updatedDoc.id, ...updatedDoc.data() };
      
      Logger.success('updateDocument', { collection, docId }, timing);

      return FirebaseResponses.document.updated(result, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('updateDocument', error, { collection, docId, timing });
      return FirebaseResponse.error(error, 'updateDocument', { collection, docId }, timing);
    }
  }

  async deleteDocument(collection, docId, hardDelete = false, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('delete', collection, docId, { hardDelete, userId });
      
      const docRef = this.db.collection(collection).doc(docId);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        const timing = Date.now() - startTime;
        return FirebaseResponses.document.notFound(collection, docId);
      }

      if (hardDelete) {
        await docRef.delete();
      } else {
        await docRef.update({
          deleted: true,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(userId && { deletedBy: userId })
        });
      }

      const timing = Date.now() - startTime;
      
      Logger.success('deleteDocument', { collection, docId, hardDelete }, timing);

      return FirebaseResponses.document.deleted(docId, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('deleteDocument', error, { collection, docId, timing });
      return FirebaseResponse.error(error, 'deleteDocument', { collection, docId }, timing);
    }
  }

  async queryDocuments(collection, options = {}) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      const {
        filters = [],
        orderBy = null,
        limit = 50,
        startAfter = null,
        includeDeleted = false
      } = options;

      Logger.firestore('query', collection, null, { 
        filtersCount: filters.length,
        orderBy,
        limit 
      });
      
      let query = this.db.collection(collection);

      if (!includeDeleted) {
        query = query.where('deleted', '!=', true);
      }

      filters.forEach(filter => {
        const { field, operator, value } = filter;
        query = query.where(field, operator, value);
      });

      if (orderBy) {
        const { field, direction = 'asc' } = orderBy;
        query = query.orderBy(field, direction);
      }

      if (limit) {
        query = query.limit(limit);
      }

      if (startAfter) {
        const startAfterDoc = await this.db.collection(collection).doc(startAfter).get();
        if (startAfterDoc.exists) {
          query = query.startAfter(startAfterDoc);
        }
      }

      const snapshot = await query.get();
      const documents = [];

      snapshot.forEach(doc => {
        documents.push({ id: doc.id, ...doc.data() });
      });

      const timing = Date.now() - startTime;
      
      Logger.success('queryDocuments', { 
        collection, 
        count: documents.length 
      }, timing);

      return FirebaseResponse.success({
        documents,
        count: documents.length,
        hasMore: documents.length === limit,
        lastDocument: documents.length > 0 ? documents[documents.length - 1].id : null
      }, 'Documents queried successfully', timing, {
        collection,
        filters: filters.length,
        orderBy
      });
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('queryDocuments', error, { collection, options, timing });
      return FirebaseResponse.error(error, 'queryDocuments', { collection, options }, timing);
    }
  }

  async searchDocuments(collection, searchTerm, searchFields = ['name', 'title', 'description']) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('search', collection, null, { 
        searchTerm,
        searchFields 
      });

      const searchPromises = searchFields.map(async (field) => {
        const query = this.db.collection(collection)
          .where(field, '>=', searchTerm)
          .where(field, '<=', searchTerm + '\uf8ff')
          .where('deleted', '!=', true)
          .limit(20);

        const snapshot = await query.get();
        const docs = [];
        snapshot.forEach(doc => {
          docs.push({ id: doc.id, ...doc.data() });
        });
        return docs;
      });

      const results = await Promise.all(searchPromises);
      
      const allDocs = results.flat();
      const uniqueDocs = allDocs.filter((doc, index, self) => 
        index === self.findIndex(d => d.id === doc.id)
      );

      const timing = Date.now() - startTime;
      
      Logger.success('searchDocuments', { 
        collection,
        searchTerm,
        resultsCount: uniqueDocs.length 
      }, timing);

      return FirebaseResponse.success({
        documents: uniqueDocs,
        count: uniqueDocs.length,
        searchTerm,
        searchFields
      }, 'Search completed successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('searchDocuments', error, { collection, searchTerm, timing });
      return FirebaseResponse.error(error, 'searchDocuments', { collection, searchTerm }, timing);
    }
  }

  async batchOperations(operations) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('batch', 'multiple', null, { 
        operationsCount: operations.length 
      });

      const batch = this.db.batch();
      const results = [];

      operations.forEach((operation, index) => {
        const { type, collection, id, data } = operation;

        try {
          switch (type) {
            case 'create':
              const newDocRef = this.db.collection(collection).doc();
              const createData = {
                ...data,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              };
              batch.set(newDocRef, createData);
              results.push({ 
                success: true, 
                type, 
                collection, 
                id: newDocRef.id,
                index 
              });
              break;

            case 'update':
              const updateDocRef = this.db.collection(collection).doc(id);
              const updateData = {
                ...data,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              };
              batch.update(updateDocRef, updateData);
              results.push({ 
                success: true, 
                type, 
                collection, 
                id,
                index 
              });
              break;

            case 'delete':
              const deleteDocRef = this.db.collection(collection).doc(id);
              batch.delete(deleteDocRef);
              results.push({ 
                success: true, 
                type, 
                collection, 
                id,
                index 
              });
              break;

            default:
              results.push({ 
                success: false, 
                error: `Invalid operation type: ${type}`,
                index 
              });
          }
        } catch (opError) {
          results.push({ 
            success: false, 
            error: opError.message,
            type,
            collection,
            id,
            index 
          });
        }
      });

      await batch.commit();

      const timing = Date.now() - startTime;
      
      Logger.success('batchOperations', { 
        operationsCount: operations.length 
      }, timing);

      return FirebaseResponse.batch(results, 'batch operations');
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('batchOperations', error, { operationsCount: operations.length, timing });
      return FirebaseResponse.error(error, 'batchOperations', { operationsCount: operations.length }, timing);
    }
  }

  async countDocuments(collection, filters = []) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('count', collection, null, { filtersCount: filters.length });

      let query = this.db.collection(collection);

      filters.forEach(filter => {
        const { field, operator, value } = filter;
        query = query.where(field, operator, value);
      });

      const snapshot = await query.get();
      const count = snapshot.size;

      const timing = Date.now() - startTime;
      
      Logger.success('countDocuments', { collection, count }, timing);

      return FirebaseResponse.success({ 
        collection, 
        count, 
        filters 
      }, 'Document count retrieved successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('countDocuments', error, { collection, timing });
      return FirebaseResponse.error(error, 'countDocuments', { collection }, timing);
    }
  }

  async addToArray(collection, docId, field, value, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('addToArray', collection, docId, { field, userId });
      
      const docRef = this.db.collection(collection).doc(docId);
      
      await docRef.update({
        [field]: admin.firestore.FieldValue.arrayUnion(value),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userId && { updatedBy: userId })
      });

      const timing = Date.now() - startTime;
      
      Logger.success('addToArray', { collection, docId, field }, timing);

      return FirebaseResponse.success({
        collection,
        docId,
        field,
        addedValue: value
      }, 'Item added to array successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('addToArray', error, { collection, docId, field, timing });
      return FirebaseResponse.error(error, 'addToArray', { collection, docId, field }, timing);
    }
  }

  async removeFromArray(collection, docId, field, value, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('removeFromArray', collection, docId, { field, userId });
      
      const docRef = this.db.collection(collection).doc(docId);
      
      await docRef.update({
        [field]: admin.firestore.FieldValue.arrayRemove(value),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userId && { updatedBy: userId })
      });

      const timing = Date.now() - startTime;
      
      Logger.success('removeFromArray', { collection, docId, field }, timing);

      return FirebaseResponse.success({
        collection,
        docId,
        field,
        removedValue: value
      }, 'Item removed from array successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('removeFromArray', error, { collection, docId, field, timing });
      return FirebaseResponse.error(error, 'removeFromArray', { collection, docId, field }, timing);
    }
  }

  async incrementField(collection, docId, field, amount = 1, userId = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.firestore('increment', collection, docId, { field, amount, userId });
      
      const docRef = this.db.collection(collection).doc(docId);
      
      await docRef.update({
        [field]: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(userId && { updatedBy: userId })
      });

      const timing = Date.now() - startTime;
      
      Logger.success('incrementField', { collection, docId, field, amount }, timing);

      return FirebaseResponse.success({
        collection,
        docId,
        field,
        incrementAmount: amount
      }, 'Field incremented successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('incrementField', error, { collection, docId, field, timing });
      return FirebaseResponse.error(error, 'incrementField', { collection, docId, field }, timing);
    }
  }
}

module.exports = new FirestoreService();
