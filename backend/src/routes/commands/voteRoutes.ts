/**
 * Vote Command API Routes - REST endpoints for voting commands
 * Provides HTTP interface for the write side of the voting system
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import commandBus from '../../core/command-bus/CommandBus';
import { CastVoteCommand, CancelVoteCommand, VerifyVoteCommand, InvalidateVoteCommand } from '../../domain/vote/VoteCommands';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * POST /api/commands/vote/cast
 * Cast a vote in an election
 */
router.post('/cast', async (req: Request, res: Response) => {
  try {
    const { electionId, userId, candidateId, metadata } = req.body;

    // Validate request
    if (!electionId || !userId || !candidateId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'electionId, userId, and candidateId are required'
      });
    }

    // Create command
    const command: CastVoteCommand = {
      id: uuidv4(),
      type: 'CastVote',
      timestamp: Date.now(),
      payload: {
        electionId,
        userId,
        candidateId,
        metadata: {
          ...metadata,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: Date.now()
        }
      },
      metadata: {
        requestId: uuidv4(),
        userId,
        correlationId: uuidv4()
      }
    };

    // Execute command
    const result = await commandBus.execute(command);

    logger.info('Vote cast command executed', {
      requestId: command.metadata?.requestId,
      electionId,
      userId,
      candidateId,
      success: result.success,
      duration: result.duration
    });

    return res.json({
      success: true,
      data: {
        commandId: result.commandId,
        electionId,
        userId,
        candidateId,
        timestamp: result.timestamp
      },
      message: 'Vote cast successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to cast vote', {
      electionId: req.body.electionId,
      userId: req.body.userId,
      candidateId: req.body.candidateId,
      error: errorMessage
    });

    return res.status(400).json({
      success: false,
      error: 'Failed to cast vote',
      message: errorMessage
    });
  }
});

/**
 * POST /api/commands/vote/cancel
 * Cancel a previously cast vote
 */
router.post('/cancel', async (req: Request, res: Response) => {
  const { electionId, userId, reason } = req.body;
  let command: CancelVoteCommand | null = null;

  try {
    // Validate request
    if (!electionId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'electionId and userId are required'
      });
    }

    // Create command
    command = {
      id: uuidv4(),
      type: 'CancelVote',
      timestamp: Date.now(),
      payload: {
        electionId,
        userId,
        reason
      },
      metadata: {
        requestId: uuidv4(),
        userId,
        correlationId: uuidv4()
      }
    };

    // Execute command
    const result = await commandBus.execute(command);

    logger.info('Vote cancel command executed', {
      requestId: command.metadata?.requestId,
      electionId,
      userId,
      success: result.success,
      duration: result.duration
    });

    return res.json({
      success: true,
      data: {
        commandId: result.commandId,
        electionId,
        userId,
        timestamp: result.timestamp
      },
      message: 'Vote cancelled successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to cancel vote', {
      requestId: command?.metadata?.requestId,
      electionId,
      userId,
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to cancel vote',
      message: errorMessage
    });
  }
});

/**
 * POST /api/commands/vote/verify
 * Verify a vote (admin operation)
 */
router.post('/verify', async (req: Request, res: Response) => {
  const { electionId, userId } = req.body;
  const isAdmin = (req as any).user?.role === 'admin';
  let command: VerifyVoteCommand | null = null;

  try {
    // Validate request
    if (!electionId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'electionId and userId are required'
      });
    }

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin privileges required'
      });
    }

    // Create command
    command = {
      id: uuidv4(),
      type: 'VerifyVote',
      timestamp: Date.now(),
      payload: {
        electionId,
        userId
      },
      metadata: {
        requestId: uuidv4(),
        userId,
        correlationId: uuidv4()
      }
    };

    // Execute command
    const result = await commandBus.execute(command);

    logger.info('Vote verify command executed', {
      requestId: command.metadata?.requestId,
      electionId,
      userId,
      success: result.success,
      duration: result.duration
    });

    return res.json({
      success: true,
      data: {
        commandId: result.commandId,
        electionId,
        userId,
        timestamp: result.timestamp
      },
      message: 'Vote verified successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to verify vote', {
      requestId: command?.metadata?.requestId,
      electionId,
      userId,
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to verify vote',
      message: errorMessage
    });
  }
});

/**
 * POST /api/commands/vote/invalidate
 * Invalidate a vote (admin operation)
 */
router.post('/invalidate', async (req: Request, res: Response) => {
  try {
    const { electionId, userId, reason } = req.body;

    // Validate request
    if (!electionId || !userId || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'electionId, userId, and reason are required'
      });
    }

    // Check admin permissions (simplified)
    const isAdmin = req.headers['x-user-role'] === 'admin';
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin privileges required'
      });
    }

    // Create command
    const command: InvalidateVoteCommand = {
      id: uuidv4(),
      type: 'InvalidateVote',
      timestamp: Date.now(),
      payload: {
        electionId,
        userId,
        reason
      },
      metadata: {
        requestId: uuidv4(),
        userId,
        correlationId: uuidv4()
      }
    };

    // Execute command
    const result = await commandBus.execute(command);

    logger.info('Vote invalidate command executed', {
      requestId: command.metadata?.requestId,
      electionId,
      userId,
      reason,
      success: result.success,
      duration: result.duration
    });

    return res.json({
      success: true,
      data: {
        commandId: result.commandId,
        electionId,
        userId,
        reason,
        timestamp: result.timestamp
      },
      message: 'Vote invalidated successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to invalidate vote', {
      electionId: req.body.electionId,
      userId: req.body.userId,
      reason: req.body.reason,
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to invalidate vote',
      message: errorMessage
    });
  }
});

/**
 * GET /api/commands/vote/status/:electionId/:userId
 * Check voting status for a user in an election
 */
router.get('/status/:electionId/:userId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;
    const userId = req.params['userId'] as string;

    // This would typically query the read model
    // For now, we'll return a basic status check
    const voteProjection = require('../../core/projections/VoteProjection').default;
    const statistics = voteProjection.getStatistics(electionId);
    const participation = voteProjection.getParticipation(electionId);
    
    const userVote = participation.find((v: any) => v.userId === userId);

    return res.json({
      success: true,
      data: {
        electionId,
        userId,
        hasVoted: !!userVote,
        vote: userVote ? {
          candidateId: userVote.candidateId,
          votedAt: userVote.votedAt,
          verified: userVote.verified,
          region: userVote.region
        } : null,
        electionStats: statistics ? {
          totalVotes: statistics.totalVotes,
          validVotes: statistics.validVotes,
          isActive: statistics.votingPeriod.isActive
        } : null
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get voting status', {
      electionId: req.params['electionId'],
      userId: req.params['userId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get voting status',
      message: errorMessage
    });
  }
});

/**
 * GET /api/commands/vote/health
 * Health check for vote command API
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const systemHealth = await require('../../core').getSystemHealth();
    
    return res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        system: systemHealth
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Health check failed', { error: errorMessage });
    return res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: errorMessage
    });
  }
});

/**
 * GET /api/commands/vote/metrics
 * Get system metrics
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const systemStats = await require('../../core').getSystemStatistics();
    
    return res.json({
      success: true,
      data: systemStats
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get metrics', { error: errorMessage });
    return res.status(500).json({
      success: false,
      error: 'Failed to get metrics',
      message: errorMessage
    });
  }
});

export default router;
