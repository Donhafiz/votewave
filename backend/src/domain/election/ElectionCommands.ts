/**
 * Election Commands - Command definitions and handlers for election operations
 * Implements the write side of CQRS for election domain
 */

import { v4 as uuidv4 } from 'uuid';
import { Command, CommandHandler } from '../../core/command-bus/Command';
import { DomainEvent } from '../../core/event-store/EventStore';
import { ElectionAggregate, ElectionSettings, ElectionRules } from './ElectionAggregate';
import eventStore from '../../core/event-store/EventStore';
import eventBus from '../../core/event-bus/EventBus';
import { logger } from '../../utils/logger';

// Command Types
export interface CreateElectionCommand extends Command {
  type: 'CreateElection';
  payload: {
    title: string;
    description: string;
    type: 'general' | 'primary' | 'referendum' | 'local';
    settings?: Partial<ElectionSettings>;
    rules?: Partial<ElectionRules>;
    metadata?: any;
  };
}

export interface UpdateElectionCommand extends Command {
  type: 'UpdateElection';
  payload: {
    electionId: string;
    title?: string;
    description?: string;
    type?: 'general' | 'primary' | 'referendum' | 'local';
  };
}

export interface ActivateElectionCommand extends Command {
  type: 'ActivateElection';
  payload: {
    electionId: string;
  };
}

export interface StartElectionCommand extends Command {
  type: 'StartElection';
  payload: {
    electionId: string;
  };
}

export interface EndElectionCommand extends Command {
  type: 'EndElection';
  payload: {
    electionId: string;
  };
}

export interface CompleteElectionCommand extends Command {
  type: 'CompleteElection';
  payload: {
    electionId: string;
  };
}

export interface CancelElectionCommand extends Command {
  type: 'CancelElection';
  payload: {
    electionId: string;
    reason: string;
  };
}

export interface AddCandidateCommand extends Command {
  type: 'AddCandidate';
  payload: {
    electionId: string;
    name: string;
    party?: string;
    description?: string;
    metadata?: any;
  };
}

export interface RemoveCandidateCommand extends Command {
  type: 'RemoveCandidate';
  payload: {
    electionId: string;
    candidateId: string;
  };
}

export interface UpdateCandidateCommand extends Command {
  type: 'UpdateCandidate';
  payload: {
    electionId: string;
    candidateId: string;
    name?: string;
    party?: string;
    description?: string;
    metadata?: any;
  };
}

export interface UpdateElectionSettingsCommand extends Command {
  type: 'UpdateElectionSettings';
  payload: {
    electionId: string;
    settings: Partial<ElectionSettings>;
  };
}

export interface UpdateElectionRulesCommand extends Command {
  type: 'UpdateElectionRules';
  payload: {
    electionId: string;
    rules: Partial<ElectionRules>;
  };
}

// Aggregate cache for performance
const aggregateCache = new Map<string, ElectionAggregate>();

/**
 * Get or create election aggregate
 */
async function getElectionAggregate(electionId: string): Promise<ElectionAggregate> {
  // Check cache first
  if (aggregateCache.has(electionId)) {
    return aggregateCache.get(electionId)!;
  }

  // Load from event store
  const eventStream = await eventStore.getByAggregate(electionId);
  
  // Create aggregate
  const aggregate = new ElectionAggregate({
    id: electionId
  });
  
  // Rebuild state from events
  if (eventStream.events.length > 0) {
    aggregate.rebuildFromEvents(eventStream.events);
  }

  // Cache aggregate
  aggregateCache.set(electionId, aggregate);

  return aggregate;
}

/**
 * Clear aggregate cache
 */
function clearAggregateCache(electionId?: string): void {
  if (electionId) {
    aggregateCache.delete(electionId);
  } else {
    aggregateCache.clear();
  }
}

/**
 * Create Election Command Handler
 */
