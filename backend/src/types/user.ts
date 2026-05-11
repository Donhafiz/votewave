/**
 * User-related type definitions for VoteWave platform
 * Provides type safety for user operations and data structures
 */

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  region: string;
  timezone: string;
  preferences: UserPreferences;
  metadata: UserMetadata;
}

export enum UserRole {
  VOTER = 'voter',
  ADMIN = 'admin',
  OBSERVER = 'observer',
  MODERATOR = 'moderator',
  ELECTION_OFFICER = 'election_officer'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
  DELETED = 'deleted'
}

export interface UserPreferences {
  language: string;
  timezone: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  theme: 'light' | 'dark' | 'auto';
  dateFormat: string;
  timeFormat: '12h' | '24h';
  privacy: {
    profileVisibility: 'public' | 'private' | 'friends';
    showVotingHistory: boolean;
    allowAnalytics: boolean;
  };
  accessibility: {
    fontSize: 'small' | 'medium' | 'large';
    highContrast: boolean;
    screenReader: boolean;
  };
}

export interface UserMetadata {
  source: UserSource;
  referralCode?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  sessionId?: string;
  location?: {
    country: string;
    state?: string;
    city?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  security: {
    lastPasswordChange?: number;
    failedLoginAttempts: number;
    lastFailedLogin?: number;
    mfaEnabled: boolean;
    mfaMethods: MFAMethod[];
    trustedDevices: TrustedDevice[];
  };
  analytics: {
    registrationSource?: string;
    campaign?: string;
    utmParameters?: Record<string, string>;
    firstVisitAt?: number;
    totalSessions: number;
    totalVotes: number;
    lastActivityAt?: number;
  };
}

export enum UserSource {
  WEB = 'web',
  MOBILE = 'mobile',
  API = 'api',
  ADMIN = 'admin',
  IMPORT = 'import',
  MIGRATION = 'migration'
}

export enum MFAMethod {
  SMS = 'sms',
  EMAIL = 'email',
  AUTHENTICATOR_APP = 'authenticator_app',
  HARDWARE_TOKEN = 'hardware_token',
  BIOMETRIC = 'biometric'
}

export interface TrustedDevice {
  id: string;
  name: string;
  userAgent?: string;
  ipAddress?: string;
  location?: string;
  trustedAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

// User Creation Types
export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role?: UserRole;
  region?: string;
  preferences?: Partial<UserPreferences>;
  metadata?: Partial<UserMetadata>;
}

export interface CreateUserResponse {
  success: boolean;
  user?: User;
  error?: string;
  requiresVerification?: boolean;
  verificationMethod?: 'email' | 'sms';
}

// User Authentication Types
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
    deviceFingerprint?: string;
  };
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  expiresAt?: number;
  requiresMFA?: boolean;
  mfaMethods?: MFAMethod[];
  error?: string;
}

export interface MFALoginRequest {
  userId: string;
  method: MFAMethod;
  code?: string;
  token?: string;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
    deviceFingerprint?: string;
  };
}

// User Update Types
export interface UpdateUserRequest {
  id: string;
  updates: Partial<{
    firstName: string;
    lastName: string;
    role: UserRole;
    status: UserStatus;
    preferences: Partial<UserPreferences>;
    metadata: Partial<UserMetadata>;
  }>;
  updatedBy: string;
  reason?: string;
}

export interface UpdateUserResponse {
  success: boolean;
  user?: User;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  error?: string;
}

// User Query Types
export interface UserQuery {
  id?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  region?: string;
  createdAfter?: number;
  createdBefore?: number;
  lastActiveAfter?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'email';
  sortOrder?: 'asc' | 'desc';
}

export interface UserQueryResponse {
  success: boolean;
  users: User[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  error?: string;
}

// User Verification Types
export interface VerifyUserRequest {
  userId: string;
  method: 'email' | 'sms';
  code: string;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
  };
}

export interface VerifyUserResponse {
  success: boolean;
  user?: User;
  error?: string;
}

export interface SendVerificationRequest {
  userId: string;
  method: 'email' | 'sms';
  force?: boolean;
}

export interface SendVerificationResponse {
  success: boolean;
  method: string;
  sentAt?: number;
  expiresAt?: number;
  error?: string;
}

// User Security Types
export interface ChangePasswordRequest {
  userId: string;
  currentPassword: string;
  newPassword: string;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
  };
}

