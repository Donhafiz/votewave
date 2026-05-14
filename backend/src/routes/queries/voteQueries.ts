/**
 * Vote Query API Routes - REST endpoints for voting read models
 * Provides HTTP interface for the read side of the voting system
 */

import { Router, Request, Response } from 'express';
import voteProjection from '../../projections/VoteProjection';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/queries/vote/statistics/:electionId
 * Get voting statistics for an election
 */
router.get('/statistics/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;

    const statistics = voteProjection.getStatistics(electionId);
    
    if (!statistics) {
      return res.status(404).json({
        success: false,
        error: 'Election not found',
        message: `No statistics found for election: ${electionId}`
      });
    }

    return res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get voting statistics', {
      electionId: req.params['electionId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get voting statistics',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/results/:electionId
 * Get current voting results for an election
 */
router.get('/results/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;

    const statistics = voteProjection.getStatistics(electionId);
    
    if (!statistics) {
      return res.status(404).json({
        success: false,
        error: 'Election not found',
        message: `No results found for election: ${electionId}`
      });
    }

    const results = {
      electionId: statistics.electionId,
      totalVotes: statistics.totalVotes,
      validVotes: statistics.validVotes,
      candidateResults: statistics.candidateResults,
      leadingCandidate: statistics.leadingCandidate,
      votingPeriod: statistics.votingPeriod,
      lastUpdated: statistics.lastUpdated
    };

    return res.json({
      success: true,
      data: results
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get election results', {
      electionId: req.params['electionId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get election results',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/trends/:electionId
 * Get voting trends for an election
 */
router.get('/trends/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;
    const candidateId = req.query['candidateId'] as string | undefined;

    const trends = voteProjection.getTrends(electionId);
    
    if (!trends) {
      return res.status(404).json({
        success: false,
        error: 'Election not found',
        message: `No trends found for election: ${electionId}`
      });
    }

    let result;
    if (candidateId) {
      // Get trends for specific candidate
      const candidateTrend = trends.get(candidateId as string);
      if (!candidateTrend) {
        return res.status(404).json({
          success: false,
          error: 'Candidate not found',
          message: `No trends found for candidate: ${candidateId}`
        });
      }
      result = candidateTrend;
    } else {
      // Get trends for all candidates
      result = Object.fromEntries(trends);
    }

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get voting trends', {
      electionId: req.params['electionId'],
      candidateId: req.query['candidateId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get voting trends',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/participation/:electionId
 * Get voter participation data for an election
 */
router.get('/participation/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;
    const limit = req.query['limit'] as string || '100';
    const offset = req.query['offset'] as string || '0';
    const verified = req.query['verified'] as string | undefined;

    let participation = voteProjection.getParticipation(electionId);
    
    // Apply filters
    if (verified !== undefined) {
      const isVerified = verified === 'true';
      participation = participation.filter(p => p.verified === isVerified);
    }

    // Apply pagination
    const totalCount = participation.length;
    const paginatedParticipation = participation.slice(
      parseInt(offset as string),
      parseInt(offset as string) + parseInt(limit as string)
    );

    return res.json({
      success: true,
      data: {
        participation: paginatedParticipation,
        pagination: {
          total: totalCount,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: (parseInt(offset as string) + parseInt(limit as string)) < totalCount
        }
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get participation data', {
      electionId: req.params['electionId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get participation data',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/realtime/:electionId
 * Get real-time voting data
 */
router.get('/realtime/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;
    const minutes = req.query['minutes'] as string || '60';

    const realTimeData = voteProjection.getRealTimeData(electionId, parseInt(minutes));
    const votingRate = voteProjection.getVotingRate(electionId, 10); // Last 10 minutes

    return res.json({
      success: true,
      data: {
        electionId,
        timeWindow: `${minutes} minutes`,
        votes: realTimeData,
        votingRate: parseFloat(votingRate.toFixed(2)),
        timestamp: Date.now()
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get real-time data', {
      electionId: req.params['electionId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get real-time data',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/leaderboard/:electionId
 * Get candidate leaderboard for an election
 */
router.get('/leaderboard/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;
    const limit = req.query['limit'] as string || '10';

    const candidateRanking = voteProjection.getCandidateRanking(electionId);
    
    if (candidateRanking.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Election not found',
        message: `No data found for election: ${electionId}`
      });
    }

    const leaderboard = candidateRanking
      .slice(0, parseInt(limit as string))
      .map((candidate: any, index: number) => ({
        rank: index + 1,
        candidateId: candidate.candidateId,
        votes: candidate.votes,
        percentage: candidate.percentage,
        trend: candidate.trend
      }));

    return res.json({
      success: true,
      data: {
        electionId,
        leaderboard,
        totalCandidates: candidateRanking.length,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get leaderboard', {
      electionId: req.params['electionId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/demographics/:electionId
 * Get demographic breakdown for an election
 */
router.get('/demographics/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;

    const demographics = voteProjection.getDemographics(electionId);
    
    if (!demographics) {
      return res.status(404).json({
        success: false,
        error: 'Election not found',
        message: `No demographics found for election: ${electionId}`
      });
    }

    return res.json({
      success: true,
      data: {
        electionId,
        demographics,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get demographics', {
      electionId: req.params['electionId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get demographics',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/fraud-metrics/:electionId
 * Get fraud detection metrics for an election
 */
router.get('/fraud-metrics/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;

    const fraudMetrics = voteProjection.getFraudMetrics(electionId);
    
    if (!fraudMetrics) {
      return res.status(404).json({
        success: false,
        error: 'Election not found',
        message: `No fraud metrics found for election: ${electionId}`
      });
    }

    return res.json({
      success: true,
      data: {
        electionId,
        fraudMetrics,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get fraud metrics', {
      electionId: req.params['electionId'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get fraud metrics',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/turnout/:electionId
 * Get voter turnout for an election
 */
router.get('/turnout/:electionId', async (req: Request, res: Response) => {
  try {
    const electionId = req.params['electionId'] as string;
    const totalEligibleVoters = req.query['totalEligibleVoters'] as string;

    if (!totalEligibleVoters) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameter',
        message: 'totalEligibleVoters parameter is required'
      });
    }

    const turnout = voteProjection.getVoterTurnout(electionId, parseInt(totalEligibleVoters));
    const statistics = voteProjection.getStatistics(electionId);

    return res.json({
      success: true,
      data: {
        electionId,
        totalEligibleVoters: parseInt(totalEligibleVoters as string),
        totalVoters: statistics?.uniqueVoters || 0,
        turnoutPercentage: parseFloat(turnout.toFixed(2)),
        timestamp: Date.now()
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get voter turnout', {
      electionId: req.params['electionId'],
      totalEligibleVoters: req.query['totalEligibleVoters'],
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get voter turnout',
      message: errorMessage
    });
  }
});

/**
 * GET /api/queries/vote/health
 * Health check for vote query API
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

export default router;
