# ADR-005: Geo-Partitioning Strategy

## Status
Accepted

## Context
VoteWave requires geo-partitioning to support:

* Low-latency voting experience for global users
* Data residency and compliance requirements
* Regional fault isolation and disaster recovery
* Load distribution across geographic regions
* Scalable architecture for international elections

## Decision
We implement geo-partitioning with the following characteristics:

### Partitioning Strategy
1. **Geographic Partitioning**: Data partitioned by user location and election region
2. **Regional Ownership**: Each region owns its data with cross-region replication
3. **Locality-Aware Routing**: Requests routed to nearest appropriate region
4. **Cross-Region Voting**: Controlled voting across geographic boundaries
5. **Load-Aware Distribution**: Dynamic load balancing across regions

### Region Definitions
```javascript
const regions = {
  'us-east-1': {
    name: 'US East (N. Virginia)',
    coordinates: { lat: 39.0458, lng: -77.6413 },
    countries: ['US', 'CA', 'MX'],
    capacity: 10000,
    latency: { 'us-west-2': 70, 'eu-west-1': 80, 'ap-southeast-1': 180 }
  },
  'us-west-2': {
    name: 'US West (Oregon)',
    coordinates: { lat: 45.5152, lng: -122.6784 },
    countries: ['US'],
    capacity: 8000,
    latency: { 'us-east-1': 70, 'eu-west-1': 150, 'ap-southeast-1': 120 }
  },
  'eu-west-1': {
    name: 'EU West (Ireland)',
    coordinates: { lat: 53.4091, lng: -8.2419 },
    countries: ['GB', 'DE', 'FR', 'ES', 'IT', 'NL'],
    capacity: 6000,
    latency: { 'us-east-1': 80, 'us-west-2': 150, 'ap-southeast-1': 200 }
  },
  'ap-southeast-1': {
    name: 'Asia Pacific (Singapore)',
    coordinates: { lat: 1.3521, lng: 103.8198 },
    countries: ['SG', 'JP', 'AU', 'IN', 'MY', 'TH'],
    capacity: 5000,
    latency: { 'us-east-1': 180, 'us-west-2': 120, 'eu-west-1': 200 }
  }
};
```

### Partitioning Rules
1. **User-Based Partitioning**: Users assigned to nearest region
2. **Election-Based Partitioning**: Elections created in specific regions
3. **Vote-Based Partitioning**: Votes stored in election's primary region
4. **Cross-Region Rules**: Controlled cross-region access policies
5. **Load Balancing**: Dynamic load-based region selection

## Consequences

### Positive
- **Reduced Latency**: Users experience lower response times
- **Data Compliance**: Regional data residency requirements met
- **Fault Isolation**: Regional failures don't affect other regions
- **Load Distribution**: Traffic distributed across multiple regions
- **Scalability**: Independent scaling per region

### Negative
- **Complexity**: Increased system complexity and operational overhead
- **Cross-Region Latency**: Cross-region operations have higher latency
- **Data Consistency**: Eventual consistency across regions
- **Cost**: Multiple regions increase infrastructure costs
- **Operational Overhead**: More complex monitoring and management

### Risks
- **Partition Imbalance**: Uneven load distribution across regions
- **Cross-Region Failures**: Network issues affecting cross-region operations
- **Data Inconsistency**: Inconsistent state across regions
- **Compliance Violations**: Data residency requirement violations
- **Performance Degradation**: Increased latency for cross-region operations

## Implementation Details

