/**
 * User Aggregate - Domain Logic for User Management
 * Enforces user lifecycle rules and maintains user state
 */

import { logger } from '../../utils/logger';
import { DomainEvent } from '../../core/event-store/EventStore';

export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  mfaEnabled: boolean;
  profile: UserProfile;
  preferences: UserPreferences;
  metadata: UserMetadata;
  version: number;
}

export interface UserProfile {
  dateOfBirth?: number;
  address?: Address;
  phone?: string;
  avatar?: string;
  bio?: string;
  socialLinks?: SocialMediaLinks;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface SocialMediaLinks {
  twitter?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  twoFactorAuth: boolean;
  privacy: PrivacySettings;
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'private' | 'friends';
  showEmail: boolean;
  showPhone: boolean;
  allowDirectMessages: boolean;
  allowSearch: boolean;
}

export interface UserMetadata {
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  location?: string;
  registrationSource: 'web' | 'mobile' | 'api' | 'admin';
  referrer?: string;
  campaign?: string;
  riskScore: number;
  lastActivityAt: number;
  loginAttempts: number;
  lockedUntil?: number;
}

export interface MFASetup {
  enabled: boolean;
  secret?: string;
  backupCodes?: string[];
  phoneNumber?: string;
  email?: string;
  method: 'totp' | 'sms' | 'email';
}

export interface UserSession {
  id: string;
  userId: string;
  createdAt: number;
  lastActivityAt: number;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
  deviceFingerprint?: string;
}

export interface UserActivity {
  id: string;
  userId: string;
  type: 'login' | 'logout' | 'vote' | 'profile_update' | 'password_change' | 'mfa_setup';
  timestamp: number;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
}

export type UserRole = 'voter' | 'admin' | 'moderator' | 'election_official' | 'observer';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'locked' | 'deleted';

export interface UserState {
  user: User;
  sessions: Map<string, UserSession>;
  activities: UserActivity[];
  mfaSetup: MFASetup;
  version: number;
}

export class UserAggregate {
  private state: UserState;

  constructor(userData: Partial<User>) {
    this.state = this.getInitialState(userData);
  }

  /**
   * Get initial state
   */
  private getInitialState(userData: Partial<User>): UserState {
    const now = Date.now();
    
    return {
      user: {
        id: userData.id || this.generateUserId(),
        email: userData.email || '',
        username: userData.username || '',
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        role: userData.role || 'voter',
        status: userData.status || 'active',
        createdAt: userData.createdAt || now,
        updatedAt: userData.updatedAt || now,
        emailVerified: userData.emailVerified || false,
        phoneVerified: userData.phoneVerified || false,
        mfaEnabled: userData.mfaEnabled || false,
        profile: userData.profile || {},
        preferences: userData.preferences || this.getDefaultPreferences(),
        metadata: userData.metadata || this.getDefaultMetadata(),
        version: 1
      },
      sessions: new Map(),
      activities: [],
      mfaSetup: {
        enabled: false,
        method: 'totp'
      },
      version: 0
    };
  }

  /**
   * Apply event to update aggregate state
   */
  apply(event: DomainEvent): void {
    switch (event.type) {
      case 'UserRegistered':
        this.applyUserRegistered(event);
        break;
      case 'UserUpdated':
        this.applyUserUpdated(event);
        break;
      case 'UserActivated':
        this.applyUserActivated(event);
        break;
      case 'UserDeactivated':
        this.applyUserDeactivated(event);
        break;
      case 'UserSuspended':
        this.applyUserSuspended(event);
        break;
      case 'UserLocked':
        this.applyUserLocked(event);
        break;
      case 'UserUnlocked':
        this.applyUserUnlocked(event);
        break;
      case 'UserDeleted':
        this.applyUserDeleted(event);
        break;
      case 'EmailVerified':
        this.applyEmailVerified(event);
        break;
      case 'PhoneVerified':
        this.applyPhoneVerified(event);
        break;
      case 'PasswordChanged':
        this.applyPasswordChanged(event);
        break;
      case 'MFACreated':
        this.applyMFACreated(event);
        break;
      case 'MFAEnabled':
        this.applyMFAEnabled(event);
        break;
      case 'MFADisabled':
        this.applyMFADisabled(event);
        break;
      case 'UserLoggedIn':
        this.applyUserLoggedIn(event);
        break;
      case 'UserLoggedOut':
        this.applyUserLoggedOut(event);
        break;
      case 'UserProfileUpdated':
        this.applyUserProfileUpdated(event);
        break;
      case 'UserPreferencesUpdated':
        this.applyUserPreferencesUpdated(event);
        break;
      default:
        logger.warn('Unknown event type for UserAggregate', { eventType: event.type });
    }

    this.state.version = event.version;
    this.state.user.updatedAt = event.timestamp;
  }

