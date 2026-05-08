/**
 * VoteWave - Main JavaScript (Enhanced)
 * Core functionality shared across all pages
 * Production-ready with proper API URL detection
 */

// ─── API Configuration ───
const API_BASE_URL = (() => {
  // If running on Vercel/Railway (production), use the live backend
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  
  if (isLocalhost) {
    // Local development - use local backend
    return 'http://localhost:5000/api';
  }
  
  // Production - use live Railway backend
  return 'https://votewave-production.up.railway.app/api';
})();

window.API_BASE_URL = API_BASE_URL;
const FRONTEND_URL = window.location.origin;

// ─── Global State ───
const AppState = {
  theme: localStorage.getItem('theme') || 'dark',
  user: null,
  isAuthenticated: false,
  notifications: [],
  performance: { lcp: null, fcp: null }
};

// ─── Initialize on DOM Ready ───
document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  initNavigation();
  initThemeToggle();
  updateAuthUI();
  initScrollToTop();
  initToastSystem();
  initKeyboardShortcuts();
  initPerformanceMonitor();
  initLazyLoadImages();
  initSmoothScrollPolyfill();
  initFocusVisible();
  detectReducedMotion();
});

// ─── Navigation ───
function initNavigation() {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  const navActions = document.getElementById('navActions');
  const navbar = document.querySelector('.navbar');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const isOpen = !navMenu.classList.contains('active');
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
      if (navActions) navActions.classList.toggle('active');
      
      const icon = navToggle.querySelector('svg');
      if (icon) {
        icon.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        icon.style.transition = 'transform 0.3s ease';
      }
    });
  }

  if (navbar) {
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;
      if (currentScroll > 50) {
        navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
        navbar.style.backdropFilter = 'blur(12px)';
      } else {
        navbar.style.boxShadow = 'none';
        navbar.style.backdropFilter = 'blur(0px)';
      }
      if (currentScroll > lastScroll && currentScroll > 200 && !navMenu?.classList.contains('active')) {
        navbar.style.transform = 'translateY(-100%)';
      } else {
        navbar.style.transform = 'translateY(0)';
      }
      lastScroll = currentScroll;
    });
    navbar.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease';
  }

  // Highlight current page
  const currentPage = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && currentPage.includes(href.replace('./', '').replace('../', ''))) {
      link.classList.add('active');
    }
  });

  // Close mobile menu on link click
  navMenu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 768 && navMenu.classList.contains('active')) {
        navToggle?.click();
      }
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (navMenu?.classList.contains('active') && 
        !navMenu.contains(e.target) && 
        !navToggle?.contains(e.target)) {
      navToggle?.click();
    }
  });
}

// ─── Theme System ───
function initThemeToggle() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  AppState.theme = savedTheme;
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  AppState.theme = newTheme;
  
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    const icon = toggle.querySelector('svg, i');
    if (icon) {
      icon.setAttribute('data-lucide', newTheme === 'dark' ? 'sun' : 'moon');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
  
  showToast(`Switched to ${newTheme} mode`, 'info', 2000);
}

// ─── Auth State Management ───
function getToken() { return localStorage.getItem('accessToken'); }
function getRefreshToken() { return localStorage.getItem('refreshToken'); }

function setTokens(accessToken, refreshToken) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  AppState.isAuthenticated = true;
}

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  AppState.user = null;
  AppState.isAuthenticated = false;
}

function getUser() {
  if (!AppState.user) {
    const userStr = localStorage.getItem('user');
    AppState.user = userStr ? JSON.parse(userStr) : null;
  }
  return AppState.user;
}

function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
  AppState.user = user;
  AppState.isAuthenticated = true;
}

function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch { return false; }
}

function isAdmin() {
  const user = getUser();
  return user && (user.role === 'admin' || user.role === 'superadmin');
}