### Geo-Partitioning Service
```javascript
class GeoPartitioningService {
  constructor() {
    this.regions = regions;
    this.userRegionMapping = new Map();
    this.electionRegionMapping = new Map();
    this.loadBalancer = new LoadBalancer();
  }

  async assignUserRegion(userId, userLocation) {
    // Determine best region for user
    const bestRegion = this.selectBestRegion(userLocation);
    
    // Store mapping
    this.userRegionMapping.set(userId, bestRegion);
    
    // Update load balancer
    await this.loadBalancer.incrementLoad(bestRegion);
    
    return bestRegion;
  }

  async createElectionInRegion(electionData, creatorRegion) {
    // Select optimal regions for election
    const targetRegions = await this.selectElectionRegions(electionData);
    
    // Create election in primary region
    const primaryRegion = targetRegions[0];
    const election = await this.createElection(primaryRegion, electionData);
    
    // Replicate to secondary regions
    for (const region of targetRegions.slice(1)) {
      await this.replicateElection(region, election);
    }
    
    // Store mapping
    this.electionRegionMapping.set(election.id, {
      primary: primaryRegion,
      replicas: targetRegions.slice(1)
    });
    
    return election;
  }

  async routeVote(voteData) {
    // Get user's assigned region
    const userRegion = this.userRegionMapping.get(voteData.userId);
    
    // Get election's primary region
    const electionRegions = this.electionRegionMapping.get(voteData.electionId);
    
    // Determine optimal voting region
    const votingRegion = this.selectVotingRegion(
      userRegion, 
      electionRegions.primary,
      voteData
    );
    
    // Route vote to appropriate region
    return await this.castVoteInRegion(votingRegion, voteData);
  }

  selectBestRegion(userLocation) {
    const candidateRegions = this.getRegionsForCountry(userLocation.country);
    
    if (candidateRegions.length === 0) {
      return this.getDefaultRegion();
    }
    
    // Select based on distance and load
    let bestRegion = candidateRegions[0];
    let bestScore = this.calculateRegionScore(bestRegion, userLocation);
    
    for (const region of candidateRegions.slice(1)) {
      const score = this.calculateRegionScore(region, userLocation);
      if (score > bestScore) {
        bestScore = score;
        bestRegion = region;
      }
    }
    
    return bestRegion;
  }

  calculateRegionScore(region, userLocation) {
    const distance = this.calculateDistance(
      region.coordinates,
      userLocation.coordinates
    );
    
    const load = this.loadBalancer.getLoad(region.id);
    const capacity = region.capacity;
    const utilization = load / capacity;
    
    // Score based on distance (lower is better) and load (lower is better)
    const distanceScore = Math.max(0, 1 - (distance / 20000)); // 20,000 km max
    const loadScore = Math.max(0, 1 - utilization);
    
    return (distanceScore * 0.6) + (loadScore * 0.4);
  }
}
```

### Load Balancer
```javascript
class LoadBalancer {
  constructor() {
    this.regionLoads = new Map();
    this.loadHistory = new Map();
  }

  async incrementLoad(regionId, load = 1) {
    const currentLoad = this.regionLoads.get(regionId) || 0;
    this.regionLoads.set(regionId, currentLoad + load);
    
    // Record in history
    if (!this.loadHistory.has(regionId)) {
      this.loadHistory.set(regionId, []);
    }
    
    const history = this.loadHistory.get(regionId);
    history.push({
      timestamp: Date.now(),
      load: currentLoad + load
    });
    
    // Keep only last 24 hours of history
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    const filtered = history.filter(h => h.timestamp > cutoff);
    this.loadHistory.set(regionId, filtered);
  }

  getLoad(regionId) {
    return this.regionLoads.get(regionId) || 0;
  }

  getAverageLoad(regionId, timeWindow = 3600000) { // 1 hour
    const history = this.loadHistory.get(regionId) || [];
    const cutoff = Date.now() - timeWindow;
    
    const recent = history.filter(h => h.timestamp > cutoff);
    
    if (recent.length === 0) {
      return 0;
    }
    
    return recent.reduce((sum, h) => sum + h.load, 0) / recent.length;
  }

  selectLeastLoadedRegion(candidateRegions) {
    let bestRegion = candidateRegions[0];
    let lowestLoad = this.getAverageLoad(bestRegion);
    
    for (const region of candidateRegions.slice(1)) {
      const load = this.getAverageLoad(region);
      if (load < lowestLoad) {
        lowestLoad = load;
        bestRegion = region;
      }
    }
    
    return bestRegion;
  }
}
```

