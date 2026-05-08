const { Anthropic } = require('@anthropic-ai/sdk');
const { Election, Candidate, Vote } = require('../models');

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const generateElectionSummary = async (electionId) => {
  try {
    const election = await Election.findById(electionId)
      .populate('candidates')
      .populate('createdBy', 'firstName lastName');

    if (!election) {
      throw new Error('Election not found');
    }

    const votes = await Vote.find({ election: electionId });
    
    const candidateStats = election.candidates.map(c => ({
      name: c.name,
      votes: c.voteCount,
      percentage: c.votePercentage,
    }));

    const prompt = `Generate a comprehensive election summary report for "${election.title}".

Election Details:
- Total Votes Cast: ${election.totalVotes}
- Unique Voters: ${election.uniqueVoters}
- Start Date: ${election.startDate}
- End Date: ${election.endDate}

Candidate Results:
${candidateStats.map(c => `- ${c.name}: ${c.votes} votes (${c.percentage}%)`).join('\n')}

Please provide:
1. A brief overview of the election
2. Analysis of the results
3. Notable trends or observations
4. Voter turnout assessment
5. Conclusion

Keep it professional and informative, suitable for public distribution.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const summary = response.content[0].text;
    
    election.aiSummary = summary;
    election.aiGeneratedAt = new Date();
    await election.save();

    return summary;
  } catch (error) {
    console.error('AI Summary Generation Error:', error);
    throw error;
  }
};

const getAIInsights = async (electionId) => {
  try {
    const election = await Election.findById(electionId).populate('candidates');
    
    if (!election) {
      throw new Error('Election not found');
    }

    // Get hourly vote trends (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentVotes = await Vote.find({
      election: electionId,
      votedAt: { $gte: twentyFourHoursAgo },
    });

    const hourlyTrends = {};
    recentVotes.forEach(vote => {
      const hour = new Date(vote.votedAt).getHours();
      hourlyTrends[hour] = (hourlyTrends[hour] || 0) + 1;
    });

    const prompt = `Analyze this election data and provide key insights:

Election: "${election.title}"
Current Status: ${election.status}
Total Votes: ${election.totalVotes}

Candidate Momentum (last 24 hours):
${recentVotes.length} votes cast recently

Candidate Standings:
${election.candidates.map(c => `- ${c.name}: ${c.voteCount} votes (${c.votePercentage}%)`).join('\n')}

Provide 3-5 key insights about:
1. Which candidate has the most momentum
2. Voting pattern observations
3. Turnout predictions
4. Strategic recommendations

Be concise and data-driven.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].text;
  } catch (error) {
    console.error('AI Insights Error:', error);
    throw error;
  }
};

const detectAnomalies = async (electionId) => {
  try {
    const votes = await Vote.find({ election: electionId });
    
    // Check for suspicious patterns
    const ipCounts = {};
    const timeClusters = {};
    
    votes.forEach(vote => {
      ipCounts[vote.ipAddress] = (ipCounts[vote.ipAddress] || 0) + 1;
      
      const minute = Math.floor(new Date(vote.votedAt).getTime() / (1000 * 60));
      timeClusters[minute] = (timeClusters[minute] || 0) + 1;
    });

    const suspiciousIPs = Object.entries(ipCounts)
      .filter(([ip, count]) => count > 5)
      .map(([ip, count]) => ({ ip, count }));

    const unusualSpikes = Object.entries(timeClusters)
      .filter(([time, count]) => count > 20)
      .map(([time, count]) => ({ time: new Date(parseInt(time) * 60000), count }));

    if (suspiciousIPs.length > 0 || unusualSpikes.length > 0) {
      const prompt = `Analyze potential voting anomalies:

Suspicious IP Activity:
${suspiciousIPs.map(ip => `- IP ${ip.ip}: ${ip.count} votes`).join('\n') || 'None detected'}

Unusual Time Spikes:
${unusualSpikes.map(spike => `- ${spike.time.toISOString()}: ${spike.count} votes in one minute`).join('\n') || 'None detected'}

Total Votes: ${votes.length}

Provide a brief assessment of whether these patterns indicate potential fraud or are within normal parameters.`;

      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      return {
        anomalies: {
          suspiciousIPs,
          unusualSpikes,
        },
        assessment: response.content[0].text,
        severity: suspiciousIPs.length > 2 || unusualSpikes.length > 2 ? 'high' : 'medium',
      };
    }

    return {
      anomalies: { suspiciousIPs: [], unusualSpikes: [] },
      assessment: 'No significant anomalies detected. Voting patterns appear normal.',
      severity: 'low',
    };
  } catch (error) {
    console.error('Anomaly Detection Error:', error);
    throw error;
  }
};

const chatWithVoter = async (message, context = {}) => {
  try {
    const { electionId, userRole } = context;
    
    let systemPrompt = `You are VoteWave Assistant, a helpful AI for an e-voting platform. 
You help voters understand the platform, elections, and candidates. Be friendly, concise, and accurate.
If asked about specific voting choices, remind users that votes are secret and you cannot see or influence individual votes.

Current user role: ${userRole || 'voter'}`;

    if (electionId) {
      const election = await Election.findById(electionId)
        .populate('candidates', 'name bio position platform');
      
      if (election) {
        systemPrompt += `\n\nCurrent election context: ${election.title}\nCandidates:\n${election.candidates.map(c => `- ${c.name}: ${c.position || 'Candidate'} - ${c.bio || 'No bio available'}`).join('\n')}`;
      }
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Chat Error:', error);
    return 'I apologize, but I am unable to respond at the moment. Please try again later.';
  }
};

module.exports = {
  generateElectionSummary,
  getAIInsights,
  detectAnomalies,
  chatWithVoter,
};