function updateAuthUI() {
  const user = getUser();
  const navActions = document.getElementById('navActions');
  if (!navActions) return;

  if (isLoggedIn() && user) {
    navActions.innerHTML = `
      <a href="${getBasePath()}voter/elections.html" class="btn btn-ghost btn-sm">Elections</a>
      <span style="color:var(--text-muted);font-size:0.85rem;">Hi, ${user.firstName || 'User'}</span>
      <button onclick="logout()" class="btn btn-ghost btn-sm">Logout</button>
    `;
  } else {
    navActions.innerHTML = `
      <a href="${getBasePath()}auth/login.html" class="btn btn-ghost btn-sm">Sign In</a>
      <a href="${getBasePath()}auth/register.html" class="btn btn-primary btn-sm">Get Started</a>
    `;
  }
}

// ─── API Helper ───
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultOptions = {
    headers: { 'Content-Type': 'application/json' },
  };
  const token = getToken();
  if (token) defaultOptions.headers.Authorization = `Bearer ${token}`;

  const config = {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...options.headers },
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
        const refreshed = await refreshAccessToken();
        if (refreshed) return apiRequest(endpoint, options);
      }
      if (response.status === 429) showToast('Too many requests. Please wait.', 'warning');
      throw new Error(data.message || `Request failed (${response.status})`);
    }
    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      showToast('Network error. Please check your connection.', 'error');
    }
    throw error;
  }
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) { clearTokens(); return false; }
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json();
    if (response.ok) { setTokens(data.data.accessToken, data.data.refreshToken); return true; }
  } catch (error) { console.error('Token refresh failed:', error); }
  clearTokens();
  return false;
}

async function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  try { await apiRequest('/auth/logout', { method: 'POST' }); } catch (e) {}
  clearTokens();
  updateAuthUI();
  showToast('Logged out successfully', 'success');
  window.location.href = getBasePath() + 'index.html';
}

// ─── Toast System ───
function initToastSystem() {
  if (document.querySelector('.toast-container')) return;
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  document.body.appendChild(container);
}

function showToast(message, type = 'info', duration = 5000) {
  const container = document.getElementById('toastContainer');
  if (!container) { initToastSystem(); return showToast(message, type, duration); }
  while (container.children.length >= 5) container.firstChild.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  toast.innerHTML = `<span style="color:${colors[type]};font-weight:700;">${iconMap[type]}</span> <span>${message}</span>`;
  toast.style.cssText = `padding:1rem 1.5rem;background:#1e293b;border-left:3px solid ${colors[type]};border-radius:0.5rem;color:white;font-size:0.875rem;box-shadow:0 10px 30px rgba(0,0,0,0.4);animation:toastIn 0.3s ease;`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
  }, duration);
}

// ─── Scroll to Top ───
function initScrollToTop() {
  if (document.querySelector('.scroll-to-top')) return;
  const btn = document.createElement('button');
  btn.className = 'scroll-to-top';
  btn.innerHTML = '↑';
  btn.style.cssText = 'position:fixed;bottom:2rem;right:2rem;z-index:998;width:3rem;height:3rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:50%;color:white;cursor:pointer;font-size:1.25rem;box-shadow:0 10px 30px rgba(99,102,241,0.4);opacity:0;visibility:hidden;transform:translateY(20px);transition:all 0.3s ease;';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);
  
  window.addEventListener('scroll', () => {
    const visible = window.scrollY > 500;
    btn.style.opacity = visible ? '1' : '0';
    btn.style.visibility = visible ? 'visible' : 'hidden';
    btn.style.transform = visible ? 'translateY(0)' : 'translateY(20px)';
  });
}

// ─── Keyboard Shortcuts ───
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('chatWindow')?.classList.remove('active');
      document.getElementById('searchOverlay')?.classList.remove('active');
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') { e.preventDefault(); toggleTheme(); }
  });
}

