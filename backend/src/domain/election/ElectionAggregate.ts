/**
 * Election Aggregate - Domain Logic for Election Management
 * Enforces election lifecycle rules and maintains election state
 */

import { logger } from '../../utils/logger';
import { DomainEvent } from '../../core/event-store/EventStore';

export interface Candidate {
  id: string;
  name: string;
  party?: string;
  description?: string;
  addedAt: number;
  addedBy: string;
  order: number;
  isActive: boolean;
  metadata?: CandidateMetadata;
}

export interface CandidateMetadata {
  imageUrl?: string;
  website?: string;
  socialMedia?: Record<string, string>;
  qualifications?: string[];
  experience?: string;
}

export interface ElectionSettings {
  allowAnonymous: boolean;
  requireVerification: boolean;
  maxVotesPerVoter: number;
  votingMethod: 'single' | 'multiple' | 'ranked';
  showResults: boolean;
  allowVoteChange: boolean;
  enableFraudDetection: boolean;
  minAge?: number;
  eligibleRegions?: string[];
}

export interface ElectionRules {
  votingStartTime: number;
  votingEndTime: number;
  resultAnnouncementTime?: number;
  candidateRegistrationDeadline: number;
  minCandidates: number;
  maxCandidates: number;
  quorumRequired?: number;
}

export interface ElectionState {
  id: string;
  title: string;
  description: string;
  type: 'general' | 'primary' | 'referendum' | 'local';
  status: 'draft' | 'active' | 'voting' | 'ended' | 'completed' | 'cancelled';
  settings: ElectionSettings;
  rules: ElectionRules;
  candidates: Map<string, Candidate>;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  metadata: ElectionMetadata;
}

export interface ElectionMetadata {
  region: string;
  timezone: string;
  jurisdiction: string;
  electionLevel: 'federal' | 'state' | 'local' | 'organization';
  tags: string[];
  documents: ElectionDocument[];
  certifications: Certification[];
}

export interface ElectionDocument {
  id: string;
  name: string;
  type: 'ballot' | 'regulations' | 'guidelines' | 'results';
  url: string;
  uploadedAt: number;
  uploadedBy: string;
}

export interface Certification {
  id: string;
  type: 'security' | 'fairness' | 'accessibility' | 'compliance';
  issuedBy: string;
  issuedAt: number;
  expiresAt?: number;
  status: 'pending' | 'approved' | 'rejected';
  documents: string[];
}

export class ElectionAggregate {
  private state: ElectionState;

  constructor(electionData: Partial<ElectionState>) {
    this.state = this.getInitialState(electionData);
  }

  /**
   * Get initial state
   */
  private getInitialState(data: Partial<ElectionState>): ElectionState {
    return {
      id: data.id || this.generateElectionId(),
      title: data.title || '',
      description: data.description || '',
      type: data.type || 'general',
      status: 'draft',
      settings: data.settings || this.getDefaultSettings(),
      rules: data.rules || this.getDefaultRules(),
      candidates: new Map(),
      createdBy: data.createdBy || '',
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      version: 0,
      metadata: data.metadata || this.getDefaultMetadata()
    };
  }

  /**
   * Apply event to update aggregate state
   */
  apply(event: DomainEvent): void {
    switch (event.type) {
      case 'ElectionCreated':
        this.applyElectionCreated(event);
        break;
      case 'ElectionUpdated':
        this.applyElectionUpdated(event);
        break;
      case 'ElectionActivated':
        this.applyElectionActivated(event);
        break;
      case 'ElectionStarted':
        this.applyElectionStarted(event);
        break;
      case 'ElectionEnded':
        this.applyElectionEnded(event);
        break;
      case 'ElectionCompleted':
        this.applyElectionCompleted(event);
        break;
      case 'ElectionCancelled':
        this.applyElectionCancelled(event);
        break;
      case 'CandidateAdded':
        this.applyCandidateAdded(event);
        break;
      case 'CandidateRemoved':
        this.applyCandidateRemoved(event);
        break;
      case 'CandidateUpdated':
        this.applyCandidateUpdated(event);
        break;
      case 'ElectionSettingsUpdated':
        this.applyElectionSettingsUpdated(event);
        break;
      case 'ElectionRulesUpdated':
        this.applyElectionRulesUpdated(event);
        break;
      default:
        logger.warn('Unknown event type for ElectionAggregate', { eventType: event.type });
    }

    this.state.version = event.version;
    this.state.updatedAt = event.timestamp;
  }

