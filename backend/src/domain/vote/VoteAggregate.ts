/**
 * Vote Aggregate - Domain Logic for Voting Business Rules
 * Enforces voting constraints and maintains voting state
 */

import { logger } from '../../utils/logger';
import { DomainEvent } from '../../core/event-store/EventStore';

export interface Vote {
  id: string;
  userId: string;
  candidateId: string;
  electionId: string;
  timestamp: number;
  isValid: boolean;
  verified: boolean;
  reason?: string;
  metadata?: VoteMetadata;
}

export interface VoteMetadata {
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  location?: string;
  fraudScore?: number;
  verified?: boolean;
  [key: string]: any;
}

export interface VotingRules {
  maxVotesPerVoter: number;
  allowVoteChange: boolean;
  requireVerification: boolean;
  votingStartTime: number;
  votingEndTime: number;
  eligibleRegions?: string[];
  minAge?: number;
  maxFraudScore: number;
}

export interface VotingState {
  votes: Map<string, Vote>; // userId -> Vote
  totalVotes: number;
  validVotes: number;
  invalidVotes: number;
  candidateVoteCounts: Map<string, number>;
  lastUpdated: number;
  version: number;
}

export class VoteAggregate {
  private state: VotingState;
  private electionId: string;
  private rules: VotingRules;

  constructor(electionId: string, rules: VotingRules) {
    this.electionId = electionId;
    this.rules = rules;
    this.state = this.getInitialState();
  }

  /**
   * Get initial state
   */
  private getInitialState(): VotingState {
    return {
      votes: new Map(),
      totalVotes: 0,
      validVotes: 0,
      invalidVotes: 0,
      candidateVoteCounts: new Map(),
      lastUpdated: Date.now(),
      version: 0
    };
  }

  /**
   * Apply event to update aggregate state
   */
  apply(event: DomainEvent): void {
    switch (event.type) {
      case 'VoteCast':
        this.applyVoteCast(event);
        break;
      case 'VoteCancelled':
        this.applyVoteCancelled(event);
        break;
      case 'VoteVerified':
        this.applyVoteVerified(event);
        break;
      case 'VoteInvalidated':
        this.applyVoteInvalidated(event);
        break;
      case 'VotingRulesUpdated':
        this.applyVotingRulesUpdated(event);
        break;
      default:
        logger.warn('Unknown event type for VoteAggregate', { eventType: event.type });
    }

    this.state.version = event.version;
    this.state.lastUpdated = event.timestamp;
  }

  /**
   * Check if user can vote
   */
  canVote(userId: string, candidateId: string): VotingEligibility {
    const now = Date.now();

    // Check voting period
    if (now < this.rules.votingStartTime) {
      return {
        eligible: false,
        reason: 'Voting has not started yet',
        code: 'VOTING_NOT_STARTED'
      };
    }

    if (now > this.rules.votingEndTime) {
      return {
        eligible: false,
        reason: 'Voting has ended',
        code: 'VOTING_ENDED'
      };
    }

    // Check if user already voted
    const existingVote = this.state.votes.get(userId);
    if (existingVote && existingVote.isValid && !this.rules.allowVoteChange) {
      return {
        eligible: false,
        reason: 'User has already voted',
        code: 'ALREADY_VOTED'
      };
    }

    // Check max votes per voter
    const userVotes = Array.from(this.state.votes.values())
      .filter(vote => vote.userId === userId && vote.isValid)
      .length;

    if (userVotes >= this.rules.maxVotesPerVoter) {
      return {
        eligible: false,
        reason: `Maximum votes per voter exceeded (${this.rules.maxVotesPerVoter})`,
        code: 'MAX_VOTES_EXCEEDED'
      };
    }

    // Check candidate eligibility (could be extended)
    if (!this.isCandidateEligible(candidateId)) {
      return {
        eligible: false,
        reason: 'Candidate is not eligible',
        code: 'CANDIDATE_NOT_ELIGIBLE'
      };
    }

    return {
      eligible: true,
      reason: 'User is eligible to vote',
      code: 'ELIGIBLE'
    };
  }

