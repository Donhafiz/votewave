/**
 * User Commands - Command definitions and handlers for user operations
 * Implements the write side of CQRS for user domain
 */

import { v4 as uuidv4 } from 'uuid';
import { Command, CommandHandler } from '../../core/command-bus/Command';
import { DomainEvent } from '../../core/event-store/EventStore';
import { UserAggregate, UserRole, UserProfile, UserPreferences } from './UserAggregate';
import eventStore from '../../core/event-store/EventStore';
import eventBus from '../../core/event-bus/EventBus';
import { logger } from '../../utils/logger';

// Command Types
export interface RegisterUserCommand extends Command {
  type: 'RegisterUser';
  payload: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
    metadata?: any;
  };
}

export interface UpdateUserCommand extends Command {
  type: 'UpdateUser';
  payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    username?: string;
  };
}

export interface ActivateUserCommand extends Command {
  type: 'ActivateUser';
  payload: {
    userId: string;
  };
}

export interface DeactivateUserCommand extends Command {
  type: 'DeactivateUser';
  payload: {
    userId: string;
  };
}

export interface SuspendUserCommand extends Command {
  type: 'SuspendUser';
  payload: {
    userId: string;
    reason: string;
    duration?: number;
  };
}

export interface LockUserCommand extends Command {
  type: 'LockUser';
  payload: {
    userId: string;
    reason: string;
    duration?: number;
  };
}

export interface UnlockUserCommand extends Command {
  type: 'UnlockUser';
  payload: {
    userId: string;
  };
}

export interface DeleteUserCommand extends Command {
  type: 'DeleteUser';
  payload: {
    userId: string;
  };
}

export interface VerifyEmailCommand extends Command {
  type: 'VerifyEmail';
  payload: {
    userId: string;
  };
}

export interface VerifyPhoneCommand extends Command {
  type: 'VerifyPhone';
  payload: {
    userId: string;
  };
}

export interface ChangePasswordCommand extends Command {
  type: 'ChangePassword';
  payload: {
    userId: string;
    oldPassword?: string;
    newPassword: string;
  };
}

export interface CreateMFACommand extends Command {
  type: 'CreateMFA';
  payload: {
    userId: string;
    method: 'totp' | 'sms' | 'email';
    secret?: string;
  };
}

export interface EnableMFACommand extends Command {
  type: 'EnableMFA';
  payload: {
    userId: string;
  };
}

export interface DisableMFACommand extends Command {
  type: 'DisableMFA';
  payload: {
    userId: string;
  };
}

export interface LoginUserCommand extends Command {
  type: 'LoginUser';
  payload: {
    userId: string;
    ipAddress: string;
    userAgent: string;
    deviceFingerprint?: string;
  };
}

export interface LogoutUserCommand extends Command {
  type: 'LogoutUser';
  payload: {
    userId: string;
    sessionId: string;
  };
}

export interface UpdateProfileCommand extends Command {
  type: 'UpdateProfile';
  payload: {
    userId: string;
    profile: Partial<UserProfile>;
  };
}

export interface UpdatePreferencesCommand extends Command {
  type: 'UpdatePreferences';
  payload: {
    userId: string;
    preferences: Partial<UserPreferences>;
  };
}

// Aggregate cache for performance
const aggregateCache = new Map<string, UserAggregate>();

/**
 * Get or create user aggregate
 */
async function getUserAggregate(userId: string): Promise<UserAggregate> {
  // Check cache first
  if (aggregateCache.has(userId)) {
    return aggregateCache.get(userId)!;
  }

  // Load from event store
  const eventStream = await eventStore.getByAggregate(userId);
  
  // Create aggregate
  const aggregate = new UserAggregate({
    id: userId
  });
  
  // Rebuild state from events
  if (eventStream.events.length > 0) {
    aggregate.rebuildFromEvents(eventStream.events);
  }

  // Cache aggregate
  aggregateCache.set(userId, aggregate);

  return aggregate;
}

/**
 * Clear aggregate cache
 */
function clearAggregateCache(userId?: string): void {
  if (userId) {
    aggregateCache.delete(userId);
  } else {
    aggregateCache.clear();
  }
}

/**
 * Register User Command Handler
 */
