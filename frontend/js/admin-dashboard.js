/**
 * VoteWave - Admin Dashboard JavaScript
 * Handles dashboard statistics, charts, and real-time updates
 */

let activityChart = null;
let statusChart = null;
let autoRefreshInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

function initDashboard() {
  loadDashboardStats();
  initCharts();
  loadRecentElections();
  loadActivityTimeline();
  initPeriodButtons();
  initAutoRefresh();
  
  // Refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    refreshDashboard();
  });
}

async function loadDashboardStats() {
  try {
    const response = await adminApiRequest('/admin/dashboard');
    
    if (response.success) {
      const stats = response.data.stats || response.data;
      
      updateStatElement('totalElections', stats.totalElections || 0);
      updateStatElement('activeElections', stats.activeElections || 0);
      updateStatElement('totalUsers', stats.totalUsers || 0);
      updateStatElement('totalVotes', stats.totalVotes || 0);
      
      // Update badge
      const badge = document.getElementById('activeElectionsBadge');
      if (badge) badge.textContent = stats.activeElections || 0;
      
      // Update trends
      updateTrend('electionsTrend', stats.electionGrowth || 12);
      updateTrend('activeTrend', stats.activeGrowth || 8);
      updateTrend('usersTrend', stats.userGrowth || 15);
      updateTrend('votesTrend', stats.voteGrowth || 25);
      
      // Update charts if data available
      if (stats.votingActivity && stats.votingActivity.length > 0) {
        const activityData = {
          labels: stats.votingActivity.map(item => {
            const date = new Date(item.date);
            return date.toLocaleDateString('en-US', { weekday: 'short' });
          }),
          values: stats.votingActivity.map(item => item.votes)
        };
        updateActivityChart(activityData);
      }
      
      if (stats.electionStatus) {
        const statusData = {
          active: stats.electionStatus.active || 0,
          completed: stats.electionStatus.completed || 0,
          upcoming: stats.electionStatus.upcoming || 0,
          draft: stats.electionStatus.draft || 0
        };
        updateStatusChart(statusData);
      }
    } else {
      loadSampleData();
    }
  } catch (error) {
    console.log('Loading sample dashboard data');
    loadSampleData();
  }
}

function loadSampleData() {
  updateStatElement('totalElections', 12);
  updateStatElement('activeElections', 3);
  updateStatElement('totalUsers', 2450);
  updateStatElement('totalVotes', 5230);
  
  const badge = document.getElementById('activeElectionsBadge');
  if (badge) badge.textContent = '3';
  
  updateTrend('electionsTrend', 12);
  updateTrend('activeTrend', 8);
  updateTrend('usersTrend', 15);
  updateTrend('votesTrend', 25);
}

function updateStatElement(id, value) {
  const el = document.getElementById(id);
  if (el) {
    animateValue(el, parseInt(el.textContent) || 0, value, 1000);
  }
}

function animateValue(element, start, end, duration) {
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (end - start) * eased);
    element.textContent = formatNumber(current);
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

function updateTrend(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  
  const isPositive = value >= 0;
  el.innerHTML = `${isPositive ? '↑' : '↓'} ${Math.abs(value)}%`;
  el.className = `admin-stat-trend ${isPositive ? 'up' : 'down'}`;
}

function initCharts() {
  // Activity Chart
  const actCtx = document.getElementById('activityChart');
  if (actCtx && typeof Chart !== 'undefined') {
    activityChart = new Chart(actCtx, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Votes',
          data: [120, 250, 180, 400, 350, 520, 480],
          backgroundColor: 'rgba(99,102,241,0.6)',
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { 
            grid: { display: false }, 
            ticks: { color: '#64748b', font: { family: 'Inter' } } 
          },
          y: { 
            grid: { color: 'rgba(255,255,255,0.05)' }, 
            ticks: { color: '#64748b', font: { family: 'Inter' } },
            beginAtZero: true
          }
        }
      }
    });
  }
  
  // Status Chart
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx && typeof Chart !== 'undefined') {
    statusChart = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Completed', 'Upcoming', 'Draft'],
        datasets: [{
          data: [3, 7, 2, 1],
          backgroundColor: ['#10b981', '#64748b', '#f59e0b', '#6366f1'],
          borderWidth: 0,
          hoverBorderWidth: 2,
          hoverBorderColor: '#1e293b',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { 
            position: 'bottom', 
            labels: { 
              color: '#94a3b8', 
              padding: 20, 
              usePointStyle: true,
              pointStyleWidth: 8,
              font: { family: 'Inter', size: 11 }
            } 
          }
        }
      }
    });
  }
}

function updateActivityChart(data) {
  if (!activityChart) return;
  activityChart.data.labels = data.labels;
  activityChart.data.datasets[0].data = data.values;
  activityChart.update();
}

function updateStatusChart(data) {
  if (!statusChart) return;
  statusChart.data.datasets[0].data = [data.active, data.completed, data.upcoming, data.draft];
  statusChart.update();
}