  /**
   * Create new election
   */
  createElection(title: string, description: string, createdBy: string): ElectionState {
    if (this.state.status !== 'draft') {
      throw new Error('Election already exists');
    }

    this.state.title = title;
    this.state.description = description;
    this.state.createdBy = createdBy;
    this.state.createdAt = Date.now();

    return this.getState();
  }

  /**
   * Update election details
   */
  updateElection(updates: Partial<Pick<ElectionState, 'title' | 'description' | 'type'>>): void {
    if (!this.canUpdateElection()) {
      throw new Error('Cannot update election in current status');
    }

    Object.assign(this.state, updates);
  }

  /**
   * Activate election (make it ready for voting)
   */
  activateElection(): void {
    if (!this.canActivateElection()) {
      throw new Error('Cannot activate election');
    }

    this.state.status = 'active';
  }

  /**
   * Start voting
   */
  startVoting(): void {
    if (!this.canStartVoting()) {
      throw new Error('Cannot start voting');
    }

    this.state.status = 'voting';
  }

  /**
   * End voting
   */
  endVoting(): void {
    if (!this.canEndVoting()) {
      throw new Error('Cannot end voting');
    }

    this.state.status = 'ended';
  }

  /**
   * Complete election
   */
  completeElection(): void {
    if (!this.canCompleteElection()) {
      throw new Error('Cannot complete election');
    }

    this.state.status = 'completed';
  }

  /**
   * Cancel election
   */
  cancelElection(_reason: string): void {
    if (!this.canCancelElection()) {
      throw new Error('Cannot cancel election');
    }

    this.state.status = 'cancelled';
  }

  /**
   * Add candidate
   */
  addCandidate(candidateData: Omit<Candidate, 'id' | 'addedAt' | 'order'>): Candidate {
    if (!this.canManageCandidates()) {
      throw new Error('Cannot manage candidates in current status');
    }

    if (this.state.candidates.size >= this.state.rules.maxCandidates) {
      throw new Error(`Maximum candidates (${this.state.rules.maxCandidates}) reached`);
    }

    const candidate: Candidate = {
      ...candidateData,
      id: this.generateCandidateId(),
      addedAt: Date.now(),
      order: this.state.candidates.size + 1,
      isActive: true
    };

    this.state.candidates.set(candidate.id, candidate);
    return candidate;
  }

  /**
   * Remove candidate
   */
  removeCandidate(candidateId: string): void {
    if (!this.canManageCandidates()) {
      throw new Error('Cannot manage candidates in current status');
    }

    const candidate = this.state.candidates.get(candidateId);
    if (!candidate) {
      throw new Error('Candidate not found');
    }

    if (this.state.status === 'voting') {
      throw new Error('Cannot remove candidate during voting');
    }

    this.state.candidates.delete(candidateId);
  }

  /**
   * Update candidate
   */
  updateCandidate(candidateId: string, updates: Partial<Omit<Candidate, 'id' | 'addedAt' | 'addedBy'>>): Candidate {
    if (!this.canManageCandidates()) {
      throw new Error('Cannot manage candidates in current status');
    }

    const candidate = this.state.candidates.get(candidateId);
    if (!candidate) {
      throw new Error('Candidate not found');
    }

    const updatedCandidate = { ...candidate, ...updates };
    this.state.candidates.set(candidateId, updatedCandidate);
    return updatedCandidate;
  }

