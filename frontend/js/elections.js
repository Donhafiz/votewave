/**
 * VoteWave - Elections Page JavaScript
 * Handles election browsing and filtering
 */

document.addEventListener('DOMContentLoaded', () => {
  initializeFiltersFromUrl();
  initFilters();
  initSearch();
  loadElections(currentPage);
});

let currentFilter = 'all';
let currentSearch = '';
let currentPage = 1;

function initializeFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('status');
  const search = params.get('search');
  const page = parseInt(params.get('page'), 10);

  if (filter && ['all', 'active', 'upcoming', 'closed'].includes(filter)) {
    currentFilter = filter;
  }

  if (search) {
    currentSearch = search;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = search;
  }

  if (page && page > 0) {
    currentPage = page;
  }

  updateFilterButtons();
  updatePageHeader();
}

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.dataset.filter === currentFilter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updatePageHeader() {
  const headerTitle = document.querySelector('.page-header h1');
  const headerText = document.querySelector('.page-header p');
  const titles = {
    all: 'All Elections',
    active: 'Active Elections',
    upcoming: 'Upcoming Elections',
    closed: 'Closed Elections',
  };

  if (headerTitle) headerTitle.textContent = titles[currentFilter] || 'Elections';
  if (headerText) headerText.textContent = currentFilter === 'all'
    ? 'Browse all ongoing and upcoming elections.'
    : `Browse ${titles[currentFilter].toLowerCase()}.`;
}

// Load elections from API
async function loadElections(page = 1) {
  const grid = document.getElementById('electionsGrid');
  if (!grid) return;

  // Show loading state
  grid.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading elections...</p>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (currentFilter !== 'all') params.append('status', currentFilter);
    if (currentSearch) params.append('search', currentSearch);
    params.append('page', page);

    const response = await apiRequest(`/elections?${params}`);
    
    if (response.success) {
      renderElections(response.data);
      renderPagination(response.pagination);
    } else {
      showError('Failed to load elections');
    }
  } catch (error) {
    console.error('Error loading elections:', error);
    showError('Failed to load elections');
  }
}

// Render elections grid
function renderElections(elections) {
  const grid = document.getElementById('electionsGrid');
  
  if (elections.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">
          <i data-lucide="inbox"></i>
        </div>
        <h3>No elections found</h3>
        <p>There are no elections matching your criteria.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  grid.innerHTML = elections.map(election => `
    <div class="election-card" onclick="viewElection('${election._id}')">
      <div class="card-image">
        ${election.bannerImage 
          ? `<img src="${election.bannerImage}" alt="${election.title}">`
          : `<span>${election.title.charAt(0)}</span>`
        }
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(election.title)}</h3>
        <p class="card-description">${escapeHtml(truncateText(election.description || '', 100))}</p>
        <div class="card-meta">
          <span class="status-badge ${election.status}">${election.status}</span>
          <span class="card-date">
            <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
            ${formatDate(election.startDate, 'short')}
          </span>
        </div>
      </div>
      <div class="card-footer">
        <span class="vote-count">
          <strong>${formatNumber(election.totalVotes)}</strong> votes cast
        </span>
        <span class="btn btn-ghost btn-small">
          ${election.hasVoted ? 'View' : 'Vote'} 
          <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
        </span>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

// Render pagination
function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!container || !pagination) return;

  if (pagination.totalPages <= 1) {
    container.innerHTML = '';
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
  updateUrlState();
  loadElections(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Initialize filter buttons
function initFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update filter and reload
      currentFilter = btn.dataset.filter;
      currentPage = 1;
      updatePageHeader();
      updateUrlState();
      loadElections(1);
    });
  });
}

// Initialize search
function initSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  let debounceTimer;
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearch = e.target.value;
      currentPage = 1;
      updateUrlState();
      loadElections(1);
    }, 300);
  });
}

function updateUrlState() {
  const params = new URLSearchParams();
  if (currentFilter && currentFilter !== 'all') params.set('status', currentFilter);
  if (currentSearch) params.set('search', currentSearch);
  if (currentPage && currentPage > 1) params.set('page', currentPage);

  const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState({}, '', newUrl);
}

// View election details
function viewElection(id) {
  window.location.href = `election-detail.html?id=${id}`;
}

// Show error state
function showError(message) {
  const grid = document.getElementById('electionsGrid');
  if (grid) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">
          <i data-lucide="alert-circle"></i>
        </div>
        <h3>${message}</h3>
        <button class="btn btn-primary" onclick="loadElections()">Try Again</button>
      </div>
    `;
    lucide.createIcons();
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