async function loadRecentElections() {
  const tbody = document.getElementById('recentElectionsBody');
  if (!tbody) return;
  
  try {
    const response = await adminApiRequest('/elections?limit=5');
    if (response.success && response.data.length > 0) {
      renderRecentElectionsTable(tbody, response.data);
      return;
    }
    if (loadLocalRecentElections(tbody)) return;
  } catch (error) {
    if (loadLocalRecentElections(tbody)) return;
  }
  
  // Sample data
  const sampleElections = [
    { _id: '1', title: 'Student Council 2026', status: 'active', totalVotes: 1247, turnout: 78 },
    { _id: '2', title: 'Best Teacher Award', status: 'active', totalVotes: 892, turnout: 64 },
    { _id: '3', title: 'Annual Fest Theme', status: 'completed', totalVotes: 2150, turnout: 92 },
    { _id: '4', title: 'Club President Election', status: 'upcoming', totalVotes: 0, turnout: 0 },
  ];
  renderRecentElectionsTable(tbody, sampleElections);
}

function getLocalStoredElections() {
  return JSON.parse(localStorage.getItem('votewave_elections') || '[]');
}

function loadLocalRecentElections(tbody) {
  const localElections = getLocalStoredElections();
  if (!localElections || localElections.length === 0) return false;

  const recentLocal = localElections
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  renderRecentElectionsTable(tbody, recentLocal);
  return true;
}

function renderRecentElectionsTable(tbody, elections) {
  tbody.innerHTML = elections.map(e => `
    <tr>
      <td>
        <div class="cell-election">
          <div class="cell-avatar">${e.title.charAt(0)}</div>
          <div class="cell-info">
            <h4>${escapeHtml(e.title)}</h4>
          </div>
        </div>
      </td>
      <td><span class="admin-badge ${e.status}">${e.status}</span></td>
      <td>${formatNumber(e.totalVotes)}</td>
      <td>${e.turnout || 0}%</td>
      <td>
        <div class="admin-action-btns">
          <button class="admin-action-btn edit-election-btn" data-election-id="${e._id}" title="Edit">
            <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
          </button>
          <button class="admin-action-btn view-results-btn" data-election-id="${e._id}" title="View Results">
            <i data-lucide="bar-chart-3" style="width:14px;height:14px;"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  attachRecentElectionListeners();
}

function attachRecentElectionListeners() {
  document.querySelectorAll('.edit-election-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const electionId = btn.dataset.electionId;
      window.location.href = `elections.html?edit=${electionId}`;
    });
  });

  document.querySelectorAll('.view-results-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const electionId = btn.dataset.electionId;
      window.location.href = `results.html?id=${electionId}`;
    });
  });
}

function loadActivityTimeline() {
  const container = document.getElementById('activityTimeline');
  if (!container) return;
  
  const activities = [
    { icon: 'vote', type: 'election', title: 'New election "Student Council 2026" created', time: '5 minutes ago' },
    { icon: 'user-plus', type: 'user', title: '3 new voters registered', time: '15 minutes ago' },
    { icon: 'check-circle', type: 'vote', title: '47 votes cast in Student Council election', time: '1 hour ago' },
    { icon: 'user-plus', type: 'user', title: 'New admin account created', time: '2 hours ago' },
    { icon: 'settings', type: 'system', title: 'System settings updated', time: '3 hours ago' },
    { icon: 'user-plus', type: 'user', title: '5 new users invited by admin', time: '5 hours ago' },
  ];
  
  container.innerHTML = activities.map(a => `
    <div class="admin-timeline-item">
      <div class="admin-timeline-icon ${a.type}">
        <i data-lucide="${a.icon}"></i>
      </div>
      <div>
        <div class="admin-timeline-title">${a.title}</div>
        <div class="admin-timeline-meta">${a.time}</div>
      </div>
    </div>
  `).join('');
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function initPeriodButtons() {
  document.querySelectorAll('.admin-period-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const parent = this.parentElement;
      parent.querySelectorAll('.admin-period-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      const period = this.dataset.period;
      updateChartPeriod(period);
    });
  });
}

function updateChartPeriod(period) {
  let data;
  switch(period) {
    case 'week':
      data = { labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], values: [120,250,180,400,350,520,480] };
      break;
    case 'month':
      data = { labels: ['Week 1','Week 2','Week 3','Week 4'], values: [1200,1800,1500,2200] };
      break;
    case 'year':
      data = { labels: ['Jan','Mar','May','Jul','Sep','Nov'], values: [3200,4500,3800,5200,4800,6000] };
      break;
  }
  if (data && activityChart) {
    activityChart.data.labels = data.labels;
    activityChart.data.datasets[0].data = data.values;
    activityChart.update();
  }
}

function initAutoRefresh() {
  // Auto-refresh every 60 seconds
  autoRefreshInterval = setInterval(() => {
    loadDashboardStats();
    loadRecentElections();
    loadActivityTimeline();
  }, 60000);
}

function refreshDashboard() {
  loadDashboardStats();
  loadRecentElections();
  loadActivityTimeline();
  showAdminToast('Dashboard refreshed', 'success');
}

// Clean up on page leave
window.addEventListener('beforeunload', () => {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
});