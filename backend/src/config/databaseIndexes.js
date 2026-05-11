const { logger } = require('../utils/logger');

class DatabaseIndexOptimizer {
  constructor() {
    this.indexes = {
      // User collection indexes
      users: [
        {
          name: 'email_unique',
          collection: 'users',
          keys: { email: 1 },
          options: { unique: true, sparse: true },
          description: 'Unique email index for authentication'
        },
        {
          name: 'tenantId_index',
          collection: 'users',
          keys: { tenantId: 1 },
          options: { sparse: true },
          description: 'Tenant-based user queries'
        },
        {
          name: 'role_index',
          collection: 'users',
          keys: { role: 1 },
          options: { sparse: true },
          description: 'Role-based filtering'
        },
        {
          name: 'status_created_index',
          collection: 'users',
          keys: { status: 1, createdAt: -1 },
          options: { sparse: true },
          description: 'User status and creation queries'
        },
        {
          name: 'lastActivity_index',
          collection: 'users',
          keys: { lastActivity: -1 },
          options: { sparse: true },
          description: 'Recent activity queries'
        }
      ],
      
      // Election collection indexes
      elections: [
        {
          name: 'tenantId_status_index',
          collection: 'elections',
          keys: { tenantId: 1, status: 1 },
          options: { sparse: true },
          description: 'Tenant election filtering'
        },
        {
          name: 'startDate_endDate_index',
          collection: 'elections',
          keys: { startDate: 1, endDate: 1 },
          options: { sparse: true },
          description: 'Date range queries'
        },
        {
          name: 'title_text_index',
          collection: 'elections',
          keys: { title: 'text', description: 'text' },
          options: { sparse: true },
          description: 'Full-text search'
        },
        {
          name: 'createdBy_index',
          collection: 'elections',
          keys: { createdBy: 1 },
          options: { sparse: true },
          description: 'Admin election queries'
        }
      ],
      
      // Candidate collection indexes
      candidates: [
        {
          name: 'electionId_name_index',
          collection: 'candidates',
          keys: { electionId: 1, name: 1 },
          options: { unique: true, sparse: true },
          description: 'Unique candidate names per election'
        },
        {
          name: 'electionId_votes_index',
          collection: 'candidates',
          keys: { electionId: 1, votes: -1 },
          options: { sparse: true },
          description: 'Candidate ranking queries'
        }
      ],
      
      // Vote collection indexes
      votes: [
        {
          name: 'electionId_voterId_index',
          collection: 'votes',
          keys: { electionId: 1, voterId: 1 },
          options: { unique: true, sparse: true },
          description: 'Prevent duplicate votes'
        },
        {
          name: 'electionId_candidateId_index',
          collection: 'votes',
          keys: { electionId: 1, candidateId: 1 },
          options: { sparse: true },
          description: 'Vote counting queries'
        },
        {
          name: 'timestamp_index',
          collection: 'votes',
          keys: { timestamp: -1 },
          options: { sparse: true },
          description: 'Time-based vote queries'
        },
        {
          name: 'hash_index',
          collection: 'votes',
          keys: { hash: 1 },
          options: { unique: true, sparse: true },
          description: 'Vote integrity verification'
        }
      ],
      
      // Audit log collection indexes
      auditLogs: [
        {
          name: 'userId_timestamp_index',
          collection: 'auditlogs',
          keys: { userId: 1, timestamp: -1 },
          options: { sparse: true },
          description: 'User activity queries'
        },
        {
          name: 'action_timestamp_index',
          collection: 'auditlogs',
          keys: { action: 1, timestamp: -1 },
          options: { sparse: true },
          description: 'Action-based queries'
        },
        {
          name: 'ip_timestamp_index',
          collection: 'auditlogs',
          keys: { ip: 1, timestamp: -1 },
          options: { sparse: true },
          description: 'Security monitoring queries'
        }
      ]
    };
  }