  /**
   * Update election settings
   */
  updateSettings(settings: Partial<ElectionSettings>): void {
    if (!this.canUpdateSettings()) {
      throw new Error('Cannot update settings in current status');
    }

    this.state.settings = { ...this.state.settings, ...settings };
  }

  /**
   * Update election rules
   */
  updateRules(rules: Partial<ElectionRules>): void {
    if (!this.canUpdateRules()) {
      throw new Error('Cannot update rules in current status');
    }

    this.state.rules = { ...this.state.rules, ...rules };
  }

  /**
   * Check if election can be updated
   */
  canUpdateElection(): boolean {
    return this.state.status === 'draft' || this.state.status === 'active';
  }

  /**
   * Check if election can be activated
   */
  canActivateElection(): boolean {
    return this.state.status === 'draft' && 
           !!this.state.title &&
           !!this.state.description &&
           this.state.candidates.size >= this.state.rules.minCandidates;
  }

  /**
   * Check if voting can start
   */
  canStartVoting(): boolean {
    const now = Date.now();
    return this.state.status === 'active' && 
           now >= this.state.rules.votingStartTime &&
           this.state.candidates.size >= this.state.rules.minCandidates;
  }

  /**
   * Check if voting can end
   */
  canEndVoting(): boolean {
    const now = Date.now();
    return this.state.status === 'voting' && 
           now >= this.state.rules.votingEndTime;
  }

  /**
   * Check if election can be completed
   */
  canCompleteElection(): boolean {
    return this.state.status === 'ended';
  }

  /**
   * Check if election can be cancelled
   */
  canCancelElection(): boolean {
    return ['draft', 'active', 'voting'].includes(this.state.status);
  }

  /**
   * Check if candidates can be managed
   */
  canManageCandidates(): boolean {
    const now = Date.now();
    return this.state.status !== 'cancelled' && 
           now < this.state.rules.candidateRegistrationDeadline;
  }

  /**
   * Check if settings can be updated
   */
  canUpdateSettings(): boolean {
    return ['draft', 'active'].includes(this.state.status);
  }

  /**
   * Check if rules can be updated
   */
  canUpdateRules(): boolean {
    return this.state.status === 'draft';
  }

  /**
   * Get election statistics
   */
  getStatistics(): ElectionStatistics {
    const activeCandidates = Array.from(this.state.candidates.values()).filter(c => c.isActive);
    
    return {
      id: this.state.id,
      title: this.state.title,
      type: this.state.type,
      status: this.state.status,
      totalCandidates: this.state.candidates.size,
      activeCandidates: activeCandidates.length,
      votingPeriod: {
        start: this.state.rules.votingStartTime,
        end: this.state.rules.votingEndTime,
        registrationDeadline: this.state.rules.candidateRegistrationDeadline,
        ...(this.state.rules.resultAnnouncementTime !== undefined && { resultAnnouncementTime: this.state.rules.resultAnnouncementTime })
      },
      settings: this.state.settings,
      createdBy: this.state.createdBy,
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt,
      version: this.state.version
    };
  }

  /**
   * Get current state
   */
  getState(): ElectionState {
    return { ...this.state };
  }

  /**
   * Get candidates
   */
  getCandidates(): Candidate[] {
    return Array.from(this.state.candidates.values());
  }

  /**
   * Get active candidates
   */
  getActiveCandidates(): Candidate[] {
    return Array.from(this.state.candidates.values()).filter(c => c.isActive);
  }

  /**
   * Get candidate by ID
   */
  getCandidate(candidateId: string): Candidate | undefined {
    return this.state.candidates.get(candidateId);
  }

  /**
   * Rebuild state from events
   */
  rebuildFromEvents(events: DomainEvent[]): void {
    this.state = this.getInitialState({});
    
    for (const event of events) {
      this.apply(event);
    }

    logger.info('ElectionAggregate rebuilt from events', {
      electionId: this.state.id,
      eventCount: events.length,
      finalVersion: this.state.version
    });
  }