### Cross-Region Validator
```javascript
class CrossRegionValidator {
  constructor() {
    this.crossRegionPolicies = new Map();
    this.initializePolicies();
  }

  initializePolicies() {
    // Allow cross-region voting for expatriates
    this.crossRegionPolicies.set('expatriate_voting', {
      enabled: true,
      maxDistance: 5000, // 5000 km
      requiredVerification: true,
      additionalChecks: ['document_verification', 'residency_proof']
    });

    // Allow cross-region voting for diplomatic staff
    this.crossRegionPolicies.set('diplomatic_voting', {
      enabled: true,
      maxDistance: Infinity,
      requiredVerification: true,
      additionalChecks: ['diplomatic_status', 'embassy_verification']
    });

    // Allow cross-region voting for military personnel
    this.crossRegionPolicies.set('military_voting', {
      enabled: true,
      maxDistance: Infinity,
      requiredVerification: true,
      additionalChecks: ['military_status', 'deployment_verification']
    });
  }

  async validateCrossRegionVote(voteData, userRegion, electionRegion) {
    // Same region - always allowed
    if (userRegion === electionRegion) {
      return { allowed: true, reason: 'same_region' };
    }

    // Check distance
    const distance = this.calculateRegionDistance(userRegion, electionRegion);
    
    // Get user eligibility
    const userEligibility = await this.getUserEligibility(voteData.userId);
    
    // Check applicable policies
    for (const [policyName, policy] of this.crossRegionPolicies) {
      if (!policy.enabled) continue;
      
      if (this.userMatchesPolicy(userEligibility, policyName)) {
        if (distance <= policy.maxDistance) {
          // Perform additional checks
          const additionalChecks = await this.performAdditionalChecks(
            voteData.userId,
            policy.additionalChecks
          );
          
          if (additionalChecks.passed) {
            return {
              allowed: true,
              reason: policyName,
              policy: policy,
              checks: additionalChecks
            };
          }
        }
      }
    }

    // Default: deny cross-region voting
    return {
      allowed: false,
      reason: 'cross_region_not_allowed',
      distance,
      userEligibility
    };
  }

  async getUserEligibility(userId) {
    // This would integrate with user service
    return {
      userId,
      userType: 'citizen',
      residency: 'domestic',
      specialStatus: null,
      verifiedDocuments: ['passport', 'id_card']
    };
  }

  userMatchesPolicy(userEligibility, policyName) {
    switch (policyName) {
      case 'expatriate_voting':
        return userEligibility.residency === 'expatriate';
      case 'diplomatic_voting':
        return userEligibility.specialStatus === 'diplomatic';
      case 'military_voting':
        return userEligibility.specialStatus === 'military';
      default:
        return false;
    }
  }
}
```

### Regional Data Manager
```javascript
class RegionalDataManager {
  constructor() {
    this.regionConnections = new Map();
    this.replicationManager = new ReplicationManager();
  }

  async initializeRegion(regionId) {
    const connection = await this.connectToRegion(regionId);
    this.regionConnections.set(regionId, connection);
    
    // Start replication streams
    await this.replicationManager.startReplication(regionId);
  }

  async storeDataInRegion(regionId, key, data, consistency = 'eventual') {
    const connection = this.regionConnections.get(regionId);
    
    if (!connection) {
      throw new Error(`No connection to region: ${regionId}`);
    }

    // Store in primary region
    await connection.set(key, JSON.stringify(data));
    
    // Replicate to other regions based on consistency level
    if (consistency === 'strong') {
      await this.replicationManager.replicateSync(regionId, key, data);
    } else {
      this.replicationManager.replicateAsync(regionId, key, data);
    }
  }

  async getDataFromRegion(regionId, key) {
    const connection = this.regionConnections.get(regionId);
    
    if (!connection) {
      throw new Error(`No connection to region: ${regionId}`);
    }

    const data = await connection.get(key);
    return data ? JSON.parse(data) : null;
  }

  async replicateData(sourceRegion, targetRegions, key, data) {
    const replicationPromises = [];
    
    for (const targetRegion of targetRegions) {
      const promise = this.replicateToRegion(
        sourceRegion,
        targetRegion,
        key,
        data
      );
      replicationPromises.push(promise);
    }

    const results = await Promise.allSettled(replicationPromises);
    
    return {
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results
    };
  }
}
```

