const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class ElectionReadModel extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.options = {
      cachePrefix: options.cachePrefix || 'read_model:election:',
      updateInterval: options.updateInterval || 30000, // 30 seconds
      maxCacheAge: options.maxCacheAge || 300000, // 5 minutes
      batchSize: options.batchSize || 100,
      ...options
    };

    this.projections = new Map();
    this.caches = new Map();
    this.eventHandlers = new Map();
    
    this.initializeProjections();
    this.startPeriodicUpdates();
  }

  /**
   * Initialize read model projections
   */
  initializeProjections() {
    // Election summary projection
    this.addProjection('election_summary', {
      fields: [
        'id', 'title', 'description', 'type', 'status', 'startDate', 'endDate',
        'totalVotes', 'totalVoters', 'participationRate', 'candidatesCount',
        'createdAt', 'updatedAt', 'createdBy', 'settings'
      ],
      indexes: ['status', 'type', 'startDate', 'endDate', 'createdBy'],
      cacheKey: (electionId) => `election:${electionId}:summary`
    });

    // Election results projection
    this.addProjection('election_results', {
      fields: [
        'id', 'title', 'status', 'candidates', 'results', 'winner',
        'totalVotes', 'validVotes', 'invalidVotes', 'participationRate',
        'endDate', 'certifiedAt'
      ],
      indexes: ['status', 'endDate', 'winner'],
      cacheKey: (electionId) => `election:${electionId}:results`
    });

    // Election analytics projection
    this.addProjection('election_analytics', {
      fields: [
        'id', 'title', 'votingPatterns', 'timeline', 'demographics',
        'geographicDistribution', 'participationByHour', 'fraudMetrics',
        'performance', 'updatedAt'
      ],
      indexes: ['id'],
      cacheKey: (electionId) => `election:${electionId}:analytics`
    });

    // Candidate performance projection
    this.addProjection('candidate_performance', {
      fields: [
        'electionId', 'candidateId', 'name', 'party', 'votes', 'percentage',
        'rank', 'trend', 'demographics', 'geographicSupport',
        'performanceMetrics', 'updatedAt'
      ],
      indexes: ['electionId', 'candidateId', 'rank'],
      cacheKey: (electionId) => `election:${electionId}:candidates`
    });

    // Voter participation projection
    this.addProjection('voter_participation', {
      fields: [
        'electionId', 'totalEligible', 'totalVoted', 'participationRate',
        'participationByDemographic', 'participationByRegion',
        'participationByTime', 'dropoutPoints', 'updatedAt'
      ],
      indexes: ['electionId'],
      cacheKey: (electionId) => `election:${electionId}:participation`
    });

    logger.info('Election read model projections initialized', {
      projectionCount: this.projections.size
    });
  }

  /**
   * Add projection definition
   * @param {string} name - Projection name
   * @param {Object} definition - Projection definition
   */
  addProjection(name, definition) {
    this.projections.set(name, {
      name,
      fields: definition.fields,
      indexes: definition.indexes,
      cacheKey: definition.cacheKey,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Initialize event handlers for this projection
    this.initializeEventHandlers(name);
  }

  /**
   * Initialize event handlers for projection
   * @param {string} projectionName - Projection name
   */
  initializeEventHandlers(projectionName) {
    const handlers = {
      election_created: (event) => this.handleElectionCreated(projectionName, event),
      election_updated: (event) => this.handleElectionUpdated(projectionName, event),
      election_started: (event) => this.handleElectionStarted(projectionName, event),
      election_ended: (event) => this.handleElectionEnded(projectionName, event),
      candidate_added: (event) => this.handleCandidateAdded(projectionName, event),
      candidate_removed: (event) => this.handleCandidateRemoved(projectionName, event),
      vote_cast: (event) => this.handleVoteCast(projectionName, event),
      vote_updated: (event) => this.handleVoteUpdated(projectionName, event),
      vote_cancelled: (event) => this.handleVoteCancelled(projectionName, event)
    };

    this.eventHandlers.set(projectionName, handlers);
  }

  /**
   * Handle election created event
   */
  async handleElectionCreated(projectionName, event) {
    try {
      const electionData = event.metadata;
      const projection = this.projections.get(projectionName);
      
      if (!projection) return;

      const readModelData = this.extractFields(projection.fields, electionData);
      readModelData.id = electionData.id;
      readModelData.createdAt = event.timestamp;
      readModelData.updatedAt = event.timestamp;
      readModelData.totalVotes = 0;
      readModelData.totalVoters = 0;
      readModelData.participationRate = 0;
      readModelData.candidatesCount = electionData.candidates?.length || 0;

      await this.updateProjection(projectionName, electionData.id, readModelData);

      logger.debug('Election created projection updated', {
        projectionName,
        electionId: electionData.id
      });

    } catch (error) {
      logger.error('Failed to handle election created event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Handle election updated event
   */
  async handleElectionUpdated(projectionName, event) {
    try {
      const electionData = event.metadata;
      const projection = this.projections.get(projectionName);
      
      if (!projection) return;

      const existingData = await this.getProjection(projectionName, electionData.id);
      if (!existingData) return;

      const updatedData = {
        ...existingData,
        ...this.extractFields(projection.fields, electionData),
        updatedAt: event.timestamp
      };

      await this.updateProjection(projectionName, electionData.id, updatedData);

      logger.debug('Election updated projection updated', {
        projectionName,
        electionId: electionData.id
      });

    } catch (error) {
      logger.error('Failed to handle election updated event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Handle election started event
   */
  async handleElectionStarted(projectionName, event) {
    try {
      const electionData = event.metadata;
      const projection = this.projections.get(projectionName);
      
      if (!projection) return;

      const existingData = await this.getProjection(projectionName, electionData.id);
      if (!existingData) return;

      const updatedData = {
        ...existingData,
        status: 'active',
        startDate: event.timestamp,
        updatedAt: event.timestamp
      };

      await this.updateProjection(projectionName, electionData.id, updatedData);

      logger.debug('Election started projection updated', {
        projectionName,
        electionId: electionData.id
      });

    } catch (error) {
      logger.error('Failed to handle election started event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Handle election ended event
   */
  async handleElectionEnded(projectionName, event) {
    try {
      const electionData = event.metadata;
      const projection = this.projections.get(projectionName);
      
      if (!projection) return;

      const existingData = await this.getProjection(projectionName, electionData.id);
      if (!existingData) return;

      const updatedData = {
        ...existingData,
        status: 'completed',
        endDate: event.timestamp,
        updatedAt: event.timestamp
      };

      // For results projection, calculate final results
      if (projectionName === 'election_results') {
        updatedData.results = await this.calculateFinalResults(electionData.id);
        updatedData.winner = this.determineWinner(updatedData.results);
        updatedData.certifiedAt = event.timestamp;
      }

      await this.updateProjection(projectionName, electionData.id, updatedData);

      logger.debug('Election ended projection updated', {
        projectionName,
        electionId: electionData.id
      });

    } catch (error) {
      logger.error('Failed to handle election ended event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Handle vote cast event
   */
  async handleVoteCast(projectionName, event) {
    try {
      const voteData = event.metadata;
      const projection = this.projections.get(projectionName);
      
      if (!projection) return;

      const existingData = await this.getProjection(projectionName, voteData.electionId);
      if (!existingData) return;

      let updatedData = { ...existingData };

      // Update summary projection
      if (projectionName === 'election_summary') {
        updatedData.totalVotes = (updatedData.totalVotes || 0) + 1;
        updatedData.updatedAt = event.timestamp;
      }

      // Update results projection
      if (projectionName === 'election_results') {
        updatedData.totalVotes = (updatedData.totalVotes || 0) + 1;
        updatedData.validVotes = (updatedData.validVotes || 0) + 1;
        updatedData.participationRate = this.calculateParticipationRate(
          updatedData.totalVotes,
          updatedData.totalEligible
        );
        updatedData.updatedAt = event.timestamp;
      }

      // Update analytics projection
      if (projectionName === 'election_analytics') {
        updatedData = await this.updateAnalytics(updatedData, voteData, event.timestamp);
      }

      // Update candidate performance projection
      if (projectionName === 'candidate_performance') {
        updatedData = await this.updateCandidatePerformance(
          updatedData,
          voteData.candidateId,
          event.timestamp
        );
      }

      // Update voter participation projection
      if (projectionName === 'voter_participation') {
        updatedData = await this.updateVoterParticipation(
          updatedData,
          voteData.userId,
          event.timestamp
        );
      }

      await this.updateProjection(projectionName, voteData.electionId, updatedData);

      logger.debug('Vote cast projection updated', {
        projectionName,
        electionId: voteData.electionId,
        candidateId: voteData.candidateId
      });

    } catch (error) {
      logger.error('Failed to handle vote cast event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Handle vote updated event
   */
  async handleVoteUpdated(projectionName, event) {
    try {
      const voteData = event.metadata;
      
      // Handle vote change - decrement old candidate, increment new candidate
      if (voteData.previousCandidateId && voteData.previousCandidateId !== voteData.candidateId) {
        await this.handleVoteCancelled(projectionName, {
          ...event,
          metadata: { ...voteData, candidateId: voteData.previousCandidateId }
        });
      }

      await this.handleVoteCast(projectionName, event);

    } catch (error) {
      logger.error('Failed to handle vote updated event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Handle vote cancelled event
   */
  async handleVoteCancelled(projectionName, event) {
    try {
      const voteData = event.metadata;
      const projection = this.projections.get(projectionName);
      
      if (!projection) return;

      const existingData = await this.getProjection(projectionName, voteData.electionId);
      if (!existingData) return;

      let updatedData = { ...existingData };

      // Update summary projection
      if (projectionName === 'election_summary') {
        updatedData.totalVotes = Math.max(0, (updatedData.totalVotes || 0) - 1);
        updatedData.updatedAt = event.timestamp;
      }

      // Update results projection
      if (projectionName === 'election_results') {
        updatedData.totalVotes = Math.max(0, (updatedData.totalVotes || 0) - 1);
        updatedData.validVotes = Math.max(0, (updatedData.validVotes || 0) - 1);
        updatedData.participationRate = this.calculateParticipationRate(
          updatedData.totalVotes,
          updatedData.totalEligible
        );
        updatedData.updatedAt = event.timestamp;
      }

      await this.updateProjection(projectionName, voteData.electionId, updatedData);

      logger.debug('Vote cancelled projection updated', {
        projectionName,
        electionId: voteData.electionId,
        candidateId: voteData.candidateId
      });

    } catch (error) {
      logger.error('Failed to handle vote cancelled event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Handle candidate added event
   */
  async handleCandidateAdded(projectionName, event) {
    try {
      const candidateData = event.metadata;
      const projection = this.projections.get(projectionName);
      
      if (!projection) return;

      const existingData = await this.getProjection(projectionName, candidateData.electionId);
      if (!existingData) return;

      let updatedData = { ...existingData };

      // Update summary projection
      if (projectionName === 'election_summary') {
        updatedData.candidatesCount = (updatedData.candidatesCount || 0) + 1;
        updatedData.updatedAt = event.timestamp;
      }

      // Update candidate performance projection
      if (projectionName === 'candidate_performance') {
        if (!updatedData.candidates) {
          updatedData.candidates = [];
        }
        
        updatedData.candidates.push({
          candidateId: candidateData.id,
          name: candidateData.name,
          party: candidateData.party,
          votes: 0,
          percentage: 0,
          rank: updatedData.candidates.length + 1,
          trend: [],
          demographics: {},
          geographicSupport: {},
          performanceMetrics: {},
          updatedAt: event.timestamp
        });
        
        updatedData.updatedAt = event.timestamp;
      }

      await this.updateProjection(projectionName, candidateData.electionId, updatedData);

      logger.debug('Candidate added projection updated', {
        projectionName,
        electionId: candidateData.electionId,
        candidateId: candidateData.id
      });

    } catch (error) {
      logger.error('Failed to handle candidate added event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Handle candidate removed event
   */
  async handleCandidateRemoved(projectionName, event) {
    try {
      const candidateData = event.metadata;
      const projection = this.projections.get(projectionName);
      
      if (!projection) return;

      const existingData = await this.getProjection(projectionName, candidateData.electionId);
      if (!existingData) return;

      let updatedData = { ...existingData };

      // Update summary projection
      if (projectionName === 'election_summary') {
        updatedData.candidatesCount = Math.max(0, (updatedData.candidatesCount || 0) - 1);
        updatedData.updatedAt = event.timestamp;
      }

      // Update candidate performance projection
      if (projectionName === 'candidate_performance' && updatedData.candidates) {
        updatedData.candidates = updatedData.candidates.filter(
          candidate => candidate.candidateId !== candidateData.id
        );
        
        // Recalculate ranks
        updatedData.candidates.sort((a, b) => b.votes - a.votes);
        updatedData.candidates.forEach((candidate, index) => {
          candidate.rank = index + 1;
        });
        
        updatedData.updatedAt = event.timestamp;
      }

      await this.updateProjection(projectionName, candidateData.electionId, updatedData);

      logger.debug('Candidate removed projection updated', {
        projectionName,
        electionId: candidateData.electionId,
        candidateId: candidateData.id
      });

    } catch (error) {
      logger.error('Failed to handle candidate removed event', {
        projectionName,
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Extract fields from data based on projection definition
   */
  extractFields(fields, data) {
    const extracted = {};
    
    for (const field of fields) {
      if (data.hasOwnProperty(field)) {
        extracted[field] = data[field];
      }
    }
    
    return extracted;
  }

  /**
   * Update projection data
   */
  async updateProjection(projectionName, id, data) {
    try {
      const projection = this.projections.get(projectionName);
      if (!projection) return;

      const cacheKey = projection.cacheKey(id);
      
      // Store in Redis
      await this.redis.setex(
        cacheKey,
        Math.ceil(this.options.maxCacheAge / 1000),
        JSON.stringify({
          ...data,
          projectionName,
          updatedAt: Date.now()
        })
      );

      // Update in-memory cache
      this.caches.set(cacheKey, data);

      // Emit update event
      this.emit('projectionUpdated', {
        projectionName,
        id,
        data,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Failed to update projection', {
        projectionName,
        id,
        error: error.message
      });
    }
  }

  /**
   * Get projection data
   */
  async getProjection(projectionName, id) {
    try {
      const projection = this.projections.get(projectionName);
      if (!projection) return null;

      const cacheKey = projection.cacheKey(id);
      
      // Check in-memory cache first
      if (this.caches.has(cacheKey)) {
        return this.caches.get(cacheKey);
      }

      // Check Redis cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        this.caches.set(cacheKey, data);
        return data;
      }

      return null;

    } catch (error) {
      logger.error('Failed to get projection', {
        projectionName,
        id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Query projections
   */
  async queryProjection(projectionName, filters = {}, options = {}) {
    try {
      const projection = this.projections.get(projectionName);
      if (!projection) return [];

      const pattern = `${this.options.cachePrefix}${projectionName}:*`;
      const keys = await this.redis.keys(pattern);
      
      const results = [];
      
      for (const key of keys.slice(0, this.options.batchSize)) {
        try {
          const cached = await this.redis.get(key);
          if (cached) {
            const data = JSON.parse(cached);
            
            // Apply filters
            if (this.matchesFilters(data, filters)) {
              results.push(data);
            }
          }
        } catch (error) {
          // Skip problematic entries
        }
      }

      // Apply sorting
      if (options.sortBy) {
        results.sort((a, b) => {
          const aVal = a[options.sortBy];
          const bVal = b[options.sortBy];
          
          if (options.sortOrder === 'desc') {
            return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
          } else {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          }
        });
      }

      // Apply pagination
      if (options.limit) {
        const offset = options.offset || 0;
        return results.slice(offset, offset + options.limit);
      }

      return results;

    } catch (error) {
      logger.error('Failed to query projection', {
        projectionName,
        filters,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Check if data matches filters
   */
  matchesFilters(data, filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (data[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Calculate final results
   */
  async calculateFinalResults(electionId) {
    try {
      // This would query the vote data and calculate results
      // For now, return a placeholder
      return {
        candidates: [],
        summary: {
          totalVotes: 0,
          validVotes: 0,
          invalidVotes: 0,
          participationRate: 0
        }
      };
    } catch (error) {
      logger.error('Failed to calculate final results', {
        electionId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Determine winner from results
   */
  determineWinner(results) {
    if (!results || !results.candidates || results.candidates.length === 0) {
      return null;
    }

    const sortedCandidates = results.candidates.sort((a, b) => b.votes - a.votes);
    return sortedCandidates[0];
  }

  /**
   * Calculate participation rate
   */
  calculateParticipationRate(totalVotes, totalEligible) {
    if (!totalEligible || totalEligible === 0) return 0;
    return (totalVotes / totalEligible) * 100;
  }

  /**
   * Update analytics data
   */
  async updateAnalytics(analyticsData, voteData, timestamp) {
    // Update voting patterns
    if (!analyticsData.votingPatterns) {
      analyticsData.votingPatterns = {};
    }

    const hour = new Date(timestamp).getHours();
    analyticsData.votingPatterns[hour] = (analyticsData.votingPatterns[hour] || 0) + 1;

    // Update timeline
    if (!analyticsData.timeline) {
      analyticsData.timeline = [];
    }

    analyticsData.timeline.push({
      timestamp,
      type: 'vote',
      candidateId: voteData.candidateId,
      userId: voteData.userId
    });

    // Keep only last 1000 timeline entries
    if (analyticsData.timeline.length > 1000) {
      analyticsData.timeline = analyticsData.timeline.slice(-1000);
    }

    analyticsData.updatedAt = timestamp;

    return analyticsData;
  }

  /**
   * Update candidate performance data
   */
  async updateCandidatePerformance(performanceData, candidateId, timestamp) {
    if (!performanceData.candidates) {
      performanceData.candidates = [];
    }

    let candidate = performanceData.candidates.find(c => c.candidateId === candidateId);
    
    if (!candidate) {
      candidate = {
        candidateId,
        votes: 0,
        percentage: 0,
        rank: performanceData.candidates.length + 1,
        trend: [],
        demographics: {},
        geographicSupport: {},
        performanceMetrics: {},
        updatedAt: timestamp
      };
      performanceData.candidates.push(candidate);
    }

    candidate.votes += 1;
    candidate.trend.push({
      timestamp,
      votes: candidate.votes
    });

    // Keep only last 100 trend points
    if (candidate.trend.length > 100) {
      candidate.trend = candidate.trend.slice(-100);
    }

    // Recalculate percentages and ranks
    const totalVotes = performanceData.candidates.reduce((sum, c) => sum + c.votes, 0);
    
    performanceData.candidates.forEach(c => {
      c.percentage = totalVotes > 0 ? (c.votes / totalVotes) * 100 : 0;
    });

    performanceData.candidates.sort((a, b) => b.votes - a.votes);
    performanceData.candidates.forEach((c, index) => {
      c.rank = index + 1;
    });

    performanceData.updatedAt = timestamp;

    return performanceData;
  }

  /**
   * Update voter participation data
   */
  async updateVoterParticipation(participationData, userId, timestamp) {
    if (!participationData.totalVoted) {
      participationData.totalVoted = 0;
    }

    participationData.totalVoted += 1;
    participationData.participationRate = this.calculateParticipationRate(
      participationData.totalVoted,
      participationData.totalEligible
    );

    // Update participation by time
    if (!participationData.participationByTime) {
      participationData.participationByTime = {};
    }

    const hour = new Date(timestamp).getHours();
    participationData.participationByTime[hour] = (participationData.participationByTime[hour] || 0) + 1;

    participationData.updatedAt = timestamp;

    return participationData;
  }

  /**
   * Process events from event store
   */
  async processEvents(events) {
    try {
      for (const event of events) {
        const handlers = this.eventHandlers.get('election_summary');
        
        if (handlers && handlers[event.type]) {
          await handlers[event.type](event);
        }

        // Apply to all projections
        for (const [projectionName, projectionHandlers] of this.eventHandlers) {
          if (projectionHandlers[event.type]) {
            await projectionHandlers[event.type](event);
          }
        }
      }

      logger.debug('Processed events for read models', {
        eventCount: events.length
      });

    } catch (error) {
      logger.error('Failed to process events', {
        eventCount: events.length,
        error: error.message
      });
    }
  }

  /**
   * Rebuild projection from events
   */
  async rebuildProjection(projectionName, fromTimestamp = null) {
    try {
      logger.info('Rebuilding projection', {
        projectionName,
        fromTimestamp
      });

      // Clear existing cache
      const pattern = `${this.options.cachePrefix}${projectionName}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      // Clear in-memory cache
      for (const key of this.caches.keys()) {
        if (key.includes(projectionName)) {
          this.caches.delete(key);
        }
      }

      // Rebuild from events
      // This would query the event store and replay events
      // For now, we'll emit a rebuild event
      this.emit('projectionRebuild', {
        projectionName,
        fromTimestamp,
        timestamp: Date.now()
      });

      logger.info('Projection rebuild completed', {
        projectionName
      });

    } catch (error) {
      logger.error('Failed to rebuild projection', {
        projectionName,
        error: error.message
      });
    }
  }

  /**
   * Get projection statistics
   */
  async getProjectionStats(projectionName) {
    try {
      const pattern = `${this.options.cachePrefix}${projectionName}:*`;
      const keys = await this.redis.keys(pattern);
      
      return {
        projectionName,
        cachedItems: keys.length,
        memoryUsage: this.caches.size,
        lastUpdated: Date.now()
      };

    } catch (error) {
      logger.error('Failed to get projection stats', {
        projectionName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get all projection statistics
   */
  async getAllProjectionStats() {
    const stats = {};
    
    for (const projectionName of this.projections.keys()) {
      stats[projectionName] = await this.getProjectionStats(projectionName);
    }

    return stats;
  }

  /**
   * Clear projection cache
   */
  async clearProjectionCache(projectionName = null) {
    try {
      if (projectionName) {
        const pattern = `${this.options.cachePrefix}${projectionName}:*`;
        const keys = await this.redis.keys(pattern);
        
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }

        // Clear in-memory cache
        for (const key of this.caches.keys()) {
          if (key.includes(projectionName)) {
            this.caches.delete(key);
          }
        }

        logger.info('Projection cache cleared', { projectionName });
      } else {
        // Clear all caches
        const pattern = `${this.options.cachePrefix}*`;
        const keys = await this.redis.keys(pattern);
        
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }

        this.caches.clear();

        logger.info('All projection caches cleared');
      }

    } catch (error) {
      logger.error('Failed to clear projection cache', {
        projectionName,
        error: error.message
      });
    }
  }

  /**
   * Start periodic updates
   */
  startPeriodicUpdates() {
    setInterval(async () => {
      try {
        // Clean up expired cache entries
        await this.cleanupExpiredCache();
        
        // Emit periodic update event
        this.emit('periodicUpdate', {
          timestamp: Date.now(),
          cacheSize: this.caches.size
        });

      } catch (error) {
        logger.error('Periodic update failed', {
          error: error.message
        });
      }
    }, this.options.updateInterval);
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredCache() {
    try {
      const now = Date.now();
      const expiredKeys = [];

      for (const [key, data] of this.caches.entries()) {
        if (data.updatedAt && (now - data.updatedAt) > this.options.maxCacheAge) {
          expiredKeys.push(key);
        }
      }

      for (const key of expiredKeys) {
        this.caches.delete(key);
      }

      if (expiredKeys.length > 0) {
        logger.debug('Cleaned up expired cache entries', {
          expiredCount: expiredKeys.length
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup expired cache', {
        error: error.message
      });
    }
  }

  /**
   * Get read model status
   */
  getStatus() {
    return {
      projections: Array.from(this.projections.keys()),
      cacheSize: this.caches.size,
      eventHandlers: this.eventHandlers.size,
      options: this.options,
      timestamp: Date.now()
    };
  }
}

// Create singleton instance
const electionReadModel = new ElectionReadModel({
  cachePrefix: 'read_model:election:',
  updateInterval: 30000,
  maxCacheAge: 300000,
  batchSize: 100
});

module.exports = electionReadModel;
