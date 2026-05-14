/**
 * Type definitions index file for VoteWave platform
 * Exports all types for centralized access
 */

// Event types
export * from './events';

// User types
export * from './user';

// Election types
export * from './election';

// Common utility types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  error?: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  poolSize: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  db: number;
  keyPrefix: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  enableOfflineQueue: boolean;
  lazyConnect: boolean;
}

export interface ServiceConfig {
  name: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  port: number;
  database: DatabaseConfig;
  redis: RedisConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  monitoring: MonitoringConfig;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'text';
  colorize: boolean;
  timestamp: boolean;
  prettyPrint: boolean;
  transports: string[];
}

export interface SecurityConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: string;
    audience: string;
  };
  bcrypt: {
    saltRounds: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
  };
  cors: {
    origin: string[];
    credentials: boolean;
  };
  helmet: {
    enabled: boolean;
    contentSecurityPolicy: boolean;
  };
}

export interface MonitoringConfig {
  prometheus: {
    enabled: boolean;
    port: number;
    path: string;
  };
  openTelemetry: {
    enabled: boolean;
    serviceName: string;
    serviceVersion: string;
    endpoint: string;
    sampleRate: number;
  };
  health: {
    enabled: boolean;
    path: string;
    interval: number;
  };
}

// Generic utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Result types for error handling
export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

export type Success<T> = Result<T, never>;
export type Failure<E> = Result<never, E>;

export function success<T>(data: T): Success<T> {
  return { success: true, data };
}

export function failure<E>(error: E): Failure<E> {
  return { success: false, error };
}

// Database operation types
export interface DatabaseQuery {
  sql: string;
  params?: any[];
  timeout?: number;
}

export interface DatabaseResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
}

// Cache operation types
export interface CacheOperation {
  key: string;
  value?: any;
  ttl?: number;
  operation: 'get' | 'set' | 'del' | 'exists' | 'expire';
}

export interface CacheResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// HTTP request/response types
export interface RequestContext {
  id: string;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent: string;
  method: string;
  path: string;
  timestamp: number;
  metadata: Record<string, any>;
}

export interface ResponseContext {
  statusCode: number;
  headers: Record<string, string>;
  body?: any;
  timestamp: number;
  duration: number;
}

// Validation types
export interface SimpleValidationError {
  field: string;
  message: string;
  value?: any;
  code?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: any;
}

// Async operation types
export interface AsyncOperation<T = any> {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result?: T;
  error?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

// Search and filtering types
export interface SearchQuery {
  query?: string;
  filters?: Record<string, any>;
  sort?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  offset?: number;
}

export interface SearchResults<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  facets?: Record<string, Array<{
    value: string;
    count: number;
  }>>;
  suggestions?: string[];
}

// Geographic types
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Location {
  country: string;
  state?: string;
  city?: string;
  coordinates?: Coordinates;
  timezone?: string;
}

export interface GeoDistance {
  location: Location;
  distance: number;
  unit: 'km' | 'miles';
}

// Time and date types
export interface DateRange {
  start: number;
  end: number;
}

export interface TimeWindow {
  duration: number;
  unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';
}

export interface RecurringSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
  dayOfMonth?: number; // 1-31
  monthOfYear?: number; // 1-12
  timeOfDay?: string; // HH:MM format
}

// File and media types
export interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  path?: string;
  uploadedAt: number;
  uploadedBy: string;
  metadata: Record<string, any>;
}

export interface UploadRequest {
  file: Buffer | File;
  name: string;
  mimeType: string;
  size: number;
  metadata?: Record<string, any>;
}

export interface UploadResponse {
  success: boolean;
  fileInfo?: FileInfo;
  error?: string;
}

// Notification types
export interface Notification {
  id: string;
  type: 'email' | 'sms' | 'push' | 'in_app';
  recipient: string;
  subject?: string;
  content: string;
  metadata: Record<string, any>;
  scheduledAt?: number;
  sentAt?: number;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  error?: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'push' | 'in_app';
  subject?: string;
  content: string;
  variables: string[];
  metadata: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// Configuration and settings types
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  conditions?: FeatureCondition[];
  rolloutPercentage?: number;
  createdAt: number;
  updatedAt: number;
}

export interface FeatureCondition {
  type: 'user_id' | 'user_role' | 'user_region' | 'custom';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains';
  value: any;
}

// Integration types
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  retryPolicy: RetryPolicy;
  lastTriggered?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs: number;
  retryableErrors: string[];
}

export interface ExternalService {
  name: string;
  type: string;
  baseUrl: string;
  authentication: {
    type: 'api_key' | 'oauth' | 'basic' | 'bearer';
    credentials?: Record<string, string>;
  };
  timeout: number;
  retryPolicy: RetryPolicy;
  healthCheck?: {
    endpoint: string;
    interval: number;
    timeout: number;
  };
}

// Audit and logging types
export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: number;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  metadata: Record<string, any>;
}

export interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: number;
  service: string;
  requestId?: string;
  userId?: string;
  metadata: Record<string, any>;
  stack?: string;
}

// Performance and metrics types
export interface PerformanceMetrics {
  duration: number;
  memory: number;
  cpu: number;
  operations: number;
  errors: number;
  timestamp: number;
}

export interface Metric {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

// Error types
export interface AppError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp: number;
}

export interface ValidationError extends AppError {
  field: string;
  value: any;
  code: string;
  statusCode: number;
  timestamp: number;
  details?: Record<string, any>;
}

export interface DatabaseError extends AppError {
  query?: string;
  params?: any[];
}

export interface NetworkError extends AppError {
  url?: string;
  method?: string;
  statusCode: number;
}

// Utility type guards
export function isSuccess<T>(result: Result<T>): result is Success<T> {
  return result.success;
}

export function isFailure<E>(result: Result<any, E>): result is Failure<E> {
  return !result.success;
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: any): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray<T>(value: any): value is T[] {
  return Array.isArray(value);
}

// Type utilities
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type NonNullable<T> = T extends null | undefined ? never : T;

export type Maybe<T> = T | null | undefined;

export type Awaitable<T> = Promise<T> | T;

export type Constructor<T = {}> = new (...args: any[]) => T;

