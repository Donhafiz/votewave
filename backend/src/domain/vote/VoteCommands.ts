/**
 * Vote Commands - CQRS Command Handlers
 * Realtime-enabled enterprise voting command system
 */

import { v4 as uuidv4 } from 'uuid';

import {
  Command,
  CommandHandler
} from '../../core/command-bus/Command';

import {
  DomainEvent
} from '../../core/event-store/EventStore';

import {
  VoteAggregate,
  VoteMetadata
} from './VoteAggregate';

import eventStore from '../../core/event-store/EventStore';
import eventBus from '../../core/event-bus/EventBus';

import { logger } from '../../utils/logger';

import { realtimeBus } from '../../realtime/eventBus';
import { REALTIME_EVENTS } from '../../realtime/events';

/**
 * =========================================================
 * COMMAND TYPES
 * =========================================================
 */

export interface CastVoteCommand extends Command {
  type: 'CastVote';

  payload: {
    electionId: string;
    userId: string;
    candidateId: string;
    metadata?: VoteMetadata;
  };
}

export interface CancelVoteCommand extends Command {
  type: 'CancelVote';

  payload: {
    electionId: string;
    userId: string;
    reason?: string;
  };
}

export interface VerifyVoteCommand extends Command {
  type: 'VerifyVote';

  payload: {
    electionId: string;
    userId: string;
  };
}

export interface InvalidateVoteCommand extends Command {
  type: 'InvalidateVote';

  payload: {
    electionId: string;
    userId: string;
    reason: string;
  };
}

export interface UpdateVotingRulesCommand extends Command {
  type: 'UpdateVotingRules';

  payload: {
    electionId: string;

    rules: Partial<{
      maxVotesPerVoter: number;
      allowVoteChange: boolean;
      requireVerification: boolean;
      votingStartTime: number;
      votingEndTime: number;
      eligibleRegions: string[];
      minAge: number;
      maxFraudScore: number;
    }>;
  };
}

/**
 * =========================================================
 * AGGREGATE CACHE
 * =========================================================
 */

const aggregateCache = new Map<string, VoteAggregate>();

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

async function getVotingRules(
  _electionId: string
): Promise<any> {
  return {
    maxVotesPerVoter: 1,
    allowVoteChange: false,
    requireVerification: true,
    votingStartTime: Date.now() - 86400000,
    votingEndTime: Date.now() + 86400000,
    eligibleRegions: [
      'us-east-1',
      'us-west-2',
      'eu-west-1',
      'ap-southeast-1'
    ],
    minAge: 18,
    maxFraudScore: 0.5
  };
}

async function getVoteAggregate(
  electionId: string
): Promise<VoteAggregate> {

  if (aggregateCache.has(electionId)) {
    return aggregateCache.get(electionId)!;
  }

  const eventStream =
    await eventStore.getByAggregate(electionId);

  const rules =
    await getVotingRules(electionId);

  const aggregate =
    new VoteAggregate(electionId, rules);

  if (eventStream?.events?.length) {
    aggregate.rebuildFromEvents(
      eventStream.events
    );
  }

  aggregateCache.set(
    electionId,
    aggregate
  );

  return aggregate;
}

function clearAggregateCache(
  electionId?: string
): void {

  if (electionId) {
    aggregateCache.delete(electionId);
    return;
  }

  aggregateCache.clear();
}

/**
 * =========================================================
 * REALTIME BROADCAST
 * =========================================================
 */

function broadcastRealtimeUpdate(
  electionId: string,
  payload: any
): void {

  realtimeBus.broadcast(
    REALTIME_EVENTS.VOTE_CAST,
    {
      electionId,
      ...payload,
      timestamp: new Date().toISOString()
    }
  );

  realtimeBus.broadcast(
    REALTIME_EVENTS.RESULTS_UPDATED,
    {
      electionId,
      updatedAt: new Date().toISOString()
    }
  );
}

/**
 * =========================================================
 * CAST VOTE
 * =========================================================
 */

export const castVoteHandler:
  CommandHandler<CastVoteCommand> =
