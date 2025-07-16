const { getStorage } = require('../config/firebase-admin');
const Logger = require('../utils/firebase-logger');
const { FirebaseResponse, FirebaseResponses } = require('../utils/firebase-response');
const fs = require('fs');
const path = require('path');

class StorageService {
  constructor() {
    this.bucket = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;
    
    try {
      this.bucket = getStorage().bucket();
      this.initialized = true;
      Logger.info('Firebase Storage service initialized', { 
        bucketName: this.bucket.name 
      });
    } catch (error) {
      Logger.error('Failed to initialize Storage service', { error: error.message });
      throw error;
    }
  }

  async uploadFile(localPath, remotePath, options = {}) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      if (!fs.existsSync(localPath)) {
        return FirebaseResponse.notFound('Local file', localPath);
      }

      const stats = fs.statSync(localPath);
      const fileSizeBytes = stats.size;
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
      
      Logger.storage('upload', remotePath, { 
        localPath, 
        fileSize: `${fileSizeMB}MB`,
        options 
      });
      
      const file = this.bucket.file(remotePath);
      
      const uploadOptions = {
        metadata: {
          ...options.metadata,
          originalName: path.basename(localPath),
          uploadedAt: new Date().toISOString(),
          contentType: options.contentType || this.getContentType(localPath)
        },
        resumable: options.resumable !== false,
        validation: options.validation !== false,
        ...options
      };

      delete uploadOptions.contentType;

      await this.bucket.upload(localPath, {
        destination: remotePath,
        ...uploadOptions
      });

      const timing = Date.now() - startTime;
      const uploadSpeed = (fileSizeBytes / 1024 / 1024 / (timing / 1000)).toFixed(2);
      
      const [metadata] = await file.getMetadata();
      
      Logger.success('uploadFile', { 
        remotePath,
        fileSize: `${fileSizeMB}MB`,
        uploadSpeed: `${uploadSpeed}MB/s`
      }, timing);

      const fileInfo = {
        remotePath,
        localPath,
        size: fileSizeBytes,
        sizeMB: `${fileSizeMB}MB`,
        uploadSpeed: `${uploadSpeed}MB/s`,
        contentType: metadata.contentType,
        etag: metadata.etag,
        generation: metadata.generation,
        timeCreated: metadata.timeCreated,
        updated: metadata.updated,
        downloadUrl: await this.getDownloadUrl(remotePath)
      };

