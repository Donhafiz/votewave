/**
 * VoteWave - Core Admin JavaScript
 * Shared admin functionality across all admin pages
 */

// Admin State
const AdminState = {
  currentUser: null,
  sidebarOpen: false,
  theme: localStorage.getItem('admin-theme') || 'dark',
};

document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
  initAdminSidebar();
  initAdminTheme();
  initAdminSearch();
  initGlobalKeyboardShortcuts();
});

// Check admin authentication
function initAdminAuth() {
  if (typeof isLoggedIn !== 'function') {
    console.warn('main.js not loaded - skipping auth check');
    return;
  }
  
  if (!isLoggedIn()) {
    window.location.href = '../auth/login.html';
    return;
  }

  const user = getUser();
  if (user && user.role !== 'admin' && user.role !== 'superadmin') {
    showAdminToast('Access denied. Admin privileges required.', 'error');
    setTimeout(() => {
      window.location.href = '../voter/elections.html';
    }, 1500);
    return;
  }
  
  AdminState.currentUser = user;
}

// Sidebar toggle
function initAdminSidebar() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  
  toggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    AdminState.sidebarOpen = sidebar?.classList.contains('open');
  });
  
  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (AdminState.sidebarOpen && 
        sidebar && 
        !sidebar.contains(e.target) && 
        toggle && 
        !toggle.contains(e.target)) {
      sidebar.classList.remove('open');
      AdminState.sidebarOpen = false;
    }
  });
}

// Theme management
function initAdminTheme() {
  const themeToggle = document.getElementById('themeToggle');
  
  // Apply saved theme
  if (AdminState.theme === 'light') {
    document.body.classList.add('light-mode');
  }
  
  themeToggle?.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    AdminState.theme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
    localStorage.setItem('admin-theme', AdminState.theme);
    
    const icon = themeToggle.querySelector('svg');
    if (icon) {
      icon.setAttribute('data-lucide', AdminState.theme === 'light' ? 'sun' : 'moon');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  });
}

// Global search
function initAdminSearch() {
  const searchInput = document.getElementById('globalSearch') || document.getElementById('searchInput');
  
  searchInput?.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      this.value = '';
      this.blur();
    }
  });
}

// Keyboard shortcuts
function initGlobalKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K: Focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('globalSearch')?.focus();
    }
    
    // Escape: Close modals
    if (e.key === 'Escape') {
      document.querySelectorAll('.admin-modal:not(.hidden)').forEach(modal => {
        modal.classList.add('hidden');
      });
    }
  });
}

// Toast notification
function showAdminToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'admin-toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Set button loading state
function setButtonLoading(button, loading) {
  if (!button) return;
  
  if (loading) {
    button.disabled = true;
    button._originalHTML = button.innerHTML;
    button.innerHTML = '<span class="admin-spinner" style="width:1rem;height:1rem;border-width:2px;"></span>';
  } else {
    button.disabled = false;
    if (button._originalHTML) {
      button.innerHTML = button._originalHTML;
      delete button._originalHTML;
    }
  }
}

// Confirm dialog
function confirmAction(message) {
  return window.confirm(message || 'Are you sure you want to proceed?');
}

// Format number with commas
function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Truncate text
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Format date for input fields
function formatDateTimeLocal(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

// Get URL parameter
function getUrlParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Export table to CSV
function exportTableToCSV(selector, filename) {
  const table = document.querySelector(selector);
  if (!table) return;
  
  let csv = [];
  const rows = table.querySelectorAll('tr');
  
  rows.forEach(row => {
    const cols = row.querySelectorAll('td, th');
    const rowData = Array.from(cols).map(col => `"${col.textContent.trim().replace(/"/g, '""')}"`);
    csv.push(rowData.join(','));
  });

  function showAdminToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer') || (() => {
    const c = document.createElement('div'); c.id = 'toastContainer'; c.className = 'toast-container'; document.body.appendChild(c); return c;
  })();
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

  function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; }
  function formatNumber(n) { return (n||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  
  const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  
  showAdminToast('Export completed!', 'success');
}

// Initialize modal close handlers
function initModalHandlers(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  // Close button
  modal.querySelector('.admin-modal-close')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  
  // Overlay click
  modal.querySelector('.admin-modal-overlay')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  
  // Cancel button
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}

// Fetch API wrapper for admin
async function adminApiRequest(endpoint, options = {}) {
  if (window.VoteWave && typeof window.VoteWave.apiRequest === 'function') {
    return window.VoteWave.apiRequest(endpoint, options);
  }
  
  // Fallback to configured API base URL or localhost during development
  const apiBase = window.API_BASE_URL || 'http://localhost:5000/api';
  const url = `${apiBase}${endpoint}`;
  const token = localStorage.getItem('accessToken');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };
  
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }
  
  try {
    const response = await fetch(url, config);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Export for global use
window.showAdminToast = showAdminToast;
window.setButtonLoading = setButtonLoading;
window.confirmAction = confirmAction;
window.formatNumber = formatNumber;
window.escapeHtml = escapeHtml;
window.truncateText = truncateText;
window.formatDateTimeLocal = formatDateTimeLocal;
window.getUrlParam = getUrlParam;
window.exportTableToCSV = exportTableToCSV;
window.initModalHandlers = initModalHandlers;
window.adminApiRequest = adminApiRequest;