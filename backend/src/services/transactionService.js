const { logger } = require('../utils/logger');
const { metricsCollector } = require('../utils/monitoring');

class TransactionService {
  constructor() {
    this.activeTransactions = new Map();
    this.transactionQueue = [];
    this.maxConcurrentTransactions = 100;
  }

  // Start a new transaction
  async beginTransaction(transactionId, context = {}) {
    const txId = transactionId || this.generateTransactionId();
    
    // Check concurrent transaction limit
    if (this.activeTransactions.size >= this.maxConcurrentTransactions) {
      throw new Error('Maximum concurrent transactions exceeded');
    }

    const transaction = {
      id: txId,
      status: 'active',
      startTime: Date.now(),
      context,
      operations: [],
      locks: new Set()
    };

    this.activeTransactions.set(txId, transaction);
    
    logger.info('Transaction started', {
      transactionId: txId,
      context,
      activeTransactions: this.activeTransactions.size
    });

    return txId;
  }

  // Add operation to transaction
  async addOperation(transactionId, operation) {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    // Validate operation
    this.validateOperation(operation);
    
    transaction.operations.push({
      ...operation,
      timestamp: Date.now(),
      status: 'pending'
    });

    logger.debug('Operation added to transaction', {
      transactionId,
      operationType: operation.type,
      operationId: operation.id
    });

    return operation.id || this.generateOperationId();
  }

  // Execute operation within transaction
  async executeOperation(transactionId, operationId, executeFunction) {
    const transaction = this.activeTransactions.get(transactionId);
    const operation = transaction.operations.find(op => op.id === operationId);
    
    if (!operation) {
      throw new Error(`Operation ${operationId} not found in transaction ${transactionId}`);
    }

    if (operation.status !== 'pending') {
      throw new Error(`Operation ${operationId} already executed`);
    }

    try {
      operation.status = 'executing';
      operation.startTime = Date.now();
      
      const result = await executeFunction(operation.data);
      
      operation.status = 'completed';
      operation.endTime = Date.now();
      operation.result = result;
      operation.duration = operation.endTime - operation.startTime;
      
      logger.info('Operation executed successfully', {
        transactionId,
        operationId,
        duration: operation.duration,
        result: typeof result === 'object' ? 'success' : result
      });
      
      return result;
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = Date.now();
      operation.error = error.message;
      operation.duration = operation.endTime - operation.startTime;
      
      logger.error('Operation failed', {
        transactionId,
        operationId,
        error: error.message,
        duration: operation.duration
      });
      
      throw error;
    }
  }

  // Commit transaction
  async commitTransaction(transactionId, commitData = {}) {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    try {
      // Validate all operations completed
      const failedOperations = transaction.operations.filter(op => op.status === 'failed');
      if (failedOperations.length > 0) {
        throw new Error(`Transaction has ${failedOperations.length} failed operations`);
      }

      const pendingOperations = transaction.operations.filter(op => op.status === 'pending');
      if (pendingOperations.length > 0) {
        throw new Error(`Transaction has ${pendingOperations.length} pending operations`);
      }

      // Execute commit operations
      const commitResults = [];
      for (const operation of transaction.operations) {
        if (operation.status === 'completed') {
          const result = await this.executeCommitOperation(operation, commitData);
          commitResults.push(result);
        }
      }

      // Update transaction status
      transaction.status = 'committed';
      transaction.endTime = Date.now();
      transaction.duration = transaction.endTime - transaction.startTime;
      transaction.commitData = commitData;

      // Remove from active transactions
      this.activeTransactions.delete(transactionId);

      logger.info('Transaction committed successfully', {
        transactionId,
        operationCount: transaction.operations.length,
        duration: transaction.duration,
        commitResults: commitResults.length
      });

      return commitResults;
    } catch (error) {
      transaction.status = 'failed';
      transaction.endTime = Date.now();
      transaction.error = error.message;
      transaction.duration = transaction.endTime - transaction.startTime;

      logger.error('Transaction commit failed', {
        transactionId,
        error: error.message,
        duration: transaction.duration
      });

      // Remove from active transactions
      this.activeTransactions.delete(transactionId);

      throw error;
    }
  }

  // Rollback transaction
  async rollbackTransaction(transactionId, rollbackData = {}) {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status === 'committed') {
      throw new Error(`Transaction ${transactionId} already committed`);
    }