      return FirebaseResponses.storage.uploaded(fileInfo, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('uploadFile', error, { localPath, remotePath, timing });
      return FirebaseResponse.error(error, 'uploadFile', { localPath, remotePath }, timing);
    }
  }

  async uploadBuffer(buffer, remotePath, options = {}) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      const fileSizeBytes = buffer.length;
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
      
      Logger.storage('uploadBuffer', remotePath, { 
        fileSize: `${fileSizeMB}MB`,
        options 
      });
      
      const file = this.bucket.file(remotePath);
      
      const uploadOptions = {
        metadata: {
          ...options.metadata,
          uploadedAt: new Date().toISOString(),
          contentType: options.contentType || 'application/octet-stream'
        },
        resumable: options.resumable !== false,
        validation: options.validation !== false
      };

      const stream = file.createWriteStream(uploadOptions);
      
      return new Promise((resolve, reject) => {
        stream.on('error', (error) => {
          const timing = Date.now() - startTime;
          Logger.failure('uploadBuffer', error, { remotePath, timing });
          reject(FirebaseResponse.error(error, 'uploadBuffer', { remotePath }, timing));
        });

        stream.on('finish', async () => {
          try {
            const timing = Date.now() - startTime;
            const uploadSpeed = (fileSizeBytes / 1024 / 1024 / (timing / 1000)).toFixed(2);
            
            const [metadata] = await file.getMetadata();
            
            Logger.success('uploadBuffer', { 
              remotePath,
              fileSize: `${fileSizeMB}MB`,
              uploadSpeed: `${uploadSpeed}MB/s`
            }, timing);

            const fileInfo = {
              remotePath,
              size: fileSizeBytes,
              sizeMB: `${fileSizeMB}MB`,
              uploadSpeed: `${uploadSpeed}MB/s`,
              contentType: metadata.contentType,
              etag: metadata.etag,
              generation: metadata.generation,
              timeCreated: metadata.timeCreated,
              updated: metadata.updated
            };

            resolve(FirebaseResponses.storage.uploaded(fileInfo, timing));
            
          } catch (metadataError) {
            const timing = Date.now() - startTime;
            Logger.failure('uploadBuffer', metadataError, { remotePath, timing });
            reject(FirebaseResponse.error(metadataError, 'uploadBuffer', { remotePath }, timing));
          }
        });

        stream.end(buffer);
      });
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('uploadBuffer', error, { remotePath, timing });
      return FirebaseResponse.error(error, 'uploadBuffer', { remotePath }, timing);
    }
  }

  async downloadFile(remotePath, localPath) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.storage('download', remotePath, { localPath });
      
      const file = this.bucket.file(remotePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        const timing = Date.now() - startTime;
        return FirebaseResponses.storage.notFound(remotePath);
      }

      const [metadata] = await file.getMetadata();
      const fileSizeBytes = parseInt(metadata.size);
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      await file.download({ destination: localPath });

      const timing = Date.now() - startTime;
      const downloadSpeed = (fileSizeBytes / 1024 / 1024 / (timing / 1000)).toFixed(2);
      
      Logger.success('downloadFile', { 
        remotePath,
        localPath,
        fileSize: `${fileSizeMB}MB`,
        downloadSpeed: `${downloadSpeed}MB/s`
      }, timing);

      const fileInfo = {
        remotePath,
        localPath,
        size: fileSizeBytes,
        sizeMB: `${fileSizeMB}MB`,
        downloadSpeed: `${downloadSpeed}MB/s`,
        contentType: metadata.contentType,
        etag: metadata.etag,
        timeCreated: metadata.timeCreated,
        updated: metadata.updated
      };

      return FirebaseResponses.storage.downloaded(fileInfo, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('downloadFile', error, { remotePath, localPath, timing });
      return FirebaseResponse.error(error, 'downloadFile', { remotePath, localPath }, timing);
    }
  }

  async downloadBuffer(remotePath) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.storage('downloadBuffer', remotePath);
      
      const file = this.bucket.file(remotePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        return FirebaseResponses.storage.notFound(remotePath);
      }

      const [buffer] = await file.download();
      const [metadata] = await file.getMetadata();

      const timing = Date.now() - startTime;
      const fileSizeBytes = buffer.length;
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
      const downloadSpeed = (fileSizeBytes / 1024 / 1024 / (timing / 1000)).toFixed(2);
      
      Logger.success('downloadBuffer', { 
        remotePath,
        fileSize: `${fileSizeMB}MB`,
        downloadSpeed: `${downloadSpeed}MB/s`
      }, timing);

      return FirebaseResponse.success({
        remotePath,
        buffer,
        size: fileSizeBytes,
        sizeMB: `${fileSizeMB}MB`,
        downloadSpeed: `${downloadSpeed}MB/s`,
        contentType: metadata.contentType,
        metadata
      }, 'File downloaded as buffer successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('downloadBuffer', error, { remotePath, timing });
      return FirebaseResponse.error(error, 'downloadBuffer', { remotePath }, timing);
    }
  }

  async deleteFile(remotePath) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.storage('delete', remotePath);
      
      const file = this.bucket.file(remotePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        return FirebaseResponses.storage.notFound(remotePath);
      }

      await file.delete();

      const timing = Date.now() - startTime;
      
      Logger.success('deleteFile', { remotePath }, timing);

      return FirebaseResponses.storage.deleted(remotePath, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('deleteFile', error, { remotePath, timing });
      return FirebaseResponse.error(error, 'deleteFile', { remotePath }, timing);
    }
  }

  async getFileMetadata(remotePath) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.storage('getMetadata', remotePath);
      
      const file = this.bucket.file(remotePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        return FirebaseResponses.storage.notFound(remotePath);
      }

      const [metadata] = await file.getMetadata();

      const timing = Date.now() - startTime;
      
      Logger.success('getFileMetadata', { remotePath }, timing);

      const fileInfo = {
        remotePath,
        name: metadata.name,
        size: parseInt(metadata.size),
        sizeMB: (parseInt(metadata.size) / (1024 * 1024)).toFixed(2) + 'MB',
        contentType: metadata.contentType,
        etag: metadata.etag,
        generation: metadata.generation,
        timeCreated: metadata.timeCreated,
        updated: metadata.updated,
        md5Hash: metadata.md5Hash,
        crc32c: metadata.crc32c,
        storageClass: metadata.storageClass,
        customMetadata: metadata.metadata || {}
      };

      return FirebaseResponses.storage.metadata(fileInfo, timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('getFileMetadata', error, { remotePath, timing });
      return FirebaseResponse.error(error, 'getFileMetadata', { remotePath }, timing);
    }
  }

  async getDownloadUrl(remotePath, expiresIn = 3600000) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.storage('getDownloadUrl', remotePath, { expiresIn });
      
      const file = this.bucket.file(remotePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        return FirebaseResponses.storage.notFound(remotePath);
      }

      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn
      });

      const timing = Date.now() - startTime;
      
      Logger.success('getDownloadUrl', { remotePath }, timing);

      return FirebaseResponse.success({
        remotePath,
        downloadUrl: url,
        expiresAt: new Date(Date.now() + expiresIn).toISOString(),
        expiresIn: `${expiresIn / 1000}s`
      }, 'Download URL generated successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('getDownloadUrl', error, { remotePath, timing });
      return FirebaseResponse.error(error, 'getDownloadUrl', { remotePath }, timing);
    }
  }

  async listFiles(prefix = '', options = {}) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.storage('listFiles', prefix, { options });
      
      const listOptions = {
        prefix,
        maxResults: options.maxResults || 1000,
        ...options
      };

      const [files] = await this.bucket.getFiles(listOptions);

      const timing = Date.now() - startTime;
      
      const fileList = files.map(file => ({
        name: file.name,
        size: file.metadata.size ? parseInt(file.metadata.size) : 0,
        sizeMB: file.metadata.size ? (parseInt(file.metadata.size) / (1024 * 1024)).toFixed(2) + 'MB' : '0MB',
        contentType: file.metadata.contentType,
        timeCreated: file.metadata.timeCreated,
        updated: file.metadata.updated,
        generation: file.metadata.generation,
        etag: file.metadata.etag
      }));
      
      Logger.success('listFiles', { 
        prefix,
        fileCount: fileList.length 
      }, timing);

      return FirebaseResponse.success({
        prefix,
        files: fileList,
        count: fileList.length,
        totalSize: fileList.reduce((sum, file) => sum + file.size, 0),
        totalSizeMB: (fileList.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(2) + 'MB'
      }, 'Files listed successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('listFiles', error, { prefix, timing });
      return FirebaseResponse.error(error, 'listFiles', { prefix }, timing);
    }
  }

  async updateMetadata(remotePath, metadata) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.storage('updateMetadata', remotePath, { 
        metadataKeys: Object.keys(metadata) 
      });
      
      const file = this.bucket.file(remotePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        return FirebaseResponses.storage.notFound(remotePath);
      }

      await file.setMetadata(metadata);
      const [updatedMetadata] = await file.getMetadata();

      const timing = Date.now() - startTime;
      
      Logger.success('updateMetadata', { remotePath }, timing);

      return FirebaseResponse.success({
        remotePath,
        updatedMetadata,
        updatedFields: Object.keys(metadata)
      }, 'File metadata updated successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('updateMetadata', error, { remotePath, timing });
      return FirebaseResponse.error(error, 'updateMetadata', { remotePath }, timing);
    }
  }

  async copyFile(sourcePath, destinationPath) {
    const startTime = Date.now();
    
    try {
      this.initialize();
      
      Logger.storage('copyFile', sourcePath, { destinationPath });
      
      const sourceFile = this.bucket.file(sourcePath);
      const destinationFile = this.bucket.file(destinationPath);
      
      const [exists] = await sourceFile.exists();
      if (!exists) {
        return FirebaseResponses.storage.notFound(sourcePath);
      }

      await sourceFile.copy(destinationFile);

      const timing = Date.now() - startTime;
      
      Logger.success('copyFile', { sourcePath, destinationPath }, timing);

      return FirebaseResponse.success({
        sourcePath,
        destinationPath,
        copied: true
      }, 'File copied successfully', timing);
      
    } catch (error) {
      const timing = Date.now() - startTime;
      Logger.failure('copyFile', error, { sourcePath, destinationPath, timing });
      return FirebaseResponse.error(error, 'copyFile', { sourcePath, destinationPath }, timing);
    }
  }

  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }
}

module.exports = new StorageService();