export interface ChangePasswordResponse {
  success: boolean;
  changedAt?: number;
  error?: string;
}

export interface ResetPasswordRequest {
  email: string;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
  };
}

export interface ResetPasswordResponse {
  success: boolean;
  resetToken?: string;
  expiresAt?: number;
  error?: string;
}

export interface ConfirmResetPasswordRequest {
  token: string;
  newPassword: string;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
  };
}

export interface ConfirmResetPasswordResponse {
  success: boolean;
  user?: User;
  error?: string;
}

// User Session Types
export interface UserSession {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  createdAt: number;
  expiresAt: number;
  lastAccessAt: number;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  location?: {
    country: string;
    city?: string;
  };
  isActive: boolean;
  revokedAt?: number;
  revokedReason?: string;
}

export interface CreateSessionRequest {
  userId: string;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
    deviceFingerprint?: string;
  };
  rememberMe?: boolean;
}

export interface CreateSessionResponse {
  success: boolean;
  session?: UserSession;
  error?: string;
}

// User Analytics Types
export interface UserAnalytics {
  userId: string;
  totalVotes: number;
  electionsParticipated: number;
  votingHistory: VotingHistory[];
  activityPattern: ActivityPattern;
  engagementMetrics: EngagementMetrics;
  riskProfile: RiskProfile;
}

export interface VotingHistory {
  electionId: string;
  electionTitle: string;
  votedAt: number;
  candidateId: string;
  candidateName: string;
  method: 'online' | 'mobile' | 'in_person';
  location?: string;
  verified: boolean;
  fraudScore: number;
}

export interface ActivityPattern {
  peakHours: number[];
  peakDays: number[];
  averageSessionDuration: number;
  totalSessions: number;
  lastActivityAt: number;
  activityTrend: 'increasing' | 'decreasing' | 'stable';
}

export interface EngagementMetrics {
  loginFrequency: number;
  voteFrequency: number;
  pageViews: number;
  timeSpent: number;
  interactionRate: number;
  retentionScore: number;
}

export interface RiskProfile {
  overallRisk: 'low' | 'medium' | 'high';
  riskFactors: RiskFactor[];
  lastAssessment: number;
  recommendations: string[];
}

export interface RiskFactor {
  type: 'unusual_location' | 'multiple_sessions' | 'rapid_voting' | 'suspicious_patterns';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: number;
  resolved?: boolean;
  resolvedAt?: number;
}

// User Administration Types
export interface BulkUserOperation {
  operation: 'create' | 'update' | 'delete' | 'suspend' | 'activate';
  userIds: string[];
  updates?: Partial<User>;
  reason?: string;
  performedBy: string;
}

export interface BulkUserOperationResponse {
  success: boolean;
  results: Array<{
    userId: string;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

// User Export/Import Types
export interface UserExportRequest {
  format: 'json' | 'csv' | 'xlsx';
  filters?: UserQuery;
  fields?: string[];
  includeMetadata?: boolean;
  includeAnalytics?: boolean;
}

export interface UserExportResponse {
  success: boolean;
  downloadUrl?: string;
  expiresAt?: number;
  recordCount?: number;
  error?: string;
}

export interface UserImportRequest {
  file: string; // File path or URL
  format: 'json' | 'csv' | 'xlsx';
  mapping?: Record<string, string>; // Field mapping
  validateOnly?: boolean;
  updateExisting?: boolean;
  defaultRole?: UserRole;
  defaultRegion?: string;
}

export interface UserImportResponse {
  success: boolean;
  results: ImportResult[];
  summary: {
    total: number;
    imported: number;
    updated: number;
    failed: number;
    duplicates: number;
  };
  errors?: string[];
}

export interface ImportResult {
  row: number;
  userId?: string;
  success: boolean;
  action: 'created' | 'updated' | 'failed';
  error?: string;
  warnings?: string[];
}

// User Search Types
export interface UserSearchRequest {
  query: string;
  fields?: Array<'email' | 'firstName' | 'lastName' | 'role' | 'status'>;
  filters?: UserQuery;
  limit?: number;
  offset?: number;
  highlight?: boolean;
}

export interface UserSearchResponse {
  success: boolean;
  results: Array<{
    user: User;
    score: number;
    highlights?: Record<string, string[]>;
  }>;
  total: number;
  query: string;
  error?: string;
}
