const { getAuth } = require('../config/firebase-admin');
const Logger = require('../utils/firebase-logger');
const { FirebaseResponse, FirebaseResponses } = require('../utils/firebase-response');

class AuthService {
  constructor() {
    this.auth = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;
    
    try {
      this.auth = getAuth();
      this.initialized = true;
      Logger.info('Firebase Auth service initialized');
    } catch (error) {
      Logger.error('Failed to initialize Auth service', { error: error.message });
      throw error;
    }
  }

  async verifyIdToken(idToken, checkRevoked = false) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('verifyIdToken', { tokenLength: idToken?.length, checkRevoked });
      
      if (!idToken) {
        return FirebaseResponses.auth.missingToken();
      }

      const decodedToken = await this.auth.verifyIdToken(idToken, checkRevoked);

      const timing = Date.now() - startTime;
      
      Logger.success('verifyIdToken', { 
        uid: decodedToken.uid,
        email: decodedToken.email 
      }, timing);

      const userData = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        name: decodedToken.name,
        picture: decodedToken.picture,
        phoneNumber: decodedToken.phone_number,
        issuer: decodedToken.iss,
        audience: decodedToken.aud,
        issuedAt: new Date(decodedToken.iat * 1000),
        expiresAt: new Date(decodedToken.exp * 1000),
        authTime: new Date(decodedToken.auth_time * 1000),
        customClaims: decodedToken.customClaims || {}
      };

      return FirebaseResponses.auth.tokenVerified(userData, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      
      Logger.failure('verifyIdToken', error, { timing });

      if (error.code === 'auth/id-token-expired') {
        return FirebaseResponses.auth.invalidToken();
      } else if (error.code === 'auth/id-token-revoked') {
        return FirebaseResponse.unauthorized('Token has been revoked', 'TOKEN_REVOKED');
      } else if (error.code === 'auth/invalid-id-token') {
        return FirebaseResponses.auth.invalidToken();
      }

      return FirebaseResponse.error(error, 'verifyIdToken', {}, timing);
    }
  }

  async createCustomToken(uid, additionalClaims = {}) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('createCustomToken', { 
        uid, 
        claimsKeys: Object.keys(additionalClaims) 
      });
      
      if (!uid) {
        return FirebaseResponse.validation('UID is required for custom token creation');
      }

      const customToken = await this.auth.createCustomToken(uid, additionalClaims);

      const timing = Date.now() - startTime;
      
      Logger.success('createCustomToken', { uid }, timing);

      return FirebaseResponses.auth.tokenCreated({
        customToken,
        uid,
        additionalClaims,
        expiresIn: '1 hour'
      }, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('createCustomToken', error, { uid, timing });
      return FirebaseResponse.error(error, 'createCustomToken', { uid }, timing);
    }
  }

  async createUser(userProperties) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('createUser', { 
        email: userProperties.email,
        hasPassword: !!userProperties.password,
        emailVerified: userProperties.emailVerified 
      });
      
      const userRecord = await this.auth.createUser(userProperties);

      const timing = Date.now() - startTime;
      
      Logger.success('createUser', { 
        uid: userRecord.uid,
        email: userRecord.email 
      }, timing);

      const userData = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        emailVerified: userRecord.emailVerified,
        phoneNumber: userRecord.phoneNumber,
        disabled: userRecord.disabled,
        metadata: {
          createdAt: userRecord.metadata.creationTime,
          lastSignIn: userRecord.metadata.lastSignInTime,
          lastRefresh: userRecord.metadata.lastRefreshTime
        },
        customClaims: userRecord.customClaims || {},
        providerData: userRecord.providerData
      };

      return FirebaseResponses.auth.userCreated(userData, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('createUser', error, { 
        email: userProperties.email,
        timing 
      });
      return FirebaseResponse.error(error, 'createUser', { 
        email: userProperties.email 
      }, timing);
    }
  }

  async updateUser(uid, updateProperties) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('updateUser', { 
        uid,
        updateKeys: Object.keys(updateProperties) 
      });
      
      const userRecord = await this.auth.updateUser(uid, updateProperties);

      const timing = Date.now() - startTime;
      
      Logger.success('updateUser', { uid }, timing);

      const userData = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        emailVerified: userRecord.emailVerified,
        phoneNumber: userRecord.phoneNumber,
        disabled: userRecord.disabled,
        metadata: {
          createdAt: userRecord.metadata.creationTime,
          lastSignIn: userRecord.metadata.lastSignInTime,
          lastRefresh: userRecord.metadata.lastRefreshTime
        },
        customClaims: userRecord.customClaims || {},
        providerData: userRecord.providerData
      };

      return FirebaseResponse.success(userData, 'User updated successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('updateUser', error, { uid, timing });
      return FirebaseResponse.error(error, 'updateUser', { uid }, timing);
    }
  }

  async deleteUser(uid) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('deleteUser', { uid });
      
      await this.auth.deleteUser(uid);

      const timing = Date.now() - startTime;
      
      Logger.success('deleteUser', { uid }, timing);

      return FirebaseResponses.auth.userDeleted(uid, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('deleteUser', error, { uid, timing });
      return FirebaseResponse.error(error, 'deleteUser', { uid }, timing);
    }
  }

  async getUserByUid(uid) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('getUserByUid', { uid });
      
      const userRecord = await this.auth.getUser(uid);

      const timing = Date.now() - startTime;
      
      Logger.success('getUserByUid', { uid }, timing);

      const userData = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        emailVerified: userRecord.emailVerified,
        phoneNumber: userRecord.phoneNumber,
        disabled: userRecord.disabled,
        metadata: {
          createdAt: userRecord.metadata.creationTime,
          lastSignIn: userRecord.metadata.lastSignInTime,
          lastRefresh: userRecord.metadata.lastRefreshTime
        },
        customClaims: userRecord.customClaims || {},
        providerData: userRecord.providerData
      };

      return FirebaseResponse.success(userData, 'User retrieved successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      
      if (error.code === 'auth/user-not-found') {
        Logger.warn('User not found', { uid, timing });
        return FirebaseResponse.notFound('User', uid);
      }
      
      Logger.failure('getUserByUid', error, { uid, timing });
      return FirebaseResponse.error(error, 'getUserByUid', { uid }, timing);
    }
  }

  async getUserByEmail(email) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('getUserByEmail', { email });
      
      const userRecord = await this.auth.getUserByEmail(email);

      const timing = Date.now() - startTime;
      
      Logger.success('getUserByEmail', { email, uid: userRecord.uid }, timing);

      const userData = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        emailVerified: userRecord.emailVerified,
        phoneNumber: userRecord.phoneNumber,
        disabled: userRecord.disabled,
        metadata: {
          createdAt: userRecord.metadata.creationTime,
          lastSignIn: userRecord.metadata.lastSignInTime,
          lastRefresh: userRecord.metadata.lastRefreshTime
        },
        customClaims: userRecord.customClaims || {},
        providerData: userRecord.providerData
      };

      return FirebaseResponse.success(userData, 'User retrieved successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      
      if (error.code === 'auth/user-not-found') {
        Logger.warn('User not found', { email, timing });
        return FirebaseResponse.notFound('User', email);
      }
      
      Logger.failure('getUserByEmail', error, { email, timing });
      return FirebaseResponse.error(error, 'getUserByEmail', { email }, timing);
    }
  }

  async setCustomUserClaims(uid, customClaims) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('setCustomUserClaims', { 
        uid,
        claimsKeys: Object.keys(customClaims) 
      });
      
      await this.auth.setCustomUserClaims(uid, customClaims);

      const timing = Date.now() - startTime;
      
      Logger.success('setCustomUserClaims', { uid }, timing);

      return FirebaseResponse.success({
        uid,
        customClaims
      }, 'Custom claims set successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('setCustomUserClaims', error, { uid, timing });
      return FirebaseResponse.error(error, 'setCustomUserClaims', { uid }, timing);
    }
  }

  async listUsers(maxResults = 1000, pageToken = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('listUsers', { maxResults, hasPageToken: !!pageToken });
      
      const listUsersResult = await this.auth.listUsers(maxResults, pageToken);

      const timing = Date.now() - startTime;
      
      Logger.success('listUsers', { 
        userCount: listUsersResult.users.length,
        hasNextPage: !!listUsersResult.pageToken 
      }, timing);

      const users = listUsersResult.users.map(userRecord => ({
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        emailVerified: userRecord.emailVerified,
        phoneNumber: userRecord.phoneNumber,
        disabled: userRecord.disabled,
        metadata: {
          createdAt: userRecord.metadata.creationTime,
          lastSignIn: userRecord.metadata.lastSignInTime,
          lastRefresh: userRecord.metadata.lastRefreshTime
        },
        customClaims: userRecord.customClaims || {},
        providerData: userRecord.providerData
      }));

      return FirebaseResponse.success({
        users,
        pageToken: listUsersResult.pageToken,
        hasNextPage: !!listUsersResult.pageToken,
        totalReturned: users.length
      }, 'Users listed successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('listUsers', error, { maxResults, timing });
      return FirebaseResponse.error(error, 'listUsers', { maxResults }, timing);
    }
  }

  async revokeRefreshTokens(uid) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('revokeRefreshTokens', { uid });
      
      await this.auth.revokeRefreshTokens(uid);

      const timing = Date.now() - startTime;
      
      Logger.success('revokeRefreshTokens', { uid }, timing);

      return FirebaseResponse.success({
        uid,
        revoked: true,
        revokedAt: new Date().toISOString()
      }, 'Refresh tokens revoked successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('revokeRefreshTokens', error, { uid, timing });
      return FirebaseResponse.error(error, 'revokeRefreshTokens', { uid }, timing);
    }
  }

  async generatePasswordResetLink(email, actionCodeSettings = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('generatePasswordResetLink', { email });
      
      const link = await this.auth.generatePasswordResetLink(email, actionCodeSettings);

      const timing = Date.now() - startTime;
      
      Logger.success('generatePasswordResetLink', { email }, timing);

      return FirebaseResponse.success({
        email,
        resetLink: link,
        expiresIn: '1 hour'
      }, 'Password reset link generated successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('generatePasswordResetLink', error, { email, timing });
      return FirebaseResponse.error(error, 'generatePasswordResetLink', { email }, timing);
    }
  }

  async generateEmailVerificationLink(email, actionCodeSettings = null) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.auth('generateEmailVerificationLink', { email });
      
      const link = await this.auth.generateEmailVerificationLink(email, actionCodeSettings);

      const timing = Date.now() - startTime;
      
      Logger.success('generateEmailVerificationLink', { email }, timing);

      return FirebaseResponse.success({
        email,
        verificationLink: link,
        expiresIn: '1 hour'
      }, 'Email verification link generated successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('generateEmailVerificationLink', error, { email, timing });
      return FirebaseResponse.error(error, 'generateEmailVerificationLink', { email }, timing);
    }
  }
}

module.exports = new AuthService();
