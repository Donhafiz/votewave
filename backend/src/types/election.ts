/**
 * Election-related type definitions for VoteWave platform
 * Provides type safety for election operations and data structures
 */

export interface Election {
  id: string;
  title: string;
  description?: string;
  type: ElectionType;
  status: ElectionStatus;
  startDate: number;
  endDate: number;
  settings: ElectionSettings;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  region: string;
  timezone: string;
  candidates: Candidate[];
  metadata: ElectionMetadata;
}

export enum ElectionType {
  GENERAL = 'general',
  PRIMARY = 'primary',
  RUNOFF = 'runoff',
  REFERENDUM = 'referendum',
  LOCAL = 'local',
  SPECIAL = 'special'
}

export enum ElectionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived'
}

export interface ElectionSettings {
  allowAnonymous: boolean;
  requireVerification: boolean;
  maxVotesPerVoter: number;
  votingMethod: VotingMethod;
  resultsVisibility: ResultsVisibility;
  eligibility: EligibilityCriteria;
  security: SecuritySettings;
  notifications: NotificationSettings;
  integration: IntegrationSettings;
}

export enum VotingMethod {
  SINGLE = 'single',
  MULTIPLE = 'multiple',
  RANKED = 'ranked',
  APPROVAL = 'approval',
  CONDORCET = 'condorcet'
}

export enum ResultsVisibility {
  IMMEDIATE = 'immediate',
  AFTER_ELECTION = 'after_election',
  AFTER_VERIFICATION = 'after_verification',
  NEVER = 'never',
  CUSTOM = 'custom'
}

export interface EligibilityCriteria {
  minimumAge?: number;
  maximumAge?: number;
  citizenship?: string[];
  residency?: string[];
  registration?: 'required' | 'optional' | 'none';
  qualifications?: string[];
  exclusions?: string[];
  customCriteria?: Record<string, any>;
}

export interface SecuritySettings {
  requireAuthentication: boolean;
  requireMFA: boolean;
  sessionTimeout: number;
  maxAttempts: number;
  lockoutDuration: number;
  ipWhitelist?: string[];
  ipBlacklist?: string[];
  rateLimit: RateLimitSettings;
  fraudDetection: FraudDetectionSettings;
}