  /**
   * Register new user
   */
  registerUser(userData: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
    metadata?: Partial<UserMetadata>;
  }): User {
    if (this.state.user.id && this.state.user.status !== 'deleted') {
      throw new Error('User already exists');
    }

    this.state.user = {
      ...this.state.user,
      ...userData,
      role: userData.role || 'voter',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        ...this.state.user.metadata,
        ...userData.metadata,
        registrationSource: userData.metadata?.registrationSource || 'web',
        riskScore: 0,
        loginAttempts: 0,
        lastActivityAt: Date.now()
      }
    };

    return this.state.user;
  }

  /**
   * Update user information
   */
  updateUser(updates: Partial<Pick<User, 'firstName' | 'lastName' | 'username'>>): void {
    if (!this.canUpdateUser()) {
      throw new Error('Cannot update user in current status');
    }

    Object.assign(this.state.user, updates);
  }

  /**
   * Activate user
   */
  activateUser(): void {
    if (this.state.user.status === 'deleted') {
      throw new Error('Cannot activate deleted user');
    }

    this.state.user.status = 'active';
    delete this.state.user.metadata.lockedUntil;
  }

  /**
   * Deactivate user
   */
  deactivateUser(): void {
    if (!this.canDeactivateUser()) {
      throw new Error('Cannot deactivate user in current status');
    }

    this.state.user.status = 'inactive';
    this.terminateAllSessions();
  }

  /**
   * Suspend user
   */
  suspendUser(_reason: string, duration?: number): void {
    if (!this.canSuspendUser()) {
      throw new Error('Cannot suspend user in current status');
    }

    this.state.user.status = 'suspended';
    this.terminateAllSessions();

    if (duration) {
      this.state.user.metadata.lockedUntil = Date.now() + duration;
    }
  }

  /**
   * Lock user
   */
  lockUser(_reason: string, duration?: number): void {
    if (this.state.user.status === 'deleted') {
      throw new Error('Cannot lock deleted user');
    }

    this.state.user.status = 'locked';
    this.terminateAllSessions();

    if (duration) {
      this.state.user.metadata.lockedUntil = Date.now() + duration;
    }
  }

  /**
   * Unlock user
   */
  unlockUser(): void {
    if (this.state.user.status !== 'locked') {
      throw new Error('User is not locked');
    }

    this.state.user.status = 'active';
    delete this.state.user.metadata.lockedUntil;
    this.state.user.metadata.loginAttempts = 0;
  }

  /**
   * Delete user
   */
  deleteUser(): void {
    this.state.user.status = 'deleted';
    this.terminateAllSessions();
    
    // Clear sensitive data
    this.state.user.email = '';
    this.state.user.profile = {};
    this.state.user.preferences = this.getDefaultPreferences();
  }

  /**
   * Verify email
   */
  verifyEmail(): void {
    this.state.user.emailVerified = true;
  }

  /**
   * Verify phone
   */
  verifyPhone(): void {
    this.state.user.phoneVerified = true;
  }

  /**
   * Change password
   */
  changePassword(): void {
    // Invalidate all sessions except current one
    this.terminateAllSessions();
    
    // Add activity
    this.addActivity({
      type: 'password_change',
      timestamp: Date.now(),
      ipAddress: '',
      userAgent: ''
    });
  }

  /**
   * Create MFA setup
   */
  createMFASetup(method: 'totp' | 'sms' | 'email', secret?: string): void {
    this.state.mfaSetup = {
      enabled: false,
      method,
      backupCodes: [],
      ...(secret !== undefined && { secret })
    };
  }

  /**
   * Enable MFA
   */
  enableMFA(): void {
    if (!this.state.mfaSetup.secret) {
      throw new Error('MFA setup not completed');
    }

    this.state.mfaSetup.enabled = true;
    this.state.user.mfaEnabled = true;
  }

  /**
   * Disable MFA
   */
  disableMFA(): void {
    this.state.mfaSetup.enabled = false;
    this.state.user.mfaEnabled = false;
    delete this.state.mfaSetup.secret;
    this.state.mfaSetup.backupCodes = [];
  }

  /**
   * Login user
   */
  loginUser(sessionData: {
    ipAddress: string;
    userAgent: string;
    deviceFingerprint?: string;
  }): UserSession {
    if (!this.canLogin()) {
      throw new Error('User cannot login in current status');
    }

    const session: UserSession = {
      id: this.generateSessionId(),
      userId: this.state.user.id,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      ipAddress: sessionData.ipAddress,
      userAgent: sessionData.userAgent,
      isActive: true,
      ...(sessionData.deviceFingerprint !== undefined && { deviceFingerprint: sessionData.deviceFingerprint })
    };

    this.state.sessions.set(session.id, session);
    this.state.user.lastLoginAt = Date.now();
    this.state.user.metadata.lastActivityAt = Date.now();
    this.state.user.metadata.loginAttempts = 0;

    // Add activity
    this.addActivity({
      type: 'login',
      timestamp: Date.now(),
      ipAddress: sessionData.ipAddress,
      userAgent: sessionData.userAgent,
      metadata: { sessionId: session.id }
    });

    return session;
  }

  /**
   * Logout user
   */
  logoutUser(sessionId: string): void {
    const session = this.state.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.isActive = false;
    this.state.sessions.delete(sessionId);

    // Add activity
    this.addActivity({
      type: 'logout',
      timestamp: Date.now(),
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      metadata: { sessionId }
    });
  }

  /**
   * Update profile
   */
  updateProfile(profileUpdates: Partial<UserProfile>): void {
    if (!this.canUpdateProfile()) {
      throw new Error('Cannot update profile in current status');
    }

    this.state.user.profile = { ...this.state.user.profile, ...profileUpdates };
  }

  /**
   * Update preferences
   */
  updatePreferences(preferencesUpdates: Partial<UserPreferences>): void {
    this.state.user.preferences = { ...this.state.user.preferences, ...preferencesUpdates };
  }

  /**
   * Record failed login attempt
   */
  recordFailedLogin(): void {
    this.state.user.metadata.loginAttempts++;
    
    if (this.state.user.metadata.loginAttempts >= 5) {
      this.lockUser('Too many failed login attempts', 15 * 60 * 1000); // 15 minutes
    }
  }

  /**
   * Get current state
   */
  getState(): UserState {
    return { ...this.state };
  }

  /**
   * Get user data
   */
  getUser(): User {
    return { ...this.state.user };
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): UserSession[] {
    return Array.from(this.state.sessions.values()).filter(s => s.isActive);
  }

  /**
   * Get user activities
   */
  getActivities(limit?: number): UserActivity[] {
    const activities = this.state.activities.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? activities.slice(0, limit) : activities;
  }

  /**
   * Check if user can update profile
   */
  canUpdateProfile(): boolean {
    return ['active', 'inactive'].includes(this.state.user.status);
  }

  /**
   * Check if user can login
   */
  canLogin(): boolean {
    const now = Date.now();
    
    if (this.state.user.status === 'deleted') {
      return false;
    }

    if (this.state.user.status === 'locked') {
      const lockedUntil = this.state.user.metadata.lockedUntil;
      if (lockedUntil && now < lockedUntil) {
        return false;
      }
    }

    return this.state.user.status !== 'suspended';
  }

  /**
   * Check if user can be updated
   */
  canUpdateUser(): boolean {
    return !['deleted', 'locked'].includes(this.state.user.status);
  }

  /**
   * Check if user can be deactivated
   */
  canDeactivateUser(): boolean {
    return ['active', 'suspended'].includes(this.state.user.status);
  }

  /**
   * Check if user can be suspended
   */
  canSuspendUser(): boolean {
    return ['active', 'inactive'].includes(this.state.user.status);
  }

  /**
   * Rebuild state from events
   */
  rebuildFromEvents(events: DomainEvent[]): void {
    this.state = this.getInitialState({});
    
    for (const event of events) {
      this.apply(event);
    }

    logger.info('UserAggregate rebuilt from events', {
      userId: this.state.user.id,
      eventCount: events.length,
      finalVersion: this.state.version
    });
  }

  /**
   * Apply UserRegistered event
   */
  private applyUserRegistered(event: DomainEvent): void {
    const userData = event.payload;
    this.state.user = { ...this.state.user, ...userData };
  }

  /**
   * Apply UserUpdated event
   */
  private applyUserUpdated(event: DomainEvent): void {
    const updates = event.payload;
    Object.assign(this.state.user, updates);
  }

  /**
   * Apply UserActivated event
   */
  private applyUserActivated(_event: DomainEvent): void {
    this.state.user.status = 'active';
    delete this.state.user.metadata.lockedUntil;
  }

  /**
   * Apply UserDeactivated event
   */
  private applyUserDeactivated(_event: DomainEvent): void {
    this.state.user.status = 'inactive';
  }

  /**
   * Apply UserSuspended event
   */
  private applyUserSuspended(_event: DomainEvent): void {
    this.state.user.status = 'suspended';
    this.terminateAllSessions();
  }

  /**
   * Apply UserLocked event
   */
  private applyUserLocked(_event: DomainEvent): void {
    this.state.user.status = 'locked';
    this.terminateAllSessions();
  }

  /**
   * Apply UserUnlocked event
   */
  private applyUserUnlocked(_event: DomainEvent): void {
    this.state.user.status = 'active';
    delete this.state.user.metadata.lockedUntil;
  }

  /**
   * Apply UserDeleted event
   */
  private applyUserDeleted(_event: DomainEvent): void {
    this.state.user.status = 'deleted';
    this.terminateAllSessions();
  }

  /**
   * Apply EmailVerified event
   */
  private applyEmailVerified(_event: DomainEvent): void {
    this.state.user.emailVerified = true;
  }

  /**
   * Apply PhoneVerified event
   */
  private applyPhoneVerified(_event: DomainEvent): void {
    this.state.user.phoneVerified = true;
  }

  /**
   * Apply PasswordChanged event
   */
  private applyPasswordChanged(_event: DomainEvent): void {
    this.terminateAllSessions();
  }

  /**
   * Apply MFACreated event
   */
  private applyMFACreated(event: DomainEvent): void {
    this.state.mfaSetup = { ...this.state.mfaSetup, ...event.payload };
  }

  /**
   * Apply MFAEnabled event
   */
  private applyMFAEnabled(_event: DomainEvent): void {
    this.state.mfaSetup.enabled = true;
    this.state.user.mfaEnabled = true;
  }

  /**
   * Apply MFADisabled event
   */
  private applyMFADisabled(_event: DomainEvent): void {
    this.state.mfaSetup.enabled = false;
    this.state.user.mfaEnabled = false;
  }

  /**
   * Apply UserLoggedIn event
   */
  private applyUserLoggedIn(event: DomainEvent): void {
    const session = event.payload;
    this.state.sessions.set(session.id, session);
    this.state.user.lastLoginAt = session.createdAt;
  }

  /**
   * Apply UserLoggedOut event
   */
  private applyUserLoggedOut(event: DomainEvent): void {
    const { sessionId } = event.payload;
    this.state.sessions.delete(sessionId);
  }

  /**
   * Apply UserProfileUpdated event
   */
  private applyUserProfileUpdated(event: DomainEvent): void {
    this.state.user.profile = { ...this.state.user.profile, ...event.payload };
  }

  /**
   * Apply UserPreferencesUpdated event
   */
  private applyUserPreferencesUpdated(event: DomainEvent): void {
    this.state.user.preferences = { ...this.state.user.preferences, ...event.payload };
  }

  /**
   * Terminate all sessions
   */
  private terminateAllSessions(): void {
    for (const session of this.state.sessions.values()) {
      session.isActive = false;
    }
    this.state.sessions.clear();
  }

  /**
   * Add activity
   */
  private addActivity(activity: Partial<UserActivity>): void {
    const fullActivity: UserActivity = {
      id: this.generateActivityId(),
      userId: this.state.user.id,
      type: activity.type!,
      timestamp: activity.timestamp!,
      ipAddress: activity.ipAddress!,
      userAgent: activity.userAgent!,
      ...(activity.metadata !== undefined && { metadata: activity.metadata })
    };

    this.state.activities.push(fullActivity);

    // Keep only last 100 activities
    if (this.state.activities.length > 100) {
      this.state.activities = this.state.activities.slice(-100);
    }
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      language: 'en',
      timezone: 'America/New_York',
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      twoFactorAuth: false,
      privacy: {
        profileVisibility: 'public',
        showEmail: false,
        showPhone: false,
        allowDirectMessages: true,
        allowSearch: true
      }
    };
  }

  /**
   * Get default metadata
   */
  private getDefaultMetadata(): UserMetadata {
    return {
      registrationSource: 'web',
      riskScore: 0,
      loginAttempts: 0,
      lastActivityAt: Date.now()
    };
  }

  /**
   * Generate user ID
   */
  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate activity ID
   */
  private generateActivityId(): string {
    return `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