  // Create all indexes
  async createIndexes(db) {
    const results = [];
    
    for (const [collectionName, indexes] of Object.entries(this.indexes)) {
      for (const index of indexes) {
        try {
          const collection = db.collection(collectionName);
          
          // Check if index already exists
          const existingIndexes = await collection.indexInformation();
          const indexExists = existingIndexes.some(existingIndex => 
            existingIndex.name === index.name
          );
          
          if (indexExists) {
            logger.info(`Index already exists: ${index.name}`, {
              collection: collectionName,
              index: index.name
            });
            continue;
          }
          
          // Create index
          await collection.createIndex(index.keys, index.options);
          results.push({
            collection: collectionName,
            index: index.name,
            keys: index.keys,
            options: index.options,
            status: 'created'
          });
          
          logger.info(`Index created: ${index.name}`, {
            collection: collectionName,
            index: index.name,
            keys: index.keys,
            description: index.description
          });
          
        } catch (error) {
          logger.error(`Failed to create index: ${index.name}`, {
            collection: collectionName,
            index: index.name,
            error: error.message
          });
          
          results.push({
            collection: collectionName,
            index: index.name,
            keys: index.keys,
            options: index.options,
            status: 'failed',
            error: error.message
          });
        }
      }
    }
    
    return results;
  }

  // Analyze query performance
  async analyzeQueryPerformance(db, query, executionTime) {
    const slowQueryThreshold = 1000; // 1 second
    
    if (executionTime > slowQueryThreshold) {
      logger.warn('Slow query detected', {
        query: query.toString(),
        executionTime: `${executionTime}ms`,
        threshold: `${slowQueryThreshold}ms`,
        collection: query.collection.collectionName
      });
      
      // Suggest missing indexes
      const suggestedIndexes = this.suggestIndexes(query);
      if (suggestedIndexes.length > 0) {
        logger.info('Suggested indexes for slow query', {
          query: query.toString(),
          suggestedIndexes,
          executionTime: `${executionTime}ms`
        });
      }
    }
  }

  // Suggest indexes based on query patterns
  suggestIndexes(query) {
    const suggestions = [];
    const filter = query.getFilter() || {};
    const sort = query.getSort() || {};
    
    // Analyze filter fields
    for (const field of Object.keys(filter)) {
      if (this.shouldIndexField(field)) {
        suggestions.push({
          type: 'filter',
          field,
          reason: 'Frequently filtered field'
        });
      }
    }
    
    // Analyze sort fields
    for (const field of Object.keys(sort)) {
      if (this.shouldIndexField(field)) {
        suggestions.push({
          type: 'sort',
          field,
          reason: 'Frequently sorted field'
        });
      }
    }
    
    return suggestions;
  }

  // Check if field should be indexed
  shouldIndexField(field) {
    const indexableFields = [
      'email', 'tenantId', 'role', 'status', 'createdAt', 'lastActivity',
      'electionId', 'candidateId', 'voterId', 'timestamp', 'hash',
      'action', 'userId', 'ip'
    ];
    
    return indexableFields.includes(field);
  }

  // Get index statistics
  async getIndexStats(db) {
    const stats = {};
    
    for (const collectionName of Object.keys(this.indexes)) {
      try {
        const collection = db.collection(collectionName);
        const indexInfo = await collection.indexInformation();
        
        stats[collectionName] = {
          indexes: indexInfo.length,
          totalSize: indexInfo.reduce((total, index) => total + (index.size || 0), 0),
          indexes: indexInfo.map(index => ({
            name: index.name,
            size: index.size,
            unique: !!index.unique,
            sparse: !!index.sparse
          }))
        };
      } catch (error) {
        logger.error(`Failed to get index stats for ${collectionName}`, {
          error: error.message
        });
        
        stats[collectionName] = {
          error: error.message,
          indexes: 0
        };
      }
    }
    
    return stats;
  }

  // Optimize existing indexes
  async optimizeIndexes(db) {
    const results = [];
    
    for (const collectionName of Object.keys(this.indexes)) {
      try {
        const collection = db.collection(collectionName);
        
        // Rebuild indexes for better performance
        await collection.reIndex();
        
        results.push({
          collection: collectionName,
          operation: 'reindex',
          status: 'completed'
        });
        
        logger.info(`Indexes optimized for ${collectionName}`);
      } catch (error) {
        logger.error(`Failed to optimize indexes for ${collectionName}`, {
          error: error.message
        });
        
        results.push({
          collection: collectionName,
          operation: 'reindex',
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return results;
  }
}

module.exports = DatabaseIndexOptimizer;