  /**
   * Cast a vote
   */
  castVote(userId: string, candidateId: string, metadata?: VoteMetadata): Vote {
    const eligibility = this.canVote(userId, candidateId);
    
    if (!eligibility.eligible) {
      throw new Error(`Cannot cast vote: ${eligibility.reason}`);
    }

    const vote: Vote = {
      id: this.generateVoteId(userId, candidateId),
      userId,
      candidateId,
      electionId: this.electionId,
      timestamp: Date.now(),
      isValid: true,
      verified: false,
      ...(metadata && { metadata })
    };

    // Apply fraud detection if enabled
    if (this.rules.requireVerification) {
      vote.verified = false;
    }

    return vote;
  }

  /**
   * Cancel a vote
   */
  cancelVote(userId: string, reason?: string): Vote | null {
    const vote = this.state.votes.get(userId);
    
    if (!vote) {
      return null;
    }

    if (!vote.isValid) {
      throw new Error('Cannot cancel invalid vote');
    }

    if (!this.rules.allowVoteChange) {
      throw new Error('Vote changes are not allowed');
    }

    // Mark vote as cancelled
    vote.isValid = false;
    vote.reason = reason || 'User cancelled vote';

    return vote;
  }

  /**
   * Verify a vote
   */
  verifyVote(userId: string): Vote | null {
    const vote = this.state.votes.get(userId);
    
    if (!vote) {
      return null;
    }

    vote.verified = true;
    vote.isValid = true;

    return vote;
  }

  /**
   * Invalidate a vote
   */
  invalidateVote(userId: string, reason: string): Vote | null {
    const vote = this.state.votes.get(userId);
    
    if (!vote) {
      return null;
    }

    vote.isValid = false;
    vote.reason = reason;

    return vote;
  }

  /**
   * Get voting statistics
   */
  getStatistics(): VotingStatistics {
    const candidateResults: Array<{ candidateId: string; votes: number; percentage: number }> = [];
    
    for (const [candidateId, count] of this.state.candidateVoteCounts) {
      const percentage = this.state.validVotes > 0 
        ? (count / this.state.validVotes) * 100 
        : 0;
      
      candidateResults.push({
        candidateId,
        votes: count,
        percentage: Math.round(percentage * 100) / 100
      });
    }

    // Sort by vote count
    candidateResults.sort((a, b) => b.votes - a.votes);

    return {
      electionId: this.electionId,
      totalVotes: this.state.totalVotes,
      validVotes: this.state.validVotes,
      invalidVotes: this.state.invalidVotes,
      uniqueVoters: this.state.votes.size,
      candidateResults,
      votingPeriod: {
        start: this.rules.votingStartTime,
        end: this.rules.votingEndTime,
        isActive: this.isVotingActive()
      },
      lastUpdated: this.state.lastUpdated,
      version: this.state.version
    };
  }

  /**
   * Get vote by user
   */
  getVote(userId: string): Vote | undefined {
    return this.state.votes.get(userId);
  }

  /**
   * Get all votes
   */
  getAllVotes(): Vote[] {
    return Array.from(this.state.votes.values());
  }

  /**
   * Get valid votes only
   */
  getValidVotes(): Vote[] {
    return Array.from(this.state.votes.values()).filter(vote => vote.isValid);
  }

  /**
   * Get votes by candidate
   */
  getVotesByCandidate(candidateId: string): Vote[] {
    return Array.from(this.state.votes.values())
      .filter(vote => vote.candidateId === candidateId);
  }

  /**
   * Check if voting is currently active
   */
  isVotingActive(): boolean {
    const now = Date.now();
    return now >= this.rules.votingStartTime && now <= this.rules.votingEndTime;
  }

  /**
   * Update voting rules
   */
  updateRules(newRules: Partial<VotingRules>): void {
    this.rules = { ...this.rules, ...newRules };
  }

  /**
   * Get current state
   */
  getState(): VotingState {
    return { ...this.state };
  }

