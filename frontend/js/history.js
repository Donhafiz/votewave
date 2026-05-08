/**
 * VoteWave - Voting History Page JavaScript
 * Handles display of user's voting history
 */

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadVotingHistory();
});

let currentPage = 1;

// Check authentication
function checkAuth() {
  if (!isLoggedIn()) {
    window.location.href = '../auth/login.html';
    return;
  }
}

// Load voting history
async function loadVotingHistory(page = 1) {
  const container = document.getElementById('historyContainer');
  const emptyState = document.getElementById('emptyState');
  
  if (!container) return;

  // Show loading state
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading your voting history...</p>
    </div>
  `;

  try {
    const response = await apiRequest(`/users/voting-history?page=${page}&limit=10`);
    
    if (response.success) {
      if (response.data.length === 0) {
        container.classList.add('hidden');
        emptyState?.classList.remove('hidden');
        return;
      }

      container.classList.remove('hidden');
      emptyState?.classList.add('hidden');

      renderHistory(response.data);
      renderPagination(response.pagination);
    } else {
      showToast('Failed to load voting history', 'error');
    }
  } catch (error) {
    console.error('Error loading history:', error);
    showToast('Failed to load voting history', 'error');
  }
}

// Render voting history
function renderHistory(votes) {
  const container = document.getElementById('historyContainer');
  
  container.innerHTML = votes.map(vote => {
    const election = vote.election || {};
    const statusColors = {
      active: 'success',
      upcoming: 'info',
      closed: 'gray',
    };

    return `
      <div class="history-item">
        <div class="history-icon">
          <i data-lucide="vote"></i>
        </div>
        <div class="history-content">
          <div class="history-title">${escapeHtml(election.title || 'Unknown Election')}</div>
          <div class="history-meta">
            <span class="status-badge-small ${election.status || 'closed'}">${election.status || 'Closed'}</span>
            <span>•</span>
            <span>${timeAgo(vote.votedAt)}</span>
            ${vote.candidate ? `<span>• Voted for <strong>${escapeHtml(vote.candidate.name)}</strong></span>` : ''}
          </div>
        </div>
        <div class="history-code">
          ${vote.confirmationCode}
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// Render pagination
function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!container || !pagination || pagination.totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = '';
  
  // Previous button
  html += `
    <button ${pagination.page === 1 ? 'disabled' : ''} onclick="changePage(${pagination.page - 1})">
      <i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i>
    </button>
  `;

  // Page numbers
  for (let i = 1; i <= pagination.totalPages; i++) {
    if (i === 1 || i === pagination.totalPages || (i >= pagination.page - 1 && i <= pagination.page + 1)) {
      html += `<button class="${i === pagination.page ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    } else if (i === pagination.page - 2 || i === pagination.page + 2) {
      html += `<span>...</span>`;
    }
  }

  // Next button
  html += `
    <button ${!pagination.hasNext ? 'disabled' : ''} onclick="changePage(${pagination.page + 1})">
      <i data-lucide="chevron-right" style="width: 16px; height: 16px;"></i>
    </button>
  `;

  container.innerHTML = html;
  lucide.createIcons();
}

// Change page
function changePage(page) {
  currentPage = page;
  loadVotingHistory(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helper function
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