// ─── Performance Monitor ───
function initPerformanceMonitor() {
  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver((list) => {
        const last = list.getEntries()[list.getEntries().length - 1];
        AppState.performance.lcp = last.renderTime || last.loadTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}
  }
}

// ─── Lazy Load Images ───
function initLazyLoadImages() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
        observer.unobserve(img);
      }
    });
  });
  document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
}

// ─── Smooth Scroll Polyfill ───
function initSmoothScrollPolyfill() {
  if ('scrollBehavior' in document.documentElement.style) return;
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'auto' }); }
    });
  });
}

// ─── Focus Visible ───
function initFocusVisible() {
  document.addEventListener('mousedown', () => document.body.classList.add('using-mouse'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') document.body.classList.remove('using-mouse'); });
}

// ─── Reduced Motion Detection ───
function detectReducedMotion() {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = (matches) => {
    document.documentElement.classList.toggle('reduced-motion', matches);
    ['--transition-fast','--transition-base','--transition-slow'].forEach(v => {
      document.documentElement.style.setProperty(v, matches ? '0s' : '');
    });
  };
  apply(mq.matches);
  mq.addEventListener('change', (e) => apply(e.matches));
}

// ─── Form Validation ───
function validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function validatePassword(password) {
  return {
    minLength: password.length >= 6,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    isValid: password.length >= 6
  };
}

function showFieldError(fieldId, message) {
  const el = document.getElementById(`${fieldId}Error`);
  if (el) el.textContent = message;
  document.getElementById(fieldId)?.classList.add('error');
}

function clearFieldError(fieldId) {
  const el = document.getElementById(`${fieldId}Error`);
  if (el) el.textContent = '';
  document.getElementById(fieldId)?.classList.remove('error');
}

function clearAllErrors() {
  document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
  document.querySelectorAll('input.error, select.error').forEach(el => el.classList.remove('error'));
}

// ─── URL/Path Helpers ───
function getBasePath() {
  const path = window.location.pathname;
  if (path.includes('/frontend/auth/') || path.includes('/frontend/voter/') || 
      path.includes('/frontend/admin/') || path.includes('/frontend/profile/')) {
    return '../';
  }
  if (path.includes('/frontend/')) return './';
  return './frontend/';
}

// ─── Date Helpers ───
function formatDate(date, format = 'short') {
  const d = new Date(date);
  const options = {
    short: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  };
  return d.toLocaleDateString('en-US', options[format] || options.short);
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 0) return 'Just now';
  const intervals = [
    [31536000, 'year'], [2592000, 'month'], [86400, 'day'],
    [3600, 'hour'], [60, 'minute']
  ];
  for (const [sec, unit] of intervals) {
    const interval = seconds / sec;
    if (interval > 1) return Math.floor(interval) + ' ' + unit + (Math.floor(interval) > 1 ? 's' : '') + ' ago';
  }
  return 'Just now';
}

// ─── Number Formatting ───
function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Clipboard ───
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied!', 'success', 2000);
  } catch {
    showToast('Failed to copy', 'error');
  }
}

// ─── Debounce ───
function debounce(func, wait) {
  let timeout;
  return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}

// ─── Export ───
window.VoteWave = {
  showToast, toggleTheme, AppState, updateAuthUI, apiRequest,
  getToken, getRefreshToken, setTokens, clearTokens,
  isLoggedIn, isAdmin, getUser, setUser, refreshAccessToken, logout,
  getBasePath, formatDate, timeAgo, formatNumber, truncateText,
  copyToClipboard, debounce, validateEmail, validatePassword, escapeHtml
};

window.escapeHtml = escapeHtml;
window.formatDate = formatDate;
window.formatNumber = formatNumber;
window.truncateText = truncateText;
window.showToast = showToast;

// ─── Toast Animation Style ───
if (!document.getElementById('toast-style')) {
  const style = document.createElement('style');
  style.id = 'toast-style';
  style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}';
  document.head.appendChild(style);
}