export interface RateLimitSettings {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface FraudDetectionSettings {
  enabled: boolean;
  riskThreshold: number;
  blockHighRisk: boolean;
  requireVerification: boolean;
  factors: FraudFactor[];
}

export interface FraudFactor {
  type: 'ip_reputation' | 'device_fingerprint' | 'voting_pattern' | 'location_anomaly' | 'time_anomaly';
  weight: number;
  enabled: boolean;
  threshold?: number;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  reminders: ReminderSettings;
  alerts: AlertSettings;
}

export interface ReminderSettings {
  enabled: boolean;
  schedule: Array<{
    type: 'before_start' | 'before_end' | 'custom';
    offset: number; // minutes/hours before
    channels: Array<'email' | 'sms' | 'push'>;
  }>;
}

export interface AlertSettings {
  enabled: boolean;
  events: Array<'election_started' | 'election_ended' | 'high_turnout' | 'low_turnout' | 'security_incident'>;
  channels: Array<'email' | 'sms' | 'push' | 'webhook'>;
}

export interface IntegrationSettings {
  externalServices: ExternalService[];
  webhooks: WebhookConfig[];
  analytics: AnalyticsConfig;
}

export interface ExternalService {
  name: string;
  type: 'authentication' | 'notification' | 'analytics' | 'storage' | 'payment';
  enabled: boolean;
  config: Record<string, any>;
}

export interface WebhookConfig {
  url: string;
  events: string[];
  secret?: string;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs: number;
}

export interface AnalyticsConfig {
  enabled: boolean;
  tracking: boolean;
  realTime: boolean;
  export: ExportConfig;
}

export interface ExportConfig {
  enabled: boolean;
  format: 'json' | 'csv' | 'xml';
  schedule: string; // cron expression
  destination: string;
}

export interface ElectionMetadata {
  jurisdiction: string;
  authority: string;
  category: string;
  tags: string[];
  documents: ElectionDocument[];
  statistics: ElectionStatistics;
  audit: AuditTrail;
}

export interface ElectionDocument {
  id: string;
  name: string;
  type: 'regulation' | 'procedure' | 'candidate_info' | 'results' | 'other';
  url?: string;
  content?: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  uploadedBy: string;
}

export interface ElectionStatistics {
  totalVoters: number;
  registeredVoters: number;
  totalVotes: number;
  validVotes: number;
  invalidVotes: number;
  turnoutRate: number;
  participationRate: number;
  averageVotingTime: number;
  peakVotingTime: number;
  geographicDistribution: Record<string, number>;
  deviceDistribution: Record<string, number>;
  hourlyDistribution: Record<number, number>;
}

export interface AuditTrail {
  createdBy: string;
  createdAt: number;
  lastModifiedBy: string;
  lastModifiedAt: number;
  changes: AuditChange[];
  approvals: Approval[];
  certifications: Certification[];
}

export interface AuditChange {
  timestamp: number;
  changedBy: string;
  field: string;
  oldValue: any;
  newValue: any;
  reason?: string;
}

export interface Approval {
  approver: string;
  approvedAt: number;
  status: 'approved' | 'rejected' | 'pending';
  comments?: string;
}

export interface Certification {
  authority: string;
  certifiedAt: number;
  expiresAt?: number;
  certificateId: string;
  status: 'valid' | 'expired' | 'revoked';
}

// Candidate Types
export interface Candidate {
  id: string;
  electionId: string;
  name: string;
  party?: string;
  description?: string;
  order: number;
  status: CandidateStatus;
  imageUrl?: string;
  website?: string;
  socialMedia: SocialMediaLinks;
  bio?: string;
  qualifications: string[];
  addedAt: number;
  addedBy: string;
  updatedAt: number;
  metadata: CandidateMetadata;
}

export enum CandidateStatus {
  ACTIVE = 'active',
  WITHDRAWN = 'withdrawn',
  DISQUALIFIED = 'disqualified',
  SUSPENDED = 'suspended'
}

export interface SocialMediaLinks {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  website?: string;
}

export interface CandidateMetadata {
  experience?: string;
  education?: string;
  endorsements?: string[];
  ratings: CandidateRating[];
  contact: ContactInfo;
  financial: FinancialInfo;
}

export interface CandidateRating {
  source: string;
  rating: number;
  maxRating: number;
  description?: string;
  ratedAt: number;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  address?: Address;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface FinancialInfo {
  campaignFunds?: number;
  fundingSource?: string;
  expenditures?: number;
  disclosures?: string[];
}

// Election Creation Types
export interface CreateElectionRequest {
  title: string;
  description?: string;
  type: ElectionType;
  startDate: number;
  endDate: number;
  settings: Partial<ElectionSettings>;
  candidates?: Array<{
    name: string;
    party?: string;
    description?: string;
    order?: number;
  }>;
  metadata?: Partial<ElectionMetadata>;
  createdBy: string;
  region: string;
  timezone: string;
}

export interface CreateElectionResponse {
  success: boolean;
  election?: Election;
  error?: string;
  warnings?: string[];
}

// Election Update Types
export interface UpdateElectionRequest {
  id: string;
  updates: Partial<{
    title: string;
    description: string;
    status: ElectionStatus;
    startDate: number;
    endDate: number;
    settings: Partial<ElectionSettings>;
    metadata: Partial<ElectionMetadata>;
  }>;
  updatedBy: string;
  reason?: string;
}

export interface UpdateElectionResponse {
  success: boolean;
  election?: Election;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  error?: string;
}

// Election Query Types
export interface ElectionQuery {
  id?: string;
  type?: ElectionType;
  status?: ElectionStatus;
  region?: string;
  createdBy?: string;
  startDateAfter?: number;
  startDateBefore?: number;
  endDateAfter?: number;
  endDateBefore?: number;
  search?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'startDate' | 'endDate' | 'title' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface ElectionQueryResponse {
  success: boolean;
  elections: Election[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  error?: string;
}

// Election Management Types
export interface ElectionAction {
  type: 'start' | 'pause' | 'resume' | 'end' | 'cancel' | 'archive' | 'delete';
  electionId: string;
  reason?: string;
  performedBy: string;
  effectiveAt?: number;
}

export interface ElectionActionResult {
  success: boolean;
  election?: Election;
  action: ElectionAction;
  performedAt: number;
  error?: string;
}

// Election Results Types
export interface ElectionResults {
  electionId: string;
  electionTitle: string;
  status: 'preliminary' | 'final' | 'certified';
  generatedAt: number;
  totalVotes: number;
  validVotes: number;
  invalidVotes: number;
  turnoutRate: number;
  participationRate: number;
  candidates: CandidateResult[];
  geographic: GeographicResults;
  temporal: TemporalResults;
  statistics: ResultsStatistics;
  certification?: CertificationInfo;
}

export interface CandidateResult {
  candidateId: string;
  candidateName: string;
  party?: string;
  votes: number;
  percentage: number;
  rank: number;
  winner: boolean;
  tie?: boolean;
  trend?: VoteTrend;
}

export interface VoteTrend {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
}

export interface GeographicResults {
  total: Record<string, number>;
  candidates: Record<string, Record<string, number>>;
  turnout: Record<string, number>;
  participation: Record<string, number>;
}

export interface TemporalResults {
  hourly: Record<number, number>;
  daily: Record<number, number>;
  peak: {
    time: number;
    votes: number;
  };
  average: {
    perHour: number;
    perDay: number;
  };
}

export interface ResultsStatistics {
  averageVotingTime: number;
  peakVotingTime: number;
  deviceDistribution: Record<string, number>;
  methodDistribution: Record<string, number>;
  verificationRate: number;
  fraudDetectionRate: number;
}

export interface CertificationInfo {
  certifiedBy: string;
  certifiedAt: number;
  certificateId: string;
  signature: string;
  hash: string;
}

// Election Analytics Types
export interface ElectionAnalytics {
  electionId: string;
  period: {
    start: number;
    end: number;
  };
  voting: VotingAnalytics;
  participation: ParticipationAnalytics;
  security: SecurityAnalytics;
  performance: PerformanceAnalytics;
  geographic: GeographicBreakdown;
  temporal: TemporalBreakdown;
}

export interface VotingAnalytics {
  totalVotes: number;
  validVotes: number;
  invalidVotes: number;
  averageVotingTime: number;
  votingPatterns: VotingPattern[];
  candidatePerformance: CandidatePerformance[];
}

export interface VotingPattern {
  type: 'early_voter' | 'late_voter' | 'consistent' | 'sporadic';
  count: number;
  percentage: number;
  characteristics: Record<string, any>;
}

export interface CandidatePerformance {
  candidateId: string;
  candidateName: string;
  votes: number;
  percentage: number;
  rank: number;
  trends: PerformanceTrend[];
  demographics: DemographicBreakdown;
  geographic: GeographicBreakdown;
}

export interface PerformanceTrend {
  timestamp: number;
  votes: number;
  percentage: number;
  rank: number;
}

export interface DemographicBreakdown {
  age: Record<string, number>;
  gender: Record<string, number>;
  location: Record<string, number>;
  device: Record<string, number>;
}

export interface GeographicBreakdown {
  country: Record<string, number>;
  state: Record<string, number>;
  city: Record<string, number>;
  coordinates: Array<{
    latitude: number;
    longitude: number;
    votes: number;
  }>;
}

export interface ParticipationAnalytics {
  totalEligible: number;
  totalVoters: number;
  turnoutRate: number;
  participationRate: number;
  demographics: DemographicBreakdown;
  geographic: GeographicBreakdown;
  temporal: TemporalBreakdown;
}

export interface TemporalBreakdown {
  hourly: Record<number, number>;
  daily: Record<number, number>;
  weekly: Record<number, number>;
  peak: {
    hour: number;
    day: number;
    week: number;
  };
}

export interface SecurityAnalytics {
  totalAttempts: number;
  successfulVotes: number;
  blockedAttempts: number;
  fraudDetection: FraudAnalytics;
  suspiciousActivity: SuspiciousActivity[];
  riskAssessment: SecurityRiskAssessment;
}

export interface FraudAnalytics {
  totalFlags: number;
  confirmedFraud: number;
  falsePositives: number;
  riskDistribution: Record<string, number>;
  detectionRates: Record<string, number>;
}

export interface SuspiciousActivity {
  type: string;
  count: number;
  riskLevel: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
}

export interface SecurityRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high';
  riskFactors: SecurityRiskFactor[];
  recommendations: string[];
}

export interface SecurityRiskFactor {
  type: 'unusual_location' | 'multiple_sessions' | 'rapid_voting' | 'suspicious_patterns' | 'time_anomaly';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
  resolved?: boolean;
  resolvedAt?: number;
}

export interface PerformanceAnalytics {
  responseTime: ResponseTimeMetrics;
  throughput: ThroughputMetrics;
  errorRate: ErrorRateMetrics;
  availability: AvailabilityMetrics;
  resource: ResourceMetrics;
}

export interface ResponseTimeMetrics {
  average: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  votesPerSecond: number;
  peakThroughput: number;
  averageThroughput: number;
}

export interface ErrorRateMetrics {
  totalErrors: number;
  errorRate: number;
  errorsByType: Record<string, number>;
  criticalErrors: number;
}

export interface AvailabilityMetrics {
  uptime: number;
  downtime: number;
  availability: number;
  incidents: number;
}

export interface ResourceMetrics {
  cpu: ResourceUsage;
  memory: ResourceUsage;
  disk: ResourceUsage;
  network: ResourceUsage;
}

export interface ResourceUsage {
  average: number;
  peak: number;
  min: number;
  max: number;
}

// Election Export Types
export interface ElectionExportRequest {
  electionId: string;
  format: 'json' | 'csv' | 'xlsx' | 'pdf';
  include: {
    results: boolean;
    analytics: boolean;
    audit: boolean;
    candidates: boolean;
    voters: boolean;
  };
  filters?: {
    dateRange?: {
      start: number;
      end: number;
    };
    geographic?: string[];
    demographics?: string[];
  };
}

export interface ElectionExportResponse {
  success: boolean;
  downloadUrl?: string;
  expiresAt?: number;
  format: string;
  size?: number;
  error?: string;
}
