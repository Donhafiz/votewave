/**
 * VoteWave - Election Detail Page JavaScript
 * Handles election viewing, candidate display, and voting
 */

let currentElection = null;
let currentCandidates = [];
let selectedCandidate = null;
let hasVoted = false;
let resultsChart = null;

document.addEventListener('DOMContentLoaded', () => {
  loadElectionDetails();
  initModals();
});

// Load election details
async function loadElectionDetails() {
  const electionId = getElectionIdFromUrl();
  if (!electionId) {
    showToast('Election not found', 'error');
    window.location.href = 'elections.html';
    return;
  }

  try {
    const response = await apiRequest(`/elections/${electionId}`);
    
    if (response.success) {
      currentElection = response.data;
      renderElectionHeader(response.data);
      renderCandidates(response.data.candidates);
      renderSidebar(response.data);
      
      // Check if user has voted
      if (isLoggedIn()) {
        checkVoteStatus(electionId);
      }
      
      // Load results if election is closed
      if (response.data.status === 'closed' && response.data.results) {
        renderResults(response.data.results);
      }
    } else {
      showToast('Failed to load election', 'error');
    }
  } catch (error) {
    console.error('Error loading election:', error);
    showToast('Failed to load election details', 'error');
  }
}

// Get election ID from URL
function getElectionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// Render election header
function renderElectionHeader(election) {
  const header = document.getElementById('electionHeader');
  if (!header) return;

  const startDate = new Date(election.startDate);
  const endDate = new Date(election.endDate);
  const now = new Date();
  const isActive = now >= startDate && now <= endDate;

  header.innerHTML = `
    <h1>${escapeHtml(election.title)}</h1>
    <p>${escapeHtml(election.description || '')}</p>
    <div class="election-meta">
      <div class="meta-item">
        <i data-lucide="calendar"></i>
        <span>${formatDate(election.startDate)} - ${formatDate(election.endDate)}</span>
      </div>
      <div class="meta-item">
        <i data-lucide="users"></i>
        <span>${formatNumber(election.totalVotes)} votes cast</span>
      </div>
      ${election.timeRemaining ? `
        <div class="meta-item">
          <i data-lucide="clock"></i>
          <span>${election.timeRemaining.hours}h ${election.timeRemaining.minutes}m remaining</span>
        </div>
      ` : ''}
    </div>
  `;

  lucide.createIcons();
}

// Render candidates
function renderCandidates(candidates) {
  const grid = document.getElementById('candidatesGrid');
  if (!grid) return;

  currentCandidates = candidates;

  if (candidates.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>No candidates available for this election.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = candidates.map(candidate => `
    <div class="candidate-card" id="candidate-${candidate._id}">
      ${candidate.photo 
        ? `<img src="${candidate.photo}" alt="${candidate.name}" class="candidate-avatar">`
        : `<div class="candidate-avatar-placeholder">${candidate.name.charAt(0)}</div>`
      }
      <div class="candidate-info">
        <h3 class="candidate-name">${escapeHtml(candidate.name)}</h3>
        ${candidate.position ? `<p class="candidate-position">${escapeHtml(candidate.position)}</p>` : ''}
        ${candidate.bio ? `<p class="candidate-bio">${escapeHtml(truncateText(candidate.bio, 150))}</p>` : ''}
        ${candidate.platform ? `<span class="candidate-platform">${escapeHtml(truncateText(candidate.platform, 100))}</span>` : ''}
      </div>
      <button class="btn btn-primary vote-btn" onclick="selectCandidate('${candidate._id}')" ${!currentElection?.isEligible || hasVoted ? 'disabled' : ''}>
        ${hasVoted ? 'Voted' : 'Vote'}
      </button>
    </div>
  `).join('');
}

// Render sidebar
function renderSidebar(election) {
  const infoContainer = document.getElementById('electionInfo');
  const statusContainer = document.getElementById('voteStatusContent');
  
  if (infoContainer) {
    infoContainer.innerHTML = `
      <div class="info-item">
        <span class="label">Type</span>
        <span class="value">${election.type || 'Election'}</span>
      </div>
      <div class="info-item">
        <span class="label">Status</span>
        <span class="value">${election.status}</span>
      </div>
      <div class="info-item">
        <span class="label">Total Votes</span>
        <span class="value">${formatNumber(election.totalVotes)}</span>
      </div>
      <div class="info-item">
        <span class="label">Unique Voters</span>
        <span class="value">${formatNumber(election.uniqueVoters)}</span>
      </div>
    `;
  }

  if (statusContainer) {
    if (!isLoggedIn()) {
      statusContainer.innerHTML = `
        <p>Please <a href="../auth/login.html">sign in</a> to vote in this election.</p>
      `;
    } else if (!election.isEligible) {
      statusContainer.innerHTML = `
        <p>You are not eligible to vote in this election.</p>
      `;
    } else if (election.status !== 'active') {
      statusContainer.innerHTML = `
        <p>Voting is ${election.status === 'upcoming' ? 'not yet open' : 'closed'}.</p>
      `;
    } else {
      statusContainer.innerHTML = `
        <p>You are eligible to vote. Select a candidate to cast your vote.</p>
      `;
    }
  }
}

// Check if user has voted
async function checkVoteStatus(electionId) {
  try {
    const response = await apiRequest(`/elections/${electionId}/votes/status`);
    
    if (response.success && response.data.hasVoted) {
      hasVoted = true;
      
      // Update UI to show voted state
      document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.textContent = 'Voted';
        btn.disabled = true;
      });

      const statusContainer = document.getElementById('voteStatusContent');
      if (statusContainer) {
        statusContainer.innerHTML = `
          <div class="voted-badge">
            <i data-lucide="check-circle"></i>
            <span>You have voted in this election</span>
          </div>
          <p class="confirmation-code">Confirmation: ${response.data.confirmationCode}</p>
        `;
        lucide.createIcons();
      }
    }
  } catch (error) {
    console.error('Error checking vote status:', error);
  }
}