  /**
   * Apply ElectionCreated event
   */
  private applyElectionCreated(event: DomainEvent): void {
    const electionData = event.payload;
    Object.assign(this.state, electionData);
    this.state.status = 'draft';
  }

  /**
   * Apply ElectionUpdated event
   */
  private applyElectionUpdated(event: DomainEvent): void {
    const updates = event.payload;
    Object.assign(this.state, updates);
  }

  /**
   * Apply ElectionActivated event
   */
  private applyElectionActivated(_event: DomainEvent): void {
    this.state.status = 'active';
  }

  /**
   * Apply ElectionStarted event
   */
  private applyElectionStarted(_event: DomainEvent): void {
    this.state.status = 'voting';
  }

  /**
   * Apply ElectionEnded event
   */
  private applyElectionEnded(_event: DomainEvent): void {
    this.state.status = 'ended';
  }

  /**
   * Apply ElectionCompleted event
   */
  private applyElectionCompleted(_event: DomainEvent): void {
    this.state.status = 'completed';
  }

  /**
   * Apply ElectionCancelled event
   */
  private applyElectionCancelled(_event: DomainEvent): void {
    this.state.status = 'cancelled';
  }

  /**
   * Apply CandidateAdded event
   */
  private applyCandidateAdded(event: DomainEvent): void {
    const candidate = event.payload;
    this.state.candidates.set(candidate.id, candidate);
  }

  /**
   * Apply CandidateRemoved event
   */
  private applyCandidateRemoved(event: DomainEvent): void {
    const { candidateId } = event.payload;
    this.state.candidates.delete(candidateId);
  }

  /**
   * Apply CandidateUpdated event
   */
  private applyCandidateUpdated(event: DomainEvent): void {
    const { candidateId, updates } = event.payload;
    const candidate = this.state.candidates.get(candidateId);
    if (candidate) {
      const updatedCandidate = { ...candidate, ...updates };
      this.state.candidates.set(candidateId, updatedCandidate);
    }
  }

  /**
   * Apply ElectionSettingsUpdated event
   */
  private applyElectionSettingsUpdated(event: DomainEvent): void {
    this.state.settings = { ...this.state.settings, ...event.payload };
  }

  /**
   * Apply ElectionRulesUpdated event
   */
  private applyElectionRulesUpdated(event: DomainEvent): void {
    this.state.rules = { ...this.state.rules, ...event.payload };
  }

  /**
   * Get default settings
   */
  private getDefaultSettings(): ElectionSettings {
    return {
      allowAnonymous: false,
      requireVerification: true,
      maxVotesPerVoter: 1,
      votingMethod: 'single',
      showResults: false,
      allowVoteChange: false,
      enableFraudDetection: true,
      eligibleRegions: []
    };
  }

  /**
   * Get default rules
   */
  private getDefaultRules(): ElectionRules {
    const now = Date.now();
    return {
      votingStartTime: now + 86400000, // Tomorrow
      votingEndTime: now + (86400000 * 8), // 8 days from now
      candidateRegistrationDeadline: now + (86400000 * 2), // 2 days from now
      minCandidates: 2,
      maxCandidates: 10
    };
  }

  /**
   * Get default metadata
   */
  private getDefaultMetadata(): ElectionMetadata {
    return {
      region: 'us-east-1',
      timezone: 'America/New_York',
      jurisdiction: 'federal',
      electionLevel: 'federal',
      tags: [],
      documents: [],
      certifications: []
    };
  }

  /**
   * Generate election ID
   */
  private generateElectionId(): string {
    return `election_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate candidate ID
   */
  private generateCandidateId(): string {
    return `candidate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export interface ElectionStatistics {
  id: string;
  title: string;
  type: string;
  status: string;
  totalCandidates: number;
  activeCandidates: number;
  votingPeriod: {
    start: number;
    end: number;
    registrationDeadline: number;
    resultAnnouncementTime?: number;
  };
  settings: ElectionSettings;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}