export const registerUserHandler: CommandHandler<RegisterUserCommand> = async (command) => {
  const { email, username, firstName, lastName, role, metadata } = command.payload;
  const userId = uuidv4();

  logger.info('Processing RegisterUser command', {
    userId,
    email,
    username
  });

  try {
    // Create aggregate
    const aggregate = new UserAggregate({
      id: userId
    });

    // Register user
    const user = aggregate.registerUser({
      email,
      username,
      firstName,
      lastName,
      ...(role !== undefined && { role }),
      metadata: {
        ...metadata
      }
    });

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserRegistered',
      aggregateId: userId,
      aggregateType: 'user',
      version: 1,
      timestamp: Date.now(),
      payload: user,
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User registered successfully', {
      eventId: event.id,
      userId,
      email
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to register user', {
      userId,
      email,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Update User Command Handler
 */
export const updateUserHandler: CommandHandler<UpdateUserCommand> = async (command) => {
  const { userId, firstName, lastName, username } = command.payload;

  logger.info('Processing UpdateUser command', {
    userId,
    firstName,
    lastName,
    username
  });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Update user
    aggregate.updateUser({
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(username !== undefined && { username })
    });
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserUpdated',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { firstName, lastName, username },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User updated successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update user', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Activate User Command Handler
 */
export const activateUserHandler: CommandHandler<ActivateUserCommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing ActivateUser command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Activate user
    aggregate.activateUser();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserActivated',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { activatedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User activated successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to activate user', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Deactivate User Command Handler
 */
export const deactivateUserHandler: CommandHandler<DeactivateUserCommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing DeactivateUser command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Deactivate user
    aggregate.deactivateUser();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserDeactivated',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { deactivatedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User deactivated successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to deactivate user', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Suspend User Command Handler
 */
export const suspendUserHandler: CommandHandler<SuspendUserCommand> = async (command) => {
  const { userId, reason, duration } = command.payload;

  logger.info('Processing SuspendUser command', {
    userId,
    reason,
    duration
  });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Suspend user
    aggregate.suspendUser(reason, duration);
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserSuspended',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { reason, duration, suspendedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User suspended successfully', {
      eventId: event.id,
      userId,
      reason
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to suspend user', {
      userId,
      reason,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Lock User Command Handler
 */
export const lockUserHandler: CommandHandler<LockUserCommand> = async (command) => {
  const { userId, reason, duration } = command.payload;

  logger.info('Processing LockUser command', {
    userId,
    reason,
    duration
  });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Lock user
    aggregate.lockUser(reason, duration);
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserLocked',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { reason, duration, lockedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User locked successfully', {
      eventId: event.id,
      userId,
      reason
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to lock user', {
      userId,
      reason,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Unlock User Command Handler
 */
export const unlockUserHandler: CommandHandler<UnlockUserCommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing UnlockUser command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Unlock user
    aggregate.unlockUser();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserUnlocked',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { unlockedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User unlocked successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to unlock user', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Delete User Command Handler
 */
export const deleteUserHandler: CommandHandler<DeleteUserCommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing DeleteUser command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Delete user
    aggregate.deleteUser();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserDeleted',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { deletedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User deleted successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete user', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Verify Email Command Handler
 */
export const verifyEmailHandler: CommandHandler<VerifyEmailCommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing VerifyEmail command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Verify email
    aggregate.verifyEmail();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'EmailVerified',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { verifiedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('Email verified successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to verify email', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Verify Phone Command Handler
 */
export const verifyPhoneHandler: CommandHandler<VerifyPhoneCommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing VerifyPhone command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Verify phone
    aggregate.verifyPhone();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'PhoneVerified',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { verifiedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('Phone verified successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to verify phone', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Change Password Command Handler
 */
export const changePasswordHandler: CommandHandler<ChangePasswordCommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing ChangePassword command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Change password
    aggregate.changePassword();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'PasswordChanged',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { changedAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('Password changed successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to change password', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Create MFA Command Handler
 */
export const createMFAHandler: CommandHandler<CreateMFACommand> = async (command) => {
  const { userId, method, secret } = command.payload;

  logger.info('Processing CreateMFA command', {
    userId,
    method
  });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Create MFA setup
    aggregate.createMFASetup(method, secret);
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'MFACreated',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { method, createdAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('MFA setup created successfully', {
      eventId: event.id,
      userId,
      method
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create MFA setup', {
      userId,
      method,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Enable MFA Command Handler
 */
export const enableMFAHandler: CommandHandler<EnableMFACommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing EnableMFA command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Enable MFA
    aggregate.enableMFA();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'MFAEnabled',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { enabledAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('MFA enabled successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to enable MFA', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Disable MFA Command Handler
 */
export const disableMFAHandler: CommandHandler<DisableMFACommand> = async (command) => {
  const { userId } = command.payload;

  logger.info('Processing DisableMFA command', { userId });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Disable MFA
    aggregate.disableMFA();
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'MFADisabled',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { disabledAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('MFA disabled successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to disable MFA', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Login User Command Handler
 */
export const loginUserHandler: CommandHandler<LoginUserCommand> = async (command) => {
  const { userId, ipAddress, userAgent, deviceFingerprint } = command.payload;

  logger.info('Processing LoginUser command', {
    userId,
    ipAddress
  });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Login user
    const session = aggregate.loginUser({
      ipAddress,
      userAgent,
      ...(deviceFingerprint !== undefined && { deviceFingerprint })
    });
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserLoggedIn',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: session,
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User logged in successfully', {
      eventId: event.id,
      userId,
      sessionId: session.id
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to login user', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Logout User Command Handler
 */
export const logoutUserHandler: CommandHandler<LogoutUserCommand> = async (command) => {
  const { userId, sessionId } = command.payload;

  logger.info('Processing LogoutUser command', {
    userId,
    sessionId
  });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Logout user
    aggregate.logoutUser(sessionId);
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserLoggedOut',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: { sessionId, loggedOutAt: Date.now() },
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('User logged out successfully', {
      eventId: event.id,
      userId,
      sessionId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to logout user', {
      userId,
      sessionId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Update Profile Command Handler
 */
export const updateProfileHandler: CommandHandler<UpdateProfileCommand> = async (command) => {
  const { userId, profile } = command.payload;

  logger.info('Processing UpdateProfile command', {
    userId
  });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Update profile
    aggregate.updateProfile(profile);
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserProfileUpdated',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: profile,
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('Profile updated successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update profile', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Update Preferences Command Handler
 */
export const updatePreferencesHandler: CommandHandler<UpdatePreferencesCommand> = async (command) => {
  const { userId, preferences } = command.payload;

  logger.info('Processing UpdatePreferences command', {
    userId
  });

  try {
    // Get aggregate
    const aggregate = await getUserAggregate(userId);

    // Update preferences
    aggregate.updatePreferences(preferences);
    const updatedUser = aggregate.getUser();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'UserPreferencesUpdated',
      aggregateId: userId,
      aggregateType: 'user',
      version: updatedUser.version + 1,
      timestamp: Date.now(),
      payload: preferences,
      metadata: {
        causationId: command.metadata?.causationId,
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      }
    };

    // Store event
    await eventStore.append(event);

    // Publish event
    await eventBus.publish(event);

    // Clear cache
    clearAggregateCache(userId);

    logger.info('Preferences updated successfully', {
      eventId: event.id,
      userId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update preferences', {
      userId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Register all user command handlers
 */
export function registerUserCommandHandlers(): void {
  const commandBus = require('../../core/command-bus/CommandBus').default;

  commandBus.register('RegisterUser', registerUserHandler);
  commandBus.register('UpdateUser', updateUserHandler);
  commandBus.register('ActivateUser', activateUserHandler);
  commandBus.register('DeactivateUser', deactivateUserHandler);
  commandBus.register('SuspendUser', suspendUserHandler);
  commandBus.register('LockUser', lockUserHandler);
  commandBus.register('UnlockUser', unlockUserHandler);
  commandBus.register('DeleteUser', deleteUserHandler);
  commandBus.register('VerifyEmail', verifyEmailHandler);
  commandBus.register('VerifyPhone', verifyPhoneHandler);
  commandBus.register('ChangePassword', changePasswordHandler);
  commandBus.register('CreateMFA', createMFAHandler);
  commandBus.register('EnableMFA', enableMFAHandler);
  commandBus.register('DisableMFA', disableMFAHandler);
  commandBus.register('LoginUser', loginUserHandler);
  commandBus.register('LogoutUser', logoutUserHandler);
  commandBus.register('UpdateProfile', updateProfileHandler);
  commandBus.register('UpdatePreferences', updatePreferencesHandler);

  logger.info('User command handlers registered');
}

/**
 * Unregister all user command handlers
 */
export function unregisterUserCommandHandlers(): void {
  const commandBus = require('../../core/command-bus/CommandBus').default;

  commandBus.unregister('RegisterUser');
  commandBus.unregister('UpdateUser');
  commandBus.unregister('ActivateUser');
  commandBus.unregister('DeactivateUser');
  commandBus.unregister('SuspendUser');
  commandBus.unregister('LockUser');
  commandBus.unregister('UnlockUser');
  commandBus.unregister('DeleteUser');
  commandBus.unregister('VerifyEmail');
  commandBus.unregister('VerifyPhone');
  commandBus.unregister('ChangePassword');
  commandBus.unregister('CreateMFA');
  commandBus.unregister('EnableMFA');
  commandBus.unregister('DisableMFA');
  commandBus.unregister('LoginUser');
  commandBus.unregister('LogoutUser');
  commandBus.unregister('UpdateProfile');
  commandBus.unregister('UpdatePreferences');

  logger.info('User command handlers unregistered');
}

// Export command types for type safety
export type UserCommand = 
  | RegisterUserCommand
  | UpdateUserCommand
  | ActivateUserCommand
  | DeactivateUserCommand
  | SuspendUserCommand
  | LockUserCommand
  | UnlockUserCommand
  | DeleteUserCommand
  | VerifyEmailCommand
  | VerifyPhoneCommand
  | ChangePasswordCommand
  | CreateMFACommand
  | EnableMFACommand
  | DisableMFACommand
  | LoginUserCommand
  | LogoutUserCommand
  | UpdateProfileCommand
  | UpdatePreferencesCommand;