// Select candidate for voting
function selectCandidate(candidateId) {
  if (!isLoggedIn()) {
    showToast('Please sign in to vote', 'error');
    return;
  }

  if (hasVoted) {
    showToast('You have already voted in this election', 'warning');
    return;
  }

  selectedCandidate = currentCandidates.find(c => c._id === candidateId);
  if (!selectedCandidate) return;

  // Show confirmation modal
  const confirmationDiv = document.getElementById('voteConfirmation');
  if (confirmationDiv) {
    confirmationDiv.innerHTML = `
      <div class="candidate-preview">
        ${selectedCandidate.photo 
          ? `<img src="${selectedCandidate.photo}" alt="${selectedCandidate.name}" class="candidate-avatar-large">`
          : `<div class="candidate-avatar-large candidate-avatar-placeholder">${selectedCandidate.name.charAt(0)}</div>`
        }
        <h4 class="candidate-name">${escapeHtml(selectedCandidate.name)}</h4>
      </div>
      <p class="warning-text">This action cannot be undone. Your vote is final.</p>
    `;
  }

  document.getElementById('voteModal')?.classList.remove('hidden');
}

// Cast vote
async function castVote() {
  if (!selectedCandidate) return;

  const electionId = getElectionIdFromUrl();
  const confirmBtn = document.getElementById('confirmVote');
  
  setButtonLoading(confirmBtn, true);

  try {
    const response = await apiRequest(`/elections/${electionId}/votes`, {
      method: 'POST',
      body: { candidateId: selectedCandidate._id },
    });

    if (response.success) {
      hasVoted = true;
      
      // Close vote modal
      document.getElementById('voteModal')?.classList.add('hidden');
      
      // Show success modal
      const codeDiv = document.getElementById('confirmationCode');
      if (codeDiv) {
        codeDiv.innerHTML = `
          <div class="code-label">Confirmation Code</div>
          <div class="code-value">${response.data.confirmationCode}</div>
        `;
      }
      
      document.getElementById('successModal')?.classList.remove('hidden');

      // Update UI
      document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.textContent = 'Voted';
        btn.disabled = true;
      });

      showToast('Vote cast successfully!', 'success');
    } else {
      showToast(response.message || 'Failed to cast vote', 'error');
    }
  } catch (error) {
    showToast(error.message || 'Failed to cast vote', 'error');
  } finally {
    setButtonLoading(confirmBtn, false);
  }
}

// Render results
function renderResults(results) {
  const resultsCard = document.getElementById('resultsCard');
  if (resultsCard) {
    resultsCard.classList.remove('hidden');
  }

  // Render chart
  const ctx = document.getElementById('resultsChart');
  if (ctx && results.candidates.length > 0) {
    if (resultsChart) {
      resultsChart.destroy();
    }

    resultsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: results.candidates.map(c => c.name),
        datasets: [{
          data: results.candidates.map(c => c.votes),
          backgroundColor: [
            '#6366f1',
            '#8b5cf6',
            '#f59e0b',
            '#10b981',
            '#ec4899',
            '#06b6d4',
          ],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
      },
    });
  }

  // Render results list
  const listContainer = document.getElementById('resultsList');
  if (listContainer) {
    const maxVotes = Math.max(...results.candidates.map(c => c.votes));
    
    listContainer.innerHTML = results.candidates.map(candidate => `
      <div class="result-item">
        <div style="flex: 1;">
          <div class="result-bar">
            <div class="result-fill" style="width: ${maxVotes > 0 ? (candidate.votes / maxVotes * 100) : 0}%"></div>
          </div>
          <div class="result-info">
            <span>${escapeHtml(candidate.name)}</span>
            <span>${candidate.votes} votes (${candidate.percentage}%)</span>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// Initialize modals
function initModals() {
  // Vote modal
  document.getElementById('closeVoteModal')?.addEventListener('click', () => {
    document.getElementById('voteModal')?.classList.add('hidden');
  });

  document.getElementById('cancelVote')?.addEventListener('click', () => {
    document.getElementById('voteModal')?.classList.add('hidden');
  });

  document.getElementById('confirmVote')?.addEventListener('click', castVote);

  // Success modal
  document.getElementById('closeSuccessModal')?.addEventListener('click', () => {
    document.getElementById('successModal')?.classList.add('hidden');
  });

  // Close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', () => {
      overlay.closest('.modal')?.classList.add('hidden');
    });
  });
}

// Helper function
function setButtonLoading(button, loading) {
  if (!button) return;
  
  if (loading) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner" style="width: 1rem; height: 1rem; border-color: transparent; border-top-color: currentColor;"></span>';
  } else {
    button.disabled = false;
    button.innerHTML = '<span>Confirm Vote</span><i data-lucide="check"></i>';
    lucide.createIcons();
  }
}