export const createElectionHandler: CommandHandler<CreateElectionCommand> = async (command) => {
  const { title, description, type, settings, metadata } = command.payload;
  const electionId = uuidv4();

  logger.info('Processing CreateElection command', {
    electionId,
    title,
    type
  });

  try {
    // Create aggregate
    const aggregate = new ElectionAggregate({
      id: electionId,
      title,
      description,
      type,
      settings,
      rules: {}, // Will use defaults
      metadata,
      createdBy: command.metadata?.userId
    });

    // Create election
    const electionState = aggregate.createElection(title, description, command.metadata?.userId);

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionCreated',
      aggregateId: electionId,
      aggregateType: 'election',
      version: 1,
      timestamp: Date.now(),
      payload: electionState,
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
    clearAggregateCache(electionId);

    logger.info('Election created successfully', {
      eventId: event.id,
      electionId,
      title
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create election', {
      electionId,
      title,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Update Election Command Handler
 */
export const updateElectionHandler: CommandHandler<UpdateElectionCommand> = async (command) => {
  const { electionId, title, description, type } = command.payload;

  logger.info('Processing UpdateElection command', {
    electionId,
    title,
    description,
    type
  });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Update election
    aggregate.updateElection({ title, description, type });
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionUpdated',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: { title, description, type },
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
    clearAggregateCache(electionId);

    logger.info('Election updated successfully', {
      eventId: event.id,
      electionId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update election', {
      electionId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Activate Election Command Handler
 */
export const activateElectionHandler: CommandHandler<ActivateElectionCommand> = async (command) => {
  const { electionId } = command.payload;

  logger.info('Processing ActivateElection command', { electionId });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Activate election
    aggregate.activateElection();
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionActivated',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
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
    clearAggregateCache(electionId);

    logger.info('Election activated successfully', {
      eventId: event.id,
      electionId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to activate election', {
      electionId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Start Election Command Handler
 */
export const startElectionHandler: CommandHandler<StartElectionCommand> = async (command) => {
  const { electionId } = command.payload;

  logger.info('Processing StartElection command', { electionId });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Start voting
    aggregate.startVoting();
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionStarted',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: { 
        startedAt: Date.now(),
        candidatesCount: updatedState.candidates.size
      },
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
    clearAggregateCache(electionId);

    logger.info('Election started successfully', {
      eventId: event.id,
      electionId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start election', {
      electionId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * End Election Command Handler
 */
export const endElectionHandler: CommandHandler<EndElectionCommand> = async (command) => {
  const { electionId } = command.payload;

  logger.info('Processing EndElection command', { electionId });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // End voting
    aggregate.endVoting();
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionEnded',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: { 
        endedAt: Date.now(),
        finalCandidatesCount: updatedState.candidates.size
      },
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
    clearAggregateCache(electionId);

    logger.info('Election ended successfully', {
      eventId: event.id,
      electionId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to end election', {
      electionId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Complete Election Command Handler
 */
export const completeElectionHandler: CommandHandler<CompleteElectionCommand> = async (command) => {
  const { electionId } = command.payload;

  logger.info('Processing CompleteElection command', { electionId });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Complete election
    aggregate.completeElection();
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionCompleted',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: { 
        completedAt: Date.now(),
        finalStatus: updatedState.status
      },
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
    clearAggregateCache(electionId);

    logger.info('Election completed successfully', {
      eventId: event.id,
      electionId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to complete election', {
      electionId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Cancel Election Command Handler
 */
export const cancelElectionHandler: CommandHandler<CancelElectionCommand> = async (command) => {
  const { electionId, reason } = command.payload;

  logger.info('Processing CancelElection command', {
    electionId,
    reason
  });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Cancel election
    aggregate.cancelElection(reason);
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionCancelled',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: { 
        cancelledAt: Date.now(),
        reason
      },
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
    clearAggregateCache(electionId);

    logger.info('Election cancelled successfully', {
      eventId: event.id,
      electionId,
      reason
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to cancel election', {
      electionId,
      reason,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Add Candidate Command Handler
 */
export const addCandidateHandler: CommandHandler<AddCandidateCommand> = async (command) => {
  const { electionId, name, party, description, metadata } = command.payload;

  logger.info('Processing AddCandidate command', {
    electionId,
    name,
    party
  });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Add candidate
    const candidate = aggregate.addCandidate({
      name,
      party,
      description,
      addedBy: command.metadata?.userId,
      metadata
    });
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'CandidateAdded',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: candidate,
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
    clearAggregateCache(electionId);

    logger.info('Candidate added successfully', {
      eventId: event.id,
      electionId,
      candidateId: candidate.id
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to add candidate', {
      electionId,
      name,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Remove Candidate Command Handler
 */
export const removeCandidateHandler: CommandHandler<RemoveCandidateCommand> = async (command) => {
  const { electionId, candidateId } = command.payload;

  logger.info('Processing RemoveCandidate command', {
    electionId,
    candidateId
  });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Remove candidate
    aggregate.removeCandidate(candidateId);
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'CandidateRemoved',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: { 
        candidateId,
        removedAt: Date.now()
      },
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
    clearAggregateCache(electionId);

    logger.info('Candidate removed successfully', {
      eventId: event.id,
      electionId,
      candidateId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to remove candidate', {
      electionId,
      candidateId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Update Candidate Command Handler
 */
export const updateCandidateHandler: CommandHandler<UpdateCandidateCommand> = async (command) => {
  const { electionId, candidateId, name, party, description, metadata } = command.payload;

  logger.info('Processing UpdateCandidate command', {
    electionId,
    candidateId,
    name
  });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Update candidate
    aggregate.updateCandidate(candidateId, {
      name,
      party,
      description,
      metadata
    });
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'CandidateUpdated',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: { 
        candidateId,
        updates: { name, party, description, metadata }
      },
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
    clearAggregateCache(electionId);

    logger.info('Candidate updated successfully', {
      eventId: event.id,
      electionId,
      candidateId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update candidate', {
      electionId,
      candidateId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Update Election Settings Command Handler
 */
export const updateElectionSettingsHandler: CommandHandler<UpdateElectionSettingsCommand> = async (command) => {
  const { electionId, settings } = command.payload;

  logger.info('Processing UpdateElectionSettings command', {
    electionId,
    settings
  });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Update settings
    aggregate.updateSettings(settings);
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionSettingsUpdated',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: settings,
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
    clearAggregateCache(electionId);

    logger.info('Election settings updated successfully', {
      eventId: event.id,
      electionId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update election settings', {
      electionId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Update Election Rules Command Handler
 */
export const updateElectionRulesHandler: CommandHandler<UpdateElectionRulesCommand> = async (command) => {
  const { electionId, rules } = command.payload;

  logger.info('Processing UpdateElectionRules command', {
    electionId,
    rules
  });

  try {
    // Get aggregate
    const aggregate = await getElectionAggregate(electionId);

    // Update rules
    aggregate.updateRules(rules);
    const updatedState = aggregate.getState();

    // Create event
    const event: DomainEvent = {
      id: uuidv4(),
      type: 'ElectionRulesUpdated',
      aggregateId: electionId,
      aggregateType: 'election',
      version: updatedState.version + 1,
      timestamp: Date.now(),
      payload: rules,
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
    clearAggregateCache(electionId);

    logger.info('Election rules updated successfully', {
      eventId: event.id,
      electionId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update election rules', {
      electionId,
      error: errorMessage
    });
    throw error;
  }
};

/**
 * Register all election command handlers
 */
export function registerElectionCommandHandlers(): void {
  const commandBus = require('../../core/command-bus/CommandBus').default;

  commandBus.register('CreateElection', createElectionHandler);
  commandBus.register('UpdateElection', updateElectionHandler);
  commandBus.register('ActivateElection', activateElectionHandler);
  commandBus.register('StartElection', startElectionHandler);
  commandBus.register('EndElection', endElectionHandler);
  commandBus.register('CompleteElection', completeElectionHandler);
  commandBus.register('CancelElection', cancelElectionHandler);
  commandBus.register('AddCandidate', addCandidateHandler);
  commandBus.register('RemoveCandidate', removeCandidateHandler);
  commandBus.register('UpdateCandidate', updateCandidateHandler);
  commandBus.register('UpdateElectionSettings', updateElectionSettingsHandler);
  commandBus.register('UpdateElectionRules', updateElectionRulesHandler);

  logger.info('Election command handlers registered');
}

/**
 * Unregister all election command handlers
 */
export function unregisterElectionCommandHandlers(): void {
  const commandBus = require('../../core/command-bus/CommandBus').default;

  commandBus.unregister('CreateElection');
  commandBus.unregister('UpdateElection');
  commandBus.unregister('ActivateElection');
  commandBus.unregister('StartElection');
  commandBus.unregister('EndElection');
  commandBus.unregister('CompleteElection');
  commandBus.unregister('CancelElection');
  commandBus.unregister('AddCandidate');
  commandBus.unregister('RemoveCandidate');
  commandBus.unregister('UpdateCandidate');
  commandBus.unregister('UpdateElectionSettings');
  commandBus.unregister('UpdateElectionRules');

  logger.info('Election command handlers unregistered');
}

// Export command types for type safety
export type ElectionCommand = 
  | CreateElectionCommand
  | UpdateElectionCommand
  | ActivateElectionCommand
  | StartElectionCommand
  | EndElectionCommand
  | CompleteElectionCommand
  | CancelElectionCommand
  | AddCandidateCommand
  | RemoveCandidateCommand
  | UpdateCandidateCommand
  | UpdateElectionSettingsCommand
  | UpdateElectionRulesCommand;