  /**
   * Rebuild state from events
   */
  rebuildFromEvents(events: DomainEvent[]): void {
    this.state = this.getInitialState();
    
    for (const event of events) {
      this.apply(event);
    }

    logger.info('VoteAggregate rebuilt from events', {
      electionId: this.electionId,
      eventCount: events.length,
      finalVersion: this.state.version
    });
  }

  /**
   * Apply VoteCast event
   */
  private applyVoteCast(event: DomainEvent): void {
    const vote = event.payload as Vote;
    
    // Remove existing vote if vote changes are allowed
    if (this.rules.allowVoteChange) {
      const existingVote = this.state.votes.get(vote.userId);
      if (existingVote && existingVote.isValid) {
        this.state.candidateVoteCounts.set(
          existingVote.candidateId,
          (this.state.candidateVoteCounts.get(existingVote.candidateId) || 0) - 1
        );
        this.state.validVotes--;
      }
    }

    // Add new vote
    this.state.votes.set(vote.userId, vote);
    this.state.totalVotes++;

    if (vote.isValid) {
      this.state.validVotes++;
      this.state.candidateVoteCounts.set(
        vote.candidateId,
        (this.state.candidateVoteCounts.get(vote.candidateId) || 0) + 1
      );
    } else {
      this.state.invalidVotes++;
    }
  }

  /**
   * Apply VoteCancelled event
   */
  private applyVoteCancelled(event: DomainEvent): void {
    const { userId, reason } = event.payload;
    const vote = this.state.votes.get(userId);
    
    if (vote && vote.isValid) {
      vote.isValid = false;
      vote.reason = reason;
      
      this.state.validVotes--;
      this.state.invalidVotes++;
      
      this.state.candidateVoteCounts.set(
        vote.candidateId,
        (this.state.candidateVoteCounts.get(vote.candidateId) || 0) - 1
      );
    }
  }

  /**
   * Apply VoteVerified event
   */
  private applyVoteVerified(event: DomainEvent): void {
    const { userId } = event.payload;
    const vote = this.state.votes.get(userId);
    
    if (vote && !vote.isValid && vote.reason !== 'User cancelled vote') {
      vote.isValid = true;
      vote.verified = true;
      delete vote.reason;
      
      this.state.validVotes++;
      this.state.invalidVotes--;
      
      this.state.candidateVoteCounts.set(
        vote.candidateId,
        (this.state.candidateVoteCounts.get(vote.candidateId) || 0) + 1
      );
    }
  }

  /**
   * Apply VoteInvalidated event
   */
  private applyVoteInvalidated(event: DomainEvent): void {
    const { userId, reason } = event.payload;
    const vote = this.state.votes.get(userId);
    
    if (vote && vote.isValid) {
      vote.isValid = false;
      vote.reason = reason;
      
      this.state.validVotes--;
      this.state.invalidVotes++;
      
      this.state.candidateVoteCounts.set(
        vote.candidateId,
        (this.state.candidateVoteCounts.get(vote.candidateId) || 0) - 1
      );
    }
  }

  /**
   * Apply VotingRulesUpdated event
   */
  private applyVotingRulesUpdated(event: DomainEvent): void {
    this.updateRules(event.payload);
  }

  /**
   * Check if candidate is eligible
   */
  private isCandidateEligible(_candidateId: string): boolean {
    // This could be extended to check candidate status, etc.
    return true;
  }

  /**
   * Generate vote ID
   */
  private generateVoteId(userId: string, candidateId: string): string {
    return `vote_${this.electionId}_${userId}_${candidateId}_${Date.now()}`;
  }
}

export interface VotingEligibility {
  eligible: boolean;
  reason: string;
  code: string;
}

export interface VotingStatistics {
  electionId: string;
  totalVotes: number;
  validVotes: number;
  invalidVotes: number;
  uniqueVoters: number;
  candidateResults: Array<{
    candidateId: string;
    votes: number;
    percentage: number;
  }>;
  votingPeriod: {
    start: number;
    end: number;
    isActive: boolean;
  };
  lastUpdated: number;
  version: number;
}