async (
  command: CastVoteCommand
) => {

  const {
    electionId,
    userId,
    candidateId,
    metadata
  } = command.payload;

  logger.info(
    'Processing CastVote command',
    {
      electionId,
      userId,
      candidateId
    }
  );

  try {

    const aggregate =
      await getVoteAggregate(electionId);

    const eligibility =
      aggregate.canVote(
        userId,
        candidateId
      );

    if (!eligibility.eligible) {
      throw new Error(
        `Cannot cast vote: ${eligibility.reason}`
      );
    }

    const vote =
      aggregate.castVote(
        userId,
        candidateId,
        metadata
      );

    const event: DomainEvent = {
      id: uuidv4(),

      type: 'VoteCast',

      aggregateId: electionId,

      aggregateType: 'vote',

      version:
        aggregate.getState().version + 1,

      timestamp: Date.now(),

      payload: vote,

      metadata: {
        causationId:
          command.metadata?.causationId,

        correlationId:
          command.metadata?.correlationId,

        userId:
          command.metadata?.userId
      }
    };

    await eventStore.append(event);

    await eventBus.publish(event);

    /**
     * REALTIME BROADCAST
     */

    broadcastRealtimeUpdate(
      electionId,
      {
        userId,
        candidateId,
        voteId: vote.id
      }
    );

    clearAggregateCache(electionId);

    logger.info(
      'Vote cast successfully',
      {
        eventId: event.id,
        electionId,
        userId,
        candidateId,
        voteId: vote.id
      }
    );

  } catch (error: unknown) {

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.error(
      'Failed to cast vote',
      {
        electionId,
        userId,
        candidateId,
        error: errorMessage
      }
    );

    throw error;
  }
};

/**
 * =========================================================
 * CANCEL VOTE
 * =========================================================
 */

export const cancelVoteHandler:
  CommandHandler<CancelVoteCommand> =
async (
  command: CancelVoteCommand
) => {

  const {
    electionId,
    userId,
    reason
  } = command.payload;

  try {

    const aggregate =
      await getVoteAggregate(electionId);

    const vote =
      aggregate.cancelVote(
        userId,
        reason
      );

    if (!vote) {
      throw new Error(
        'No vote found for user'
      );
    }

    const event: DomainEvent = {
      id: uuidv4(),

      type: 'VoteCancelled',

      aggregateId: electionId,

      aggregateType: 'vote',

      version:
        aggregate.getState().version + 1,

      timestamp: Date.now(),

      payload: {
        userId,
        reason,
        voteId: vote.id
      },

      metadata: {
        userId:
          command.metadata?.userId
      }
    };

    await eventStore.append(event);

    await eventBus.publish(event);

    realtimeBus.broadcast(
      REALTIME_EVENTS.RESULTS_UPDATED,
      {
        electionId,
        action: 'vote_cancelled',
        userId,
        timestamp: new Date().toISOString()
      }
    );

    clearAggregateCache(electionId);

    logger.info(
      'Vote cancelled successfully',
      {
        electionId,
        userId
      }
    );

  } catch (error: unknown) {

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.error(
      'Cancel vote failed',
      {
        electionId,
        userId,
        error: errorMessage
      }
    );

    throw error;
  }
};

/**
 * =========================================================
 * VERIFY VOTE
 * =========================================================
 */

export const verifyVoteHandler:
  CommandHandler<VerifyVoteCommand> =
async (
  command: VerifyVoteCommand
) => {

  const {
    electionId,
    userId
  } = command.payload;

  try {

    const aggregate =
      await getVoteAggregate(electionId);

    const vote =
      aggregate.verifyVote(userId);

    if (!vote) {
      throw new Error(
        'Vote not found'
      );
    }

    const event: DomainEvent = {
      id: uuidv4(),

      type: 'VoteVerified',

      aggregateId: electionId,

      aggregateType: 'vote',

      version:
        aggregate.getState().version + 1,

      timestamp: Date.now(),

      payload: {
        userId,
        voteId: vote.id
      },

      metadata: {
        userId:
          command.metadata?.userId
      }
    };

    await eventStore.append(event);

    await eventBus.publish(event);

    realtimeBus.broadcast(
      REALTIME_EVENTS.USER_ACTIVITY,
      {
        electionId,
        action: 'vote_verified',
        userId,
        voteId: vote.id
      }
    );

    clearAggregateCache(electionId);

    logger.info(
      'Vote verified successfully',
      {
        electionId,
        userId
      }
    );

  } catch (error: unknown) {

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.error(
      'Vote verification failed',
      {
        electionId,
        userId,
        error: errorMessage
      }
    );

    throw error;
  }
};

/**
 * =========================================================
 * INVALIDATE VOTE
 * =========================================================
 */

export const invalidateVoteHandler:
  CommandHandler<InvalidateVoteCommand> =
async (
  command: InvalidateVoteCommand
) => {

  const {
    electionId,
    userId,
    reason
  } = command.payload;

  try {

    const aggregate =
      await getVoteAggregate(electionId);

    const vote =
      aggregate.invalidateVote(
        userId,
        reason
      );

    if (!vote) {
      throw new Error(
        'Vote not found'
      );
    }

    const event: DomainEvent = {
      id: uuidv4(),

      type: 'VoteInvalidated',

      aggregateId: electionId,

      aggregateType: 'vote',

      version:
        aggregate.getState().version + 1,

      timestamp: Date.now(),

      payload: {
        userId,
        reason,
        voteId: vote.id
      },

      metadata: {
        userId:
          command.metadata?.userId
      }
    };

    await eventStore.append(event);

    await eventBus.publish(event);

    realtimeBus.broadcast(
      REALTIME_EVENTS.RESULTS_UPDATED,
      {
        electionId,
        action: 'vote_invalidated',
        userId,
        reason
      }
    );

    clearAggregateCache(electionId);

    logger.info(
      'Vote invalidated successfully',
      {
        electionId,
        userId
      }
    );

  } catch (error: unknown) {

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.error(
      'Invalidate vote failed',
      {
        electionId,
        userId,
        error: errorMessage
      }
    );

    throw error;
  }
};

/**
 * =========================================================
 * UPDATE RULES
 * =========================================================
 */

export const updateVotingRulesHandler:
  CommandHandler<UpdateVotingRulesCommand> =
async (
  command: UpdateVotingRulesCommand
) => {

  const {
    electionId,
    rules
  } = command.payload;

  try {

    const aggregate =
      await getVoteAggregate(electionId);

    aggregate.updateRules(rules);

    const event: DomainEvent = {
      id: uuidv4(),

      type: 'VotingRulesUpdated',

      aggregateId: electionId,

      aggregateType: 'vote',

      version:
        aggregate.getState().version + 1,

      timestamp: Date.now(),

      payload: rules,

      metadata: {
        userId:
          command.metadata?.userId
      }
    };

    await eventStore.append(event);

    await eventBus.publish(event);

    realtimeBus.broadcast(
      REALTIME_EVENTS.ELECTION_UPDATED,
      {
        electionId,
        rules,
        updatedAt: new Date().toISOString()
      }
    );

    clearAggregateCache(electionId);

    logger.info(
      'Voting rules updated',
      {
        electionId
      }
    );

  } catch (error: unknown) {

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.error(
      'Update voting rules failed',
      {
        electionId,
        error: errorMessage
      }
    );

    throw error;
  }
};

/**
 * =========================================================
 * REGISTER COMMANDS
 * =========================================================
 */

export function registerVoteCommandHandlers(): void {

  const commandBus =
    require('../../core/command-bus/CommandBus').default;

  commandBus.register(
    'CastVote',
    castVoteHandler
  );

  commandBus.register(
    'CancelVote',
    cancelVoteHandler
  );

  commandBus.register(
    'VerifyVote',
    verifyVoteHandler
  );

  commandBus.register(
    'InvalidateVote',
    invalidateVoteHandler
  );

  commandBus.register(
    'UpdateVotingRules',
    updateVotingRulesHandler
  );

  logger.info(
    'Vote command handlers registered'
  );
}

/**
 * =========================================================
 * UNREGISTER COMMANDS
 * =========================================================
 */

export function unregisterVoteCommandHandlers(): void {

  const commandBus =
    require('../../core/command-bus/CommandBus').default;

  commandBus.unregister('CastVote');
  commandBus.unregister('CancelVote');
  commandBus.unregister('VerifyVote');
  commandBus.unregister('InvalidateVote');
  commandBus.unregister('UpdateVotingRules');

  logger.info(
    'Vote command handlers unregistered'
  );
}

/**
 * =========================================================
 * EXPORT TYPES
 * =========================================================
 */

export type VoteCommand =
  | CastVoteCommand
  | CancelVoteCommand
  | VerifyVoteCommand
  | InvalidateVoteCommand
  | UpdateVotingRulesCommand;