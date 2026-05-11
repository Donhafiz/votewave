const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const EventEmitter = require('events');

class GeoPartitionedElections extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = redis;
    this.options = {
      partitionPrefix: options.partitionPrefix || 'geo_partition:',
      electionPrefix: options.electionPrefix || 'election:',
      defaultRegion: options.defaultRegion || 'us-east-1',
      enableCrossRegionVoting: options.enableCrossRegionVoting !== false,
      enableGeoValidation: options.enableGeoValidation !== false,
      enableLoadBalancing: options.enableLoadBalancing !== false,
      maxRegionsPerElection: options.maxRegionsPerElection || 5,
      replicationLag: options.replicationLag || 30000, // 30 seconds
      syncInterval: options.syncInterval || 60000, // 1 minute
      ...options
    };

    this.partitions = new Map();
    this.electionRegions = new Map();
    this.regionLoad = new Map();
    this.geoValidator = null;
    
    this.initializePartitions();
    this.startSync();
  }

  /**
   * Initialize geographic partitions
   */
  initializePartitions() {
    // Define geographic regions and their characteristics
    const regions = {
      'us-east-1': {
        name: 'US East (N. Virginia)',
        country: 'US',
        timezone: 'America/New_York',
        coordinates: { lat: 39.0458, lng: -77.6413 },
        capacity: 10000,
        latency: { 'us-west-2': 70, 'eu-west-1': 80, 'ap-southeast-1': 180 },
        loadFactor: 0.8
      },
      'us-west-2': {
        name: 'US West (Oregon)',
        country: 'US',
        timezone: 'America/Los_Angeles',
        coordinates: { lat: 45.5152, lng: -122.6784 },
        capacity: 8000,
        latency: { 'us-east-1': 70, 'eu-west-1': 150, 'ap-southeast-1': 120 },
        loadFactor: 0.7
      },
      'eu-west-1': {
        name: 'EU West (Ireland)',
        country: 'IE',
        timezone: 'Europe/Dublin',
        coordinates: { lat: 53.4091, lng: -8.2419 },
        capacity: 6000,
        latency: { 'us-east-1': 80, 'us-west-2': 150, 'ap-southeast-1': 200 },
        loadFactor: 0.6
      },
      'ap-southeast-1': {
        name: 'Asia Pacific (Singapore)',
        country: 'SG',
        timezone: 'Asia/Singapore',
        coordinates: { lat: 1.3521, lng: 103.8198 },
        capacity: 5000,
        latency: { 'us-east-1': 180, 'us-west-2': 120, 'eu-west-1': 200 },
        loadFactor: 0.5
      },
      'sa-east-1': {
        name: 'South America (São Paulo)',
        country: 'BR',
        timezone: 'America/Sao_Paulo',
        coordinates: { lat: -23.5505, lng: -46.6333 },
        capacity: 3000,
        latency: { 'us-east-1': 120, 'us-west-2': 180, 'eu-west-1': 160, 'ap-southeast-1': 240 },
        loadFactor: 0.4
      }
    };

    for (const [regionId, config] of Object.entries(regions)) {
      this.partitions.set(regionId, {
        id: regionId,
        ...config,
        currentLoad: 0,
        activeElections: new Set(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Initialize region load tracking
      this.regionLoad.set(regionId, {
        current: 0,
        peak: 0,
        average: 0,
        requests: 0,
        errors: 0,
        lastUpdated: Date.now()
      });
    }

    logger.info('Geo-partitioned elections initialized', {
      regionCount: this.partitions.size,
      defaultRegion: this.options.defaultRegion,
      enableCrossRegionVoting: this.options.enableCrossRegionVoting
    });
  }

  /**
   * Create geo-partitioned election
   */
  async createGeoPartitionedElection(electionData, options = {}) {
    try {
      const electionId = electionData.id;
      
      // Determine optimal regions for this election
      const targetRegions = await this.selectTargetRegions(electionData, options);
      
      if (targetRegions.length === 0) {
        throw new Error('No suitable regions available for election');
      }

      // Create election in each target region
      const electionRegions = {};
      
      for (const region of targetRegions) {
        const regionKey = `${this.options.partitionPrefix}${region}:${this.options.electionPrefix}${electionId}`;
        
        const electionConfig = {
          ...electionData,
          region,
          partitionKey: regionKey,
          primaryRegion: targetRegions[0],
          isPrimary: region === targetRegions[0],
          createdAt: Date.now(),
          updatedAt: Date.now,
          status: 'active'
        };

        // Store in Redis
        await this.redis.setex(
          regionKey,
          86400, // 24 hours
          JSON.stringify(electionConfig)
        );

        electionRegions[region] = electionConfig;

        // Update region load
        await this.updateRegionLoad(region, 'create_election', 1);

        // Add to active elections
        const partition = this.partitions.get(region);
        if (partition) {
          partition.activeElections.add(electionId);
          partition.currentLoad += 1;
          partition.updatedAt = Date.now();
        }

        logger.info('Election created in region', {
          electionId,
          region,
          isPrimary: region === targetRegions[0]
        });
      }

      // Store election region mapping
      this.electionRegions.set(electionId, {
        electionId,
        regions: targetRegions,
        primaryRegion: targetRegions[0],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Store mapping in Redis
      const mappingKey = `${this.options.electionPrefix}${electionId}:regions`;
      await this.redis.setex(
        mappingKey,
        86400,
        JSON.stringify({
          regions: targetRegions,
          primaryRegion: targetRegions[0]
        })
      );

      this.emit('geoElectionCreated', {
        electionId,
        regions: targetRegions,
        primaryRegion: targetRegions[0]
      });

      return {
        electionId,
        regions: targetRegions,
        primaryRegion: targetRegions[0],
        electionConfig: electionRegions
      };

    } catch (error) {
      logger.error('Failed to create geo-partitioned election', {
        electionId: electionData.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Select optimal target regions for election
   */
  async selectTargetRegions(electionData, options = {}) {
    try {
      const {
        expectedVoters = 1000,
        targetRegions: preferredRegions = [],
        minRegions = 1,
        maxRegions = this.options.maxRegionsPerElection,
        geographicConstraints = {},
        loadBalancing = this.options.enableLoadBalancing
      } = options;

      let candidateRegions = Array.from(this.partitions.keys());

      // Apply preferred regions filter
      if (preferredRegions.length > 0) {
        candidateRegions = candidateRegions.filter(region => 
          preferredRegions.includes(region)
        );
      }

      // Apply geographic constraints
      if (geographicConstraints.countries) {
        candidateRegions = candidateRegions.filter(region => {
          const partition = this.partitions.get(region);
          return geographicConstraints.countries.includes(partition.country);
        });
      }

      if (geographicConstraints.excludeRegions) {
        candidateRegions = candidateRegions.filter(region => 
          !geographicConstraints.excludeRegions.includes(region)
        );
      }

      // Calculate region scores
      const regionScores = [];

      for (const region of candidateRegions) {
        const partition = this.partitions.get(region);
        const load = this.regionLoad.get(region);

        const score = this.calculateRegionScore(partition, load, {
          expectedVoters,
          geographicConstraints,
          loadBalancing
        });

        regionScores.push({
          region,
          score,
          partition,
          load
        });
      }

      // Sort by score (highest first)
      regionScores.sort((a, b) => b.score - a.score);

      // Select top regions
      const selectedRegions = regionScores
        .slice(0, Math.min(maxRegions, regionScores.length))
        .map(item => item.region);

      // Ensure minimum regions
      if (selectedRegions.length < minRegions) {
        // Add additional regions if needed
        const additionalRegions = candidateRegions
          .filter(region => !selectedRegions.includes(region))
          .slice(0, minRegions - selectedRegions.length);
        
        selectedRegions.push(...additionalRegions);
      }

      logger.debug('Target regions selected', {
        electionId: electionData.id,
        selectedRegions,
        candidateCount: candidateRegions.length,
        expectedVoters
      });

      return selectedRegions;

    } catch (error) {
      logger.error('Failed to select target regions', {
        electionId: electionData.id,
        error: error.message
      });
      return [this.options.defaultRegion];
    }
  }

  /**
   * Calculate region score for selection
   */
  calculateRegionScore(partition, load, options) {
    let score = 100;

    // Capacity score
    const capacityUtilization = (load.current + options.expectedVoters) / partition.capacity;
    if (capacityUtilization > 0.8) {
      score -= 50; // Heavily penalize overloaded regions
    } else if (capacityUtilization > 0.6) {
      score -= 20;
    }

    // Load balancing score
    if (options.loadBalancing) {
      const loadFactor = partition.loadFactor;
      score += (1 - loadFactor) * 20; // Prefer less loaded regions
    }

    // Geographic proximity score (if voter locations available)
    if (options.geographicConstraints.voterLocations) {
      const proximityScore = this.calculateProximityScore(
        partition.coordinates,
        options.geographicConstraints.voterLocations
      );
      score += proximityScore * 10;
    }

    // Latency score (for cross-region voting)
    if (this.options.enableCrossRegionVoting) {
      const avgLatency = this.calculateAverageLatency(partition.id);
      score += Math.max(0, (200 - avgLatency) / 10); // Lower latency = higher score
    }

    // Region reliability score
    const errorRate = load.requests > 0 ? load.errors / load.requests : 0;
    score -= errorRate * 30; // Penalize high error rates

    return Math.max(0, score);
  }

  /**
   * Calculate proximity score based on voter locations
   */
  calculateProximityScore(regionCoords, voterLocations) {
    if (!voterLocations || voterLocations.length === 0) {
      return 0;
    }

    let totalDistance = 0;
    let validLocations = 0;

    for (const location of voterLocations) {
      if (location.lat && location.lng) {
        const distance = this.calculateDistance(
          regionCoords.lat,
          regionCoords.lng,
          location.lat,
          location.lng
        );
        totalDistance += distance;
        validLocations++;
      }
    }

    if (validLocations === 0) {
      return 0;
    }

    const avgDistance = totalDistance / validLocations;
    
    // Convert distance to score (closer = higher score)
    return Math.max(0, 1 - (avgDistance / 20000)); // 20,000 km as max distance
  }

  /**
   * Calculate distance between two coordinates
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calculate average latency to other regions
   */
  calculateAverageLatency(regionId) {
    const partition = this.partitions.get(regionId);
    if (!partition || !partition.latency) {
      return 100; // Default latency
    }

    const latencies = Object.values(partition.latency);
    return latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;
  }

  /**
   * Cast vote in geo-partitioned election
   */
  async castGeoPartitionedVote(electionId, voteData, options = {}) {
    try {
      // Get election regions
      const electionRegions = await this.getElectionRegions(electionId);
      if (!electionRegions) {
        throw new Error('Election not found or not geo-partitioned');
      }

      // Determine optimal region for this vote
      let targetRegion = options.region;
      
      if (!targetRegion) {
        targetRegion = await this.selectVoteRegion(electionId, voteData, electionRegions);
      }

      // Validate geo-location if enabled
      if (this.options.enableGeoValidation) {
        const isValid = await this.validateGeoLocation(voteData, targetRegion);
        if (!isValid) {
          throw new Error('Vote not allowed from this geographic location');
        }
      }

      // Cast vote in target region
      const voteResult = await this.castVoteInRegion(targetRegion, electionId, voteData);

      // Replicate to other regions if needed
      if (this.options.enableCrossRegionVoting && electionRegions.regions.length > 1) {
        await this.replicateVote(electionId, voteData, targetRegion, electionRegions.regions);
      }

      // Update region load
      await this.updateRegionLoad(targetRegion, 'cast_vote', 1);

      logger.info('Geo-partitioned vote cast', {
        electionId,
        targetRegion,
        voterId: voteData.userId,
        replicated: this.options.enableCrossRegionVoting
      });

      this.emit('geoVoteCast', {
        electionId,
        targetRegion,
        voterId: voteData.userId,
        replicated: this.options.enableCrossRegionVoting
      });

      return {
        ...voteResult,
        region: targetRegion,
        replicated: this.options.enableCrossRegionVoting
      };

    } catch (error) {
      logger.error('Failed to cast geo-partitioned vote', {
        electionId,
        voterId: voteData.userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get election regions
   */
  async getElectionRegions(electionId) {
    try {
      // Check memory cache first
      if (this.electionRegions.has(electionId)) {
        return this.electionRegions.get(electionId);
      }

      // Check Redis
      const mappingKey = `${this.options.electionPrefix}${electionId}:regions`;
      const mappingData = await this.redis.get(mappingKey);
      
      if (mappingData) {
        const mapping = JSON.parse(mappingData);
        this.electionRegions.set(electionId, mapping);
        return mapping;
      }

      return null;

    } catch (error) {
      logger.error('Failed to get election regions', {
        electionId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Select optimal region for vote
   */
  async selectVoteRegion(electionId, voteData, electionRegions) {
    try {
      // Get voter location
      const voterLocation = await this.getVoterLocation(voteData.userId);
      
      if (!voterLocation) {
        // Fallback to primary region
        return electionRegions.primaryRegion;
      }

      // Find closest region
      let closestRegion = electionRegions.primaryRegion;
      let minDistance = Infinity;

      for (const region of electionRegions.regions) {
        const partition = this.partitions.get(region);
        if (!partition) continue;

        const distance = this.calculateDistance(
          partition.coordinates.lat,
          partition.coordinates.lng,
          voterLocation.lat,
          voterLocation.lng
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestRegion = region;
        }
      }

      // Check if closest region has capacity
      const partition = this.partitions.get(closestRegion);
      if (partition && partition.currentLoad < partition.capacity) {
        return closestRegion;
      }

      // Fallback to primary region
      return electionRegions.primaryRegion;

    } catch (error) {
      logger.error('Failed to select vote region', {
        electionId,
        voterId: voteData.userId,
        error: error.message
      });
      return electionRegions.primaryRegion;
    }
  }

  /**
   * Get voter location
   */
  async getVoterLocation(userId) {
    try {
      // This would integrate with a geolocation service
      // For now, return a mock location
      return {
        lat: 40.7128,
        lng: -74.0060,
        country: 'US',
        region: 'us-east-1'
      };
    } catch (error) {
      logger.error('Failed to get voter location', {
        userId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Validate geo-location
   */
  async validateGeoLocation(voteData, targetRegion) {
    try {
      const voterLocation = await this.getVoterLocation(voteData.userId);
      
      if (!voterLocation) {
        return true; // Allow if location unknown
      }

      const partition = this.partitions.get(targetRegion);
      if (!partition) {
        return false;
      }

      // Check if voter is in same country as region
      if (partition.country !== voterLocation.country) {
        // Check if cross-region voting is allowed
        if (!this.options.enableCrossRegionVoting) {
          return false;
        }

        // Additional validation for cross-region voting
        const distance = this.calculateDistance(
          partition.coordinates.lat,
          partition.coordinates.lng,
          voterLocation.lat,
          voterLocation.lng
        );

        // Allow if within reasonable distance (e.g., expatriates)
        if (distance > 5000) { // 5000 km threshold
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Failed to validate geo-location', {
        voterId: voteData.userId,
        targetRegion,
        error: error.message
      });
      return true; // Allow on error
    }
  }

  /**
   * Cast vote in specific region
   */
  async castVoteInRegion(region, electionId, voteData) {
    try {
      const regionKey = `${this.options.partitionPrefix}${region}:${this.options.electionPrefix}${electionId}`;
      
      // Get election config
      const electionConfigData = await this.redis.get(regionKey);
      if (!electionConfigData) {
        throw new Error(`Election not found in region ${region}`);
      }

      const electionConfig = JSON.parse(electionConfigData);

      // Store vote in region
      const voteKey = `${regionKey}:votes:${voteData.userId}`;
      const voteRecord = {
        ...voteData,
        region,
        timestamp: Date.now(),
        validated: true
      };

      await this.redis.setex(voteKey, 86400, JSON.stringify(voteRecord));

      // Update vote count
      const countKey = `${regionKey}:vote_count`;
      await this.redis.incr(countKey);

      return {
        success: true,
        region,
        timestamp: Date.now(),
        voteId: `${region}:${electionId}:${voteData.userId}`
      };

    } catch (error) {
      logger.error('Failed to cast vote in region', {
        region,
        electionId,
        voterId: voteData.userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Replicate vote to other regions
   */
  async replicateVote(electionId, voteData, sourceRegion, targetRegions) {
    try {
      const replicationPromises = [];

      for (const region of targetRegions) {
        if (region === sourceRegion) continue;

        const promise = this.replicateVoteToRegion(region, electionId, voteData, sourceRegion);
        replicationPromises.push(promise);
      }

      const results = await Promise.allSettled(replicationPromises);

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed > 0) {
        logger.warn('Some vote replications failed', {
          electionId,
          sourceRegion,
          successful,
          failed
        });
      }

      return { successful, failed };

    } catch (error) {
      logger.error('Failed to replicate vote', {
        electionId,
        sourceRegion,
        error: error.message
      });
    }
  }

  /**
   * Replicate vote to specific region
   */
  async replicateVoteToRegion(targetRegion, electionId, voteData, sourceRegion) {
    try {
      const regionKey = `${this.options.partitionPrefix}${targetRegion}:${this.options.electionPrefix}${electionId}`;
      
      // Store replicated vote
      const voteKey = `${regionKey}:replicated_votes:${voteData.userId}`;
      const voteRecord = {
        ...voteData,
        sourceRegion,
        targetRegion,
        replicatedAt: Date.now(),
        timestamp: Date.now()
      };

      await this.redis.setex(voteKey, 86400, JSON.stringify(voteRecord));

      logger.debug('Vote replicated to region', {
        targetRegion,
        electionId,
        voterId: voteData.userId
      });

    } catch (error) {
      logger.error('Failed to replicate vote to region', {
        targetRegion,
        electionId,
        voterId: voteData.userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get election results from all regions
   */
  async getGeoPartitionedResults(electionId) {
    try {
      const electionRegions = await this.getElectionRegions(electionId);
      if (!electionRegions) {
        throw new Error('Election not found or not geo-partitioned');
      }

      const results = {
        electionId,
        regions: {},
        totalVotes: 0,
        totalVoters: new Set(),
        regionStats: {},
        timestamp: Date.now()
      };

      // Collect results from each region
      for (const region of electionRegions.regions) {
        const regionResults = await this.getRegionResults(region, electionId);
        
        results.regions[region] = regionResults;
        results.totalVotes += regionResults.totalVotes;
        
        // Track unique voters
        for (const voterId of regionResults.voters) {
          results.totalVoters.add(voterId);
        }

        // Region statistics
        results.regionStats[region] = {
          totalVotes: regionResults.totalVotes,
          uniqueVoters: regionResults.voters.size,
          candidateResults: regionResults.candidateResults,
          replicationStatus: regionResults.replicationStatus
        };
      }

      results.totalVoters = results.totalVoters.size;

      // Calculate global candidate results
      results.globalResults = this.calculateGlobalResults(results.regions);

      this.emit('geoResultsCollected', {
        electionId,
        totalVotes: results.totalVotes,
        totalVoters: results.totalVoters,
        regionCount: electionRegions.regions.length
      });

      return results;

    } catch (error) {
      logger.error('Failed to get geo-partitioned results', {
        electionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get results from specific region
   */
  async getRegionResults(region, electionId) {
    try {
      const regionKey = `${this.options.partitionPrefix}${region}:${this.options.electionPrefix}${electionId}`;
      
      // Get vote count
      const countKey = `${regionKey}:vote_count`;
      const totalVotes = parseInt(await this.redis.get(countKey) || '0');

      // Get all votes
      const votePattern = `${regionKey}:votes:*`;
      const voteKeys = await this.redis.keys(votePattern);
      
      const votes = [];
      const voters = new Set();
      const candidateVotes = new Map();

      for (const voteKey of voteKeys.slice(0, 1000)) { // Limit to 1000 votes
        try {
          const voteData = await this.redis.get(voteKey);
          if (voteData) {
            const vote = JSON.parse(voteData);
            votes.push(vote);
            voters.add(vote.userId);
            
            // Count candidate votes
            const candidateId = vote.candidateId;
            candidateVotes.set(candidateId, (candidateVotes.get(candidateId) || 0) + 1);
          }
        } catch (error) {
          // Skip problematic votes
        }
      }

      // Get replicated votes
      const replicatedPattern = `${regionKey}:replicated_votes:*`;
      const replicatedKeys = await this.redis.keys(replicatedPattern);
      
      const replicatedVotes = [];
      for (const replicatedKey of replicatedKeys.slice(0, 1000)) {
        try {
          const replicatedData = await this.redis.get(replicatedKey);
          if (replicatedData) {
            const vote = JSON.parse(replicatedData);
            replicatedVotes.push(vote);
          }
        } catch (error) {
          // Skip problematic votes
        }
      }

      // Calculate candidate results
      const candidateResults = Array.from(candidateVotes.entries()).map(([candidateId, votes]) => ({
        candidateId,
        votes,
        percentage: totalVotes > 0 ? (votes / totalVotes) * 100 : 0
      }));

      return {
        region,
        totalVotes,
        voters,
        candidateResults,
        localVotes: votes.length,
        replicatedVotes: replicatedVotes.length,
        replicationStatus: {
          total: votes.length + replicatedVotes.length,
          local: votes.length,
          replicated: replicatedVotes.length,
          replicationRate: votes.length > 0 ? replicatedVotes.length / votes.length : 0
        }
      };

    } catch (error) {
      logger.error('Failed to get region results', {
        region,
        electionId,
        error: error.message
      });
      return {
        region,
        totalVotes: 0,
        voters: new Set(),
        candidateResults: [],
        localVotes: 0,
        replicatedVotes: 0,
        replicationStatus: { total: 0, local: 0, replicated: 0, replicationRate: 0 }
      };
    }
  }

  /**
   * Calculate global results from regional results
   */
  calculateGlobalResults(regionalResults) {
    const globalCandidateVotes = new Map();
    let totalVotes = 0;

    // Aggregate votes from all regions
    for (const [region, results] of Object.entries(regionalResults)) {
      totalVotes += results.totalVotes;
      
      for (const candidateResult of results.candidateResults) {
        const currentVotes = globalCandidateVotes.get(candidateResult.candidateId) || 0;
        globalCandidateVotes.set(candidateResult.candidateId, currentVotes + candidateResult.votes);
      }
    }

    // Calculate global candidate results
    const globalResults = Array.from(globalCandidateVotes.entries()).map(([candidateId, votes]) => ({
      candidateId,
      votes,
      percentage: totalVotes > 0 ? (votes / totalVotes) * 100 : 0,
      rank: 0 // Will be calculated below
    }));

    // Sort and assign ranks
    globalResults.sort((a, b) => b.votes - a.votes);
    globalResults.forEach((result, index) => {
      result.rank = index + 1;
    });

    return {
      candidates: globalResults,
      totalVotes,
      totalRegions: Object.keys(regionalResults).length
    };
  }

  /**
   * Update region load metrics
   */
  async updateRegionLoad(region, operation, load = 1) {
    try {
      const regionLoad = this.regionLoad.get(region);
      if (!regionLoad) return;

      regionLoad.current += load;
      regionLoad.requests += 1;
      regionLoad.lastUpdated = Date.now();

      // Update peak load
      if (regionLoad.current > regionLoad.peak) {
        regionLoad.peak = regionLoad.current;
      }

      // Update average load
      regionLoad.average = (regionLoad.average + regionLoad.current) / 2;

      // Update partition
      const partition = this.partitions.get(region);
      if (partition) {
        partition.currentLoad = regionLoad.current;
        partition.updatedAt = Date.now();
      }

    } catch (error) {
      logger.error('Failed to update region load', {
        region,
        operation,
        error: error.message
      });
    }
  }

  /**
   * Start periodic sync
   */
  startSync() {
    setInterval(async () => {
      try {
        await this.performPeriodicSync();
      } catch (error) {
        logger.error('Periodic sync failed', {
          error: error.message
        });
      }
    }, this.options.syncInterval);
  }

  /**
   * Perform periodic sync and cleanup
   */
  async performPeriodicSync() {
    try {
      // Update region statistics
      await this.updateRegionStatistics();

      // Cleanup old data
      await this.cleanupOldData();

      // Rebalance load if needed
      if (this.options.enableLoadBalancing) {
        await this.rebalanceLoad();
      }

      logger.debug('Periodic sync completed');

    } catch (error) {
      logger.error('Failed to perform periodic sync', {
        error: error.message
      });
    }
  }

  /**
   * Update region statistics
   */
  async updateRegionStatistics() {
    for (const [regionId, partition] of this.partitions) {
      try {
        // Update load metrics
        const load = this.regionLoad.get(regionId);
        if (load) {
          // Decay average load over time
          load.average = load.average * 0.9 + load.current * 0.1;
        }

        // Update partition metrics
        partition.updatedAt = Date.now();

      } catch (error) {
        logger.error('Failed to update region statistics', {
          regionId,
          error: error.message
        });
      }
    }
  }

  /**
   * Cleanup old data
   */
  async cleanupOldData() {
    try {
      // Clean up old vote records
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      
      for (const [regionId, partition] of this.partitions) {
        for (const electionId of partition.activeElections) {
          const regionKey = `${this.options.partitionPrefix}${regionId}:${this.options.electionPrefix}${electionId}`;
          
          // Clean up old votes
          const votePattern = `${regionKey}:votes:*`;
          const voteKeys = await this.redis.keys(votePattern);
          
          for (const voteKey of voteKeys) {
            try {
              const voteData = await this.redis.get(voteKey);
              if (voteData) {
                const vote = JSON.parse(voteData);
                if (vote.timestamp < cutoffTime) {
                  await this.redis.del(voteKey);
                }
              }
            } catch (error) {
              // Remove problematic keys
              await this.redis.del(voteKey);
            }
          }
        }
      }

    } catch (error) {
      logger.error('Failed to cleanup old data', {
        error: error.message
      });
    }
  }

  /**
   * Rebalance load across regions
   */
  async rebalanceLoad() {
    try {
      const loadThreshold = 0.8; // 80% capacity threshold
      const overloadedRegions = [];
      const underloadedRegions = [];

      // Find overloaded and underloaded regions
      for (const [regionId, partition] of this.partitions) {
        const utilization = partition.currentLoad / partition.capacity;
        
        if (utilization > loadThreshold) {
          overloadedRegions.push({ regionId, partition, utilization });
        } else if (utilization < 0.5) {
          underloadedRegions.push({ regionId, partition, utilization });
        }
      }

      // Suggest rebalancing if needed
      if (overloadedRegions.length > 0 && underloadedRegions.length > 0) {
        logger.info('Load rebalancing suggested', {
          overloadedRegions: overloadedRegions.map(r => ({ region: r.regionId, utilization: r.utilization })),
          underloadedRegions: underloadedRegions.map(r => ({ region: r.regionId, utilization: r.utilization }))
        });

        this.emit('rebalanceSuggested', {
          overloadedRegions,
          underloadedRegions
        });
      }

    } catch (error) {
      logger.error('Failed to rebalance load', {
        error: error.message
      });
    }
  }

  /**
   * Get geo-partitioning status
   */
  getStatus() {
    return {
      partitions: Object.fromEntries(
        Array.from(this.partitions.entries()).map(([id, partition]) => [
          id,
          {
            name: partition.name,
            country: partition.country,
            capacity: partition.capacity,
            currentLoad: partition.currentLoad,
            utilization: partition.currentLoad / partition.capacity,
            activeElections: partition.activeElections.size,
            status: partition.currentLoad < partition.capacity ? 'healthy' : 'overloaded'
          }
        ])
      ),
      regionLoad: Object.fromEntries(this.regionLoad),
      electionCount: this.electionRegions.size,
      options: {
        enableCrossRegionVoting: this.options.enableCrossRegionVoting,
        enableGeoValidation: this.options.enableGeoValidation,
        enableLoadBalancing: this.options.enableLoadBalancing,
        defaultRegion: this.options.defaultRegion
      },
      timestamp: Date.now()
    };
  }

  /**
   * Get partition statistics
   */
  getPartitionStats() {
    const stats = {
      totalPartitions: this.partitions.size,
      totalElections: this.electionRegions.size,
      totalCapacity: 0,
      totalLoad: 0,
      averageUtilization: 0,
      overloadedPartitions: 0,
      healthyPartitions: 0
    };

    for (const partition of this.partitions.values()) {
      stats.totalCapacity += partition.capacity;
      stats.totalLoad += partition.currentLoad;
      
      const utilization = partition.currentLoad / partition.capacity;
      if (utilization > 0.8) {
        stats.overloadedPartitions++;
      } else {
        stats.healthyPartitions++;
      }
    }

    stats.averageUtilization = stats.totalCapacity > 0 ? stats.totalLoad / stats.totalCapacity : 0;

    return stats;
  }
}

// Create singleton instance
const geoPartitionedElections = new GeoPartitionedElections({
  defaultRegion: 'us-east-1',
  enableCrossRegionVoting: true,
  enableGeoValidation: true,
  enableLoadBalancing: true,
  maxRegionsPerElection: 5,
  replicationLag: 30000,
  syncInterval: 60000
});

module.exports = geoPartitionedElections;
