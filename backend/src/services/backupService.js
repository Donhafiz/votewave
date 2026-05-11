const { logger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class BackupService {
  constructor() {
    this.backupPath = path.join(process.cwd(), 'backups');
    this.maxBackupSize = 100 * 1024 * 1024; // 100MB
    this.compressionLevel = 'gzip';
    this.encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  // Create backup directory
  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupPath, { recursive: true });
      logger.info('Backup directory ensured', { path: this.backupPath });
    } catch (error) {
      logger.error('Failed to create backup directory', { 
        error: error.message,
        path: this.backupPath 
      });
      throw error;
    }
  }

  // Generate backup filename
  generateBackupFilename(type, timestamp = new Date()) {
    const dateStr = timestamp.toISOString().split('T')[0].replace(/:/g, '-');
    return `${type}_backup_${dateStr}.json.gz`;
  }

  // Compress data
  async compressData(data) {
    const zlib = require('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(JSON.stringify(data), { level: 9 }, (err, compressed) => {
        if (err) {
          reject(err);
        } else {
          resolve(compressed);
        }
      });
    });
  }

  // Encrypt data
  encryptData(data) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32, 64);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      algorithm,
      key: key.toString('hex')
    };
  }

  // Decrypt data
  decryptData(encryptedData, iv, algorithm, key) {
    const decipher = crypto.createDecipher(algorithm, Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  // Create full backup
  async createFullBackup() {
    const timestamp = new Date();
    const filename = this.generateBackupFilename('full', timestamp);
    const filePath = path.join(this.backupPath, filename);

    try {
      logger.info('Starting full backup', { filename });

      // Get all collections data
      const collections = ['users', 'elections', 'candidates', 'votes', 'auditlogs'];
      const backupData = {};

      for (const collectionName of collections) {
        const Model = require(`../models/${collectionName.charAt(0).toUpperCase() + collectionName.slice(1)}`);
        const documents = await Model.find({});
        
        backupData[collectionName] = {
          count: documents.length,
          data: documents.map(doc => ({
            _id: doc._id,
            ...doc.toObject()
          })),
          timestamp: timestamp.toISOString()
        };
      }

      // Compress and encrypt
      const compressedData = await this.compressData(backupData);
      const encryptedData = this.encryptData(compressedData);

      // Write backup file
      await fs.writeFile(filePath, encryptedData.encrypted);
      
      // Write metadata
      const metadata = {
        type: 'full',
        timestamp: timestamp.toISOString(),
        collections: Object.keys(backupData),
        totalDocuments: Object.values(backupData).reduce((sum, coll) => sum + coll.count, 0),
        encrypted: true,
        compressed: true,
        algorithm: encryptedData.algorithm,
        iv: encryptedData.iv,
        key: encryptedData.key
      };

      const metadataPath = path.join(this.backupPath, filename.replace('.json.gz', '.meta.json'));
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      // Clean up old backups
      await this.cleanupOldBackups('full');

      logger.info('Full backup completed', {
        filename,
        size: encryptedData.encrypted.length,
        collections: Object.keys(backupData),
        totalDocuments: metadata.totalDocuments
      });

      return {
        success: true,
        filename,
        type: 'full',
        timestamp,
        size: encryptedData.encrypted.length,
        collections: Object.keys(backupData),
        totalDocuments: metadata.totalDocuments
      };

    } catch (error) {
      logger.error('Full backup failed', {
        error: error.message,
        filename
      });
      throw error;
    }
  }

  // Create incremental backup
  async createIncrementalBackup(lastBackupTime) {
    const timestamp = new Date();
    const filename = this.generateBackupFilename('incremental', timestamp);
    const filePath = path.join(this.backupPath, filename);

    try {
      logger.info('Starting incremental backup', { 
        filename,
        lastBackupTime: lastBackupTime.toISOString()
      });

      // Get changes since last backup
      const collections = ['users', 'elections', 'candidates', 'votes', 'auditlogs'];
      const backupData = {};

      for (const collectionName of collections) {
        const Model = require(`../models/${collectionName.charAt(0).toUpperCase() + collectionName.slice(1)}`);
        
        const query = {
          updatedAt: { $gt: lastBackupTime }
        };
        
        const documents = await Model.find(query);
        
        backupData[collectionName] = {
          count: documents.length,
          changes: documents.map(doc => ({
            _id: doc._id,
            ...doc.toObject(),
            operation: 'update',
            timestamp: doc.updatedAt
          })),
          timestamp: timestamp.toISOString()
        };
      }

      // Compress and encrypt
      const compressedData = await this.compressData(backupData);
      const encryptedData = this.encryptData(compressedData);

      // Write backup file
      await fs.writeFile(filePath, encryptedData.encrypted);
      
      // Write metadata
      const metadata = {
        type: 'incremental',
        timestamp: timestamp.toISOString(),
        collections: Object.keys(backupData),
        totalDocuments: Object.values(backupData).reduce((sum, coll) => sum + coll.changes.length, 0),
        baseBackup: lastBackupTime.toISOString(),
        encrypted: true,
        compressed: true,
        algorithm: encryptedData.algorithm,
        iv: encryptedData.iv,
        key: encryptedData.key
      };

      const metadataPath = path.join(this.backupPath, filename.replace('.json.gz', '.meta.json'));
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      // Clean up old backups
      await this.cleanupOldBackups('incremental');

      logger.info('Incremental backup completed', {
        filename,
        size: encryptedData.encrypted.length,
        collections: Object.keys(backupData),
        totalDocuments: metadata.totalDocuments
      });

      return {
        success: true,
        filename,
        type: 'incremental',
        timestamp,
        baseBackup: lastBackupTime.toISOString(),
        size: encryptedData.encrypted.length,
        collections: Object.keys(backupData),
        totalDocuments: metadata.totalDocuments
      };

    } catch (error) {
      logger.error('Incremental backup failed', {
        error: error.message,
        filename
      });
      throw error;
    }
  }

  // Restore from backup
  async restoreFromBackup(backupFilename) {
    const filePath = path.join(this.backupPath, backupFilename);
    const metadataPath = path.join(this.backupPath, backupFilename.replace('.json.gz', '.meta.json'));

    try {
      logger.info('Starting restore from backup', { backupFilename });

      // Read metadata
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      
      // Read backup data
      const encryptedData = await fs.readFile(filePath, 'utf8');
      
      // Decrypt data
      const decryptedData = this.decryptData(
        encryptedData,
        Buffer.from(metadata.iv, 'hex'),
        metadata.algorithm,
        Buffer.from(metadata.key, 'hex')
      );

      // Decompress data
      const zlib = require('zlib');
      const decompressed = new Promise((resolve, reject) => {
        zlib.gunzip(decryptedData.encrypted, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(JSON.parse(result.toString('utf8')));
          }
        });
      });

      const backupData = await decompressed;

      // Validate backup integrity
      const isValid = await this.validateBackupIntegrity(backupData, metadata);
      if (!isValid) {
        throw new Error('Backup integrity validation failed');
      }

      // Restore collections
      const collections = Object.keys(backupData.collections);
      for (const collectionName of collections) {
        const Model = require(`../models/${collectionName.charAt(0).toUpperCase() + collectionName.slice(1)}`);
        
        // Clear existing data for full restore
        if (metadata.type === 'full') {
          await Model.deleteMany({});
        }

        // Restore documents
        if (backupData.collections[collectionName].data) {
          await Model.insertMany(backupData.collections[collectionName].data);
        }

        // Restore changes for incremental
        if (backupData.collections[collectionName].changes) {
          for (const change of backupData.collections[collectionName].changes) {
            await Model.findByIdAndUpdate(change._id, {
              ...change,
              restoredAt: new Date()
            });
          }
        }

        logger.info(`Restored ${collectionName} collection`, {
          documents: backupData.collections[collectionName].data?.length || backupData.collections[collectionName].changes?.length || 0,
          type: metadata.type
        });
      }

      logger.info('Restore completed', {
        backupFilename,
        type: metadata.type,
        collections: Object.keys(backupData.collections),
        totalDocuments: metadata.totalDocuments
      });

      return {
        success: true,
        backupFilename,
        type: metadata.type,
        timestamp: metadata.timestamp,
        collections: Object.keys(backupData.collections),
        totalDocuments: metadata.totalDocuments
      };

    } catch (error) {
      logger.error('Restore failed', {
        error: error.message,
        backupFilename
      });
      throw error;
    }
  }

  // Validate backup integrity
  async validateBackupIntegrity(backupData, metadata) {
    try {
      // Check collection counts match
      const expectedCollections = Object.keys(backupData.collections);
      const actualCollections = Object.keys(backupData.collections);
      
      if (expectedCollections.length !== actualCollections.length) {
        return false;
      }

      // Check document counts match metadata
      const totalDocuments = Object.values(backupData.collections)
        .reduce((sum, coll) => sum + (coll.data?.length || coll.changes?.length || 0), 0);
      
      return totalDocuments === metadata.totalDocuments;
    } catch (error) {
      logger.error('Backup integrity validation failed', { error: error.message });
      return false;
    }
  }

  // Clean up old backups
  async cleanupOldBackups(type, maxBackups = 10) {
    try {
      const files = await fs.readdir(this.backupPath);
      const backupFiles = files.filter(file => 
        file.includes(`${type}_backup_`) && file.endsWith('.meta.json')
      );

      if (backupFiles.length > maxBackups) {
        backupFiles.sort().slice(0, -maxBackups + 1).forEach(async (file) => {
          const filePath = path.join(this.backupPath, file);
          const stats = await fs.stat(filePath);
          
          if (stats.isFile()) {
            const age = Date.now() - stats.mtime.getTime();
            const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            
            if (age > maxAge) {
              await fs.unlink(filePath);
              logger.info('Deleted old backup', { file, age: `${Math.round(age / (24 * 60 * 60 * 1000))} days` });
            }
          }
        });
      }

      logger.info('Backup cleanup completed', {
        type,
        totalBackups: backupFiles.length,
        deleted: Math.max(0, backupFiles.length - maxBackups)
      });

    } catch (error) {
      logger.error('Backup cleanup failed', { error: error.message });
    }
  }

  // Get backup list
  async getBackupList() {
    try {
      const files = await fs.readdir(this.backupPath);
      const backupList = [];

      for (const file of files) {
        if (file.endsWith('.meta.json')) {
          const filePath = path.join(this.backupPath, file);
          const metadata = JSON.parse(await fs.readFile(filePath, 'utf8'));
          const dataFilePath = file.replace('.meta.json', '.json.gz');
          const stats = await fs.stat(dataFilePath);

          backupList.push({
            filename: file,
            type: metadata.type,
            timestamp: metadata.timestamp,
            size: stats.size,
            collections: metadata.collections,
            totalDocuments: metadata.totalDocuments,
            createdAt: stats.birthtime.toISOString()
          });
        }
      }

      return backupList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      logger.error('Failed to get backup list', { error: error.message });
      throw error;
    }
  }

  // Schedule automatic backups
  async scheduleAutoBackup(interval = 'daily') {
    const intervals = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000
    };

    const backupInterval = intervals[interval] || intervals.daily;
    
    const performBackup = async () => {
      try {
        const lastBackup = await this.getLastBackupTime();
        await this.createIncrementalBackup(lastBackup);
      } catch (error) {
        logger.error('Automatic backup failed', { error: error.message });
      }
    };

    // Perform initial backup
    await performBackup();
    
    // Schedule recurring backups
    setInterval(performBackup, backupInterval);
    
    logger.info(`Automatic ${interval} backups scheduled`, {
      interval: backupInterval
    });
  }

  // Get last backup time
  async getLastBackupTime() {
    try {
      const files = await fs.readdir(this.backupPath);
      const backupFiles = files.filter(file => file.endsWith('.meta.json'));
      
      if (backupFiles.length === 0) {
        return new Date(0); // No backups exist
      }

      backupFiles.sort();
      const latestBackup = backupFiles[backupFiles.length - 1];
      const metadataPath = path.join(this.backupPath, latestBackup);
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      
      return new Date(metadata.timestamp);
    } catch (error) {
      logger.error('Failed to get last backup time', { error: error.message });
      return new Date(0);
    }
  }
}

module.exports = BackupService;