## Performance Considerations

### Latency Optimization
- **Region Selection**: Optimize region selection algorithms
- **Connection Pooling**: Maintain connection pools to all regions
- **Caching**: Multi-level caching with regional invalidation
- **Compression**: Compress cross-region data transfers

### Load Balancing
- **Dynamic Load Balancing**: Real-time load-based routing
- **Predictive Scaling**: Predictive scaling based on patterns
- **Load Distribution**: Even load distribution across regions
- **Failover Handling**: Graceful failover during overload

### Data Replication
- **Batch Replication**: Batch multiple updates together
- **Delta Replication**: Only replicate changed data
- **Priority Queuing**: Prioritize critical data replication
- **Compression**: Compress replicated data

## Monitoring and Observability

### Regional Metrics
- Request latency per region
- Load distribution across regions
- Cross-region request rate
- Data replication lag
- Regional error rates

### Alerting
- Region overload conditions
- Cross-region failures
- Replication lag exceeding thresholds
- Load imbalance across regions
- Regional service degradation

### Tracing
- Cross-region request tracing
- Replication operation tracing
- Load balancing decision tracing
- Geo-routing decision tracing

## Security and Compliance

### Data Residency
- **Regional Storage**: Store data in compliant regions
- **Cross-Border Transfer**: Control cross-border data transfers
- **Compliance Monitoring**: Monitor compliance with regulations
- **Audit Logging**: Log all cross-region operations

### Access Control
- **Regional Access**: Control access by region
- **Cross-Region Permissions**: Manage cross-region access permissions
- **User Authentication**: Regional authentication policies
- **Data Encryption**: Encrypt data in transit and at rest

## Disaster Recovery

### Regional Failover
- **Automatic Failover**: Automatic failover to healthy regions
- **Manual Override**: Manual failover capabilities
- **Graceful Degradation**: Service degradation during failover
- **Recovery Procedures**: Regional recovery procedures

### Data Recovery
- **Cross-Region Backup**: Backup data across regions
- **Point-in-Time Recovery**: Point-in-time recovery capabilities
- **Consistency Validation**: Validate data consistency post-recovery
- **Service Restoration**: Restore services from backups

## Future Considerations

### Advanced Features
- **Dynamic Partitioning**: Dynamic partition adjustment
- **AI-Powered Routing**: AI-powered request routing
- **Edge Computing**: Edge processing for reduced latency
- **Smart Load Balancing**: Machine learning-based load balancing

### Performance Enhancements
- **Regional Caching**: Advanced regional caching strategies
- **Connection Optimization**: Optimized cross-region connections
- **Data Compression**: Advanced data compression algorithms
- **Parallel Processing**: Parallel cross-region operations

### Operational Improvements
- **Automated Scaling**: Automated regional scaling
- **Predictive Analytics**: Predictive analytics for capacity planning
- **Chaos Engineering**: Regional chaos testing
- **Performance Testing**: Regional performance testing

## Related ADRs
- ADR-001: Event-Driven Architecture
- ADR-002: CQRS Implementation
- ADR-003: Multi-Region Replication
- ADR-004: Event Sourcing Strategy