    try {
      // Execute rollback operations
      const rollbackResults = [];
      for (const operation of transaction.operations) {
        if (operation.status === 'completed') {
          const result = await this.executeRollbackOperation(operation, rollbackData);
          rollbackResults.push(result);
        }
      }

      // Update transaction status
      transaction.status = 'rolled_back';
      transaction.endTime = Date.now();
      transaction.duration = transaction.endTime - transaction.startTime;
      transaction.rollbackData = rollbackData;

      // Remove from active transactions
      this.activeTransactions.delete(transactionId);

      logger.warn('Transaction rolled back', {
        transactionId,
        operationCount: transaction.operations.length,
        duration: transaction.duration,
        rollbackResults: rollbackResults.length
      });

      return rollbackResults;
    } catch (error) {
      transaction.status = 'failed';
      transaction.endTime = Date.now();
      transaction.error = error.message;
      transaction.duration = transaction.endTime - transaction.startTime;

      logger.error('Transaction rollback failed', {
        transactionId,
        error: error.message,
        duration: transaction.duration
      });

      // Remove from active transactions
      this.activeTransactions.delete(transactionId);

      throw error;
    }
  }

  // Execute commit operation
  async executeCommitOperation(operation, commitData) {
    const startTime = Date.now();
    
    switch (operation.type) {
      case 'vote':
        return await this.commitVote(operation.data, commitData);
      case 'update_election':
        return await this.commitElectionUpdate(operation.data, commitData);
      case 'create_candidate':
        return await this.commitCandidateCreation(operation.data, commitData);
      case 'update_user':
        return await this.commitUserUpdate(operation.data, commitData);
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  // Execute rollback operation
  async executeRollbackOperation(operation, rollbackData) {
    const startTime = Date.now();
    
    switch (operation.type) {
      case 'vote':
        return await this.rollbackVote(operation.data, rollbackData);
      case 'update_election':
        return await this.rollbackElectionUpdate(operation.data, rollbackData);
      case 'create_candidate':
        return await this.rollbackCandidateCreation(operation.data, rollbackData);
      case 'update_user':
        return await this.rollbackUserUpdate(operation.data, rollbackData);
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  // Vote operations
  async commitVote(voteData, commitData) {
    const Vote = require('../models/Vote');
    
    const vote = new Vote({
      ...voteData,
      transactionId: commitData.transactionId,
      committedAt: new Date(),
      status: 'committed'
    });

    await vote.save();
    
    logger.info('Vote committed', {
      transactionId: commitData.transactionId,
      voteId: vote._id,
      electionId: voteData.electionId,
      voterId: voteData.voterId
    });

    return { success: true, voteId: vote._id };
  }

  async rollbackVote(voteData, rollbackData) {
    const Vote = require('../models/Vote');
    
    // Find and delete the vote
    const vote = await Vote.findOne({
      transactionId: rollbackData.transactionId,
      electionId: voteData.electionId,
      voterId: voteData.voterId
    });

    if (vote) {
      await Vote.findByIdAndDelete(vote._id);
    }

    logger.warn('Vote rolled back', {
      transactionId: rollbackData.transactionId,
      voteId: vote?._id,
      electionId: voteData.electionId,
      voterId: voteData.voterId
    });

    return { success: true, rolledBackVoteId: vote?._id };
  }

  // Election operations
  async commitElectionUpdate(electionData, commitData) {
    const Election = require('../models/Election');
    
    const election = await Election.findByIdAndUpdate(
      electionData.electionId,
      {
        ...electionData.updates,
        transactionId: commitData.transactionId,
        updatedAt: new Date()
      }
    );

    logger.info('Election update committed', {
      transactionId: commitData.transactionId,
      electionId: electionData.electionId,
      updates: Object.keys(electionData.updates)
    });

    return { success: true, electionId: election._id };
  }

  async rollbackElectionUpdate(electionData, rollbackData) {
    const Election = require('../models/Election');
    
    // Restore previous election state
    const election = await Election.findById(electionData.electionId);
    if (election && election.previousState) {
      await Election.findByIdAndUpdate(electionData.electionId, {
        ...election.previousState,
        transactionId: rollbackData.transactionId,
        updatedAt: new Date()
      });
    }

    logger.warn('Election update rolled back', {
      transactionId: rollbackData.transactionId,
      electionId: electionData.electionId
    });

    return { success: true, restoredElectionId: electionData.electionId };
  }

  // Candidate operations
  async commitCandidateCreation(candidateData, commitData) {
    const Candidate = require('../models/Candidate');
    
    const candidate = new Candidate({
      ...candidateData,
      transactionId: commitData.transactionId,
      createdAt: new Date(),
      status: 'active'
    });

    await candidate.save();
    
    logger.info('Candidate creation committed', {
      transactionId: commitData.transactionId,
      candidateId: candidate._id,
      electionId: candidateData.electionId
    });

    return { success: true, candidateId: candidate._id };
  }

  async rollbackCandidateCreation(candidateData, rollbackData) {
    const Candidate = require('../models/Candidate');
    
    // Find and delete the candidate
    const candidate = await Candidate.findOne({
      transactionId: rollbackData.transactionId,
      electionId: candidateData.electionId
    });

    if (candidate) {
      await Candidate.findByIdAndDelete(candidate._id);
    }

    logger.warn('Candidate creation rolled back', {
      transactionId: rollbackData.transactionId,
      candidateId: candidate?._id,
      electionId: candidateData.electionId
    });

    return { success: true, rolledBackCandidateId: candidate?._id };
  }

  // User operations
  async commitUserUpdate(userData, commitData) {
    const User = require('../models/User');
    
    const user = await User.findByIdAndUpdate(
      userData.userId,
      {
        ...userData.updates,
        transactionId: commitData.transactionId,
        updatedAt: new Date()
      }
    );

    logger.info('User update committed', {
      transactionId: commitData.transactionId,
      userId: userData.userId,
      updates: Object.keys(userData.updates)
    });

    return { success: true, userId: userData.userId };
  }

  async rollbackUserUpdate(userData, rollbackData) {
    const User = require('../models/User');
    
    // Restore previous user state
    const user = await User.findById(userData.userId);
    if (user && user.previousState) {
      await User.findByIdAndUpdate(userData.userId, {
        ...user.previousState,
        transactionId: rollbackData.transactionId,
        updatedAt: new Date()
      });
    }

    logger.warn('User update rolled back', {
      transactionId: rollbackData.transactionId,
      userId: userData.userId
    });

    return { success: true, restoredUserId: userData.userId };
  }

  // Validate operation
  validateOperation(operation) {
    if (!operation.type) {
      throw new Error('Operation type is required');
    }

    if (!operation.data) {
      throw new Error('Operation data is required');
    }

    const validTypes = ['vote', 'update_election', 'create_candidate', 'update_user'];
    if (!validTypes.includes(operation.type)) {
      throw new Error(`Invalid operation type: ${operation.type}`);
    }
  }

  // Generate transaction ID
  generateTransactionId() {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Generate operation ID
  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get transaction status
  getTransactionStatus(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      return { status: 'not_found', message: 'Transaction not found' };
    }

    return {
      transactionId,
      status: transaction.status,
      startTime: transaction.startTime,
      duration: Date.now() - transaction.startTime,
      operationCount: transaction.operations.length,
      completedOperations: transaction.operations.filter(op => op.status === 'completed').length,
      failedOperations: transaction.operations.filter(op => op.status === 'failed').length,
      pendingOperations: transaction.operations.filter(op => op.status === 'pending').length
    };
  }

  // Clean up old transactions
  cleanupTransactions() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [transactionId, transaction] of this.activeTransactions) {
      const age = now - transaction.startTime;
      if (age > maxAge) {
        this.activeTransactions.delete(transactionId);
        
        logger.warn('Transaction cleaned up due to age', {
          transactionId,
          age: `${Math.round(age / 1000 / 60)} minutes`
        });
      }
    }
  }

  // Get transaction statistics
  getTransactionStats() {
    const transactions = Array.from(this.activeTransactions.values());
    
    return {
      active: transactions.length,
      maxConcurrent: this.maxConcurrentTransactions,
      queued: this.transactionQueue.length,
      averageDuration: transactions.reduce((sum, tx) => sum + (Date.now() - tx.startTime), 0) / transactions.length,
      oldestTransaction: transactions.reduce((oldest, tx) => tx.startTime < oldest.startTime ? tx : oldest, null),
      totalOperations: transactions.reduce((sum, tx) => sum + tx.operations.length, 0)
    };
  }
}

module.exports = TransactionService;
