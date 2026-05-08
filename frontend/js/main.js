/**
 * VoteWave - Main JavaScript (Enhanced)
 * Core functionality shared across all pages
 * Fully corrected for frontend/ folder structure
 */

// ─── API Configuration ───
const LOCALHOST_NAMES = ['localhost', '127.0.0.1', '::1'];
const isLocalhost = LOCALHOST_NAMES.includes(window.location.hostname);
const isFileProtocol = window.location.protocol === 'file:';
const isCustomDevPort = isLocalhost && window.location.port && window.location.port !== '5000';
const API_BASE_URL = isFileProtocol || isCustomDevPort
  ? 'http://localhost:5000/api'
  : (window.location.origin && window.location.origin !== 'null')
    ? `${window.location.origin}/api`
    : 'http://localhost:5000/api';
const FRONTEND_URL = window.location.origin;

// Make API_BASE_URL globally available
window.API_BASE_URL = API_BASE_URL;

// ─── Global State ───
const AppState = {
  theme: localStorage.getItem('theme') || 'light',
  user: null,
  isAuthenticated: false,
  notifications: [],
  performance: {
    lcp: null,
    fcp: null,
  }
};

// ─── Initialize on DOM Ready ───
document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
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

// ─── Navigation (Enhanced) ───
function initNavigation() {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  const navActions = document.getElementById('navActions');
  const navbar = document.querySelector('.navbar');

  // Mobile menu toggle with animation
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const isOpen = !navMenu?.classList.contains('active');
      navToggle.classList.toggle('active');
      navMenu?.classList.toggle('active');
      navActions?.classList.toggle('active');
      
      // Animate hamburger icon
      const icon = navToggle.querySelector('svg');
      if (icon) {
        icon.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        icon.style.transition = 'transform 0.3s ease';
      }
      
      // Apply slide animation to mobile menu
      if (navMenu && isOpen) {
        navMenu.style.animation = 'slideDown 0.3s ease forwards';
      }
    });
  }

  // Navbar scroll behavior
  if (navbar) {
    let lastScroll = 0;
    let scrollTimeout;
    
    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;
      
      // Add shadow and blur on scroll
      if (currentScroll > 50) {
        navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
        navbar.style.backdropFilter = 'blur(12px)';
      } else {
        navbar.style.boxShadow = 'none';
        navbar.style.backdropFilter = 'blur(0px)';
      }
      
      // Hide/show on scroll
      if (currentScroll > lastScroll && currentScroll > 200 && !navMenu?.classList.contains('active')) {
        navbar.style.transform = 'translateY(-100%)';
      } else {
        navbar.style.transform = 'translateY(0)';
      }
      
      lastScroll = currentScroll;
      
      // Debounced scroll end detection
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        document.body.classList.remove('is-scrolling');
      }, 150);
      document.body.classList.add('is-scrolling');
    });
    
    navbar.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease';
  }

  // Highlight current page
  const currentPage = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === currentPage || currentPage.endsWith(href.split('/').pop()))) {
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
  
  // Close mobile menu on outside click
  document.addEventListener('click', (e) => {
    if (navMenu?.classList.contains('active') && 
        !navMenu.contains(e.target) && 
        !navToggle?.contains(e.target)) {
      navToggle?.click();
    }
  });
}

// ─── Theme System (Enhanced) ───
function initThemeToggle() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  AppState.theme = savedTheme;
  
  // Don't create theme toggle if one already exists in nav
  if (document.getElementById('themeToggleNav')) return;
  
  // Create theme toggle button if it doesn't exist
  if (!document.querySelector('.theme-toggle')) {
    createThemeToggleButton();
  }
  
  updateThemeColorMeta();
}

function createThemeToggleButton() {
  const toggle = document.createElement('button');
  toggle.className = 'theme-toggle';
  toggle.setAttribute('aria-label', 'Toggle theme');
  toggle.setAttribute('title', `${AppState.theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'} mode`);
  toggle.innerHTML = AppState.theme === 'dark' 
    ? '<i data-lucide="sun"></i>' 
    : '<i data-lucide="moon"></i>';
  
  toggle.style.cssText = `
    position: fixed;
    bottom: 6rem;
    right: 2rem;
    z-index: 999;
    width: 3rem;
    height: 3rem;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-light, #e5e7eb);
    border-radius: 50%;
    color: var(--text-primary, #111827);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
  `;
  
  toggle.addEventListener('mouseenter', () => {
    toggle.style.transform = 'scale(1.15)';
  });
  
  toggle.addEventListener('mouseleave', () => {
    toggle.style.transform = 'scale(1)';
  });
  
  toggle.addEventListener('click', toggleTheme);
  document.body.appendChild(toggle);
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  AppState.theme = newTheme;
  
  // Update toggle icon
  const toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.innerHTML = newTheme === 'dark' 
      ? '<i data-lucide="sun"></i>' 
      : '<i data-lucide="moon"></i>';
    toggle.setAttribute('title', `${newTheme === 'dark' ? 'Switch to Light' : 'Switch to Dark'} mode`);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  
  // Update nav theme toggle if exists
  const navThemeToggle = document.getElementById('themeToggleNav');
  if (navThemeToggle) {
    navThemeToggle.innerHTML = newTheme === 'dark' 
      ? '<i data-lucide="sun"></i>' 
      : '<i data-lucide="moon"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  
  updateThemeColorMeta();
  
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning');
  }, 300);
  
  showToast(`Switched to ${newTheme} mode`, 'info', 2000);
}

function updateThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = AppState.theme === 'dark' ? '#111827' : '#ffffff';
  }
}

// ─── Auth State Management ───
function getToken() {
  return localStorage.getItem('accessToken');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

function setTokens(accessToken, refreshToken) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
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
  return !!getToken();
}

function isAdmin() {
  const user = getUser();
  return user && (user.role === 'admin' || user.role === 'superadmin');
}

function updateAuthUI() {
  const token = getToken();
  const user = getUser();
  const navActions = document.getElementById('navActions');

  if (!token || !user) {
    clearTokens();
  }

  if (navActions) {
    if (isLoggedIn() && user) {
      navActions.innerHTML = `
        <div class="user-menu-trigger" id="userMenuTrigger">
          <div class="user-avatar-small">
            ${user.avatar 
              ? `<img src="${user.avatar}" alt="${user.firstName}">` 
              : `<span>${user.firstName?.[0] || 'U'}${user.lastName?.[0] || ''}</span>`
            }
          </div>
          <span class="user-name">${user.firstName || 'User'}</span>
          <i data-lucide="chevron-down" class="user-menu-arrow"></i>
        </div>
        <div class="user-dropdown" id="userDropdown">
          <a href="${getBasePath()}voter/elections.html">
            <i data-lucide="vote"></i> Browse Elections
          </a>
          <a href="${getBasePath()}voter/history.html">
            <i data-lucide="history"></i> Voting History
          </a>
          <div class="dropdown-divider"></div>
          <button onclick="logout()">
            <i data-lucide="log-out"></i> Logout
          </button>
        </div>
      `;
      initUserDropdown();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      navActions.innerHTML = `
        <a href="${getBasePath()}auth/login.html" class="btn btn-ghost">Sign In</a>
        <a href="${getBasePath()}auth/register.html" class="btn btn-primary">Get Started</a>
      `;
    }
  }
}

function initUserDropdown() {
  const trigger = document.getElementById('userMenuTrigger');
  const dropdown = document.getElementById('userDropdown');
  
  if (trigger && dropdown) {
    // Remove old listeners by cloning
    const newTrigger = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(newTrigger, trigger);
    
    newTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
      newTrigger.classList.toggle('active');
    });
    
    document.addEventListener('click', (e) => {
      if (!newTrigger.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
        newTrigger.classList.remove('active');
      }
    });
  }
}

// ─── API Helper (Enhanced) ───
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const token = getToken();
  if (token) {
    defaultOptions.headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
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
        if (refreshed) {
          return apiRequest(endpoint, options);
        }
      }
      
      if (response.status === 429) {
        showToast('Too many requests. Please wait a moment.', 'warning');
      }
      
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      showToast('Network error. Please check your connection.', 'error');
    } else {
      console.error('API Error:', error);
    }
    throw error;
  }
}

// ─── Token Refresh ───
async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    window.location.href = getBasePath() + 'auth/login.html';
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await response.json();

    if (response.ok) {
      setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    } else {
      clearTokens();
      showToast('Session expired. Please login again.', 'warning');
      setTimeout(() => {
        window.location.href = getBasePath() + 'auth/login.html';
      }, 1000);
      return false;
    }
  } catch (error) {
    clearTokens();
    window.location.href = getBasePath() + 'auth/login.html';
    return false;
  }
}

// ─── Logout (Enhanced) ───
async function logout() {
  const confirmLogout = confirm('Are you sure you want to logout?');
  if (!confirmLogout) return;
  
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
    showToast('Logged out successfully', 'success');
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    clearTokens();
    setTimeout(() => {
      window.location.href = getBasePath() + 'index.html';
    }, 500);
  }
}

// ─── Toast System (Enhanced) ───
function initToastSystem() {
  if (document.querySelector('.toast-container')) return;
  
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');
  document.body.appendChild(container);
}

function showToast(message, type = 'info', duration = 5000) {
  const container = document.getElementById('toastContainer');
  if (!container) {
    initToastSystem();
    // Recurse after creating container
    setTimeout(() => showToast(message, type, duration), 10);
    return;
  }

  // Limit toasts to 5
  while (container.children.length >= 5) {
    container.firstChild.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  
  const iconMap = {
    success: 'check-circle',
    error: 'x-circle',
    warning: 'alert-triangle',
    info: 'info',
  };

  toast.innerHTML = `
    <i data-lucide="${iconMap[type] || 'info'}" class="toast-icon"></i>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close notification">
      <i data-lucide="x"></i>
    </button>
  `;

  container.appendChild(toast);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Close button handler
  const closeBtn = toast.querySelector('.toast-close');
  const removeToast = () => {
    if (toast.parentNode) {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 300);
    }
  };
  
  closeBtn?.addEventListener('click', removeToast);

  // Auto remove
  let timeoutId;
  if (duration > 0) {
    timeoutId = setTimeout(removeToast, duration);
  }

  // Pause on hover
  toast.addEventListener('mouseenter', () => clearTimeout(timeoutId));
  toast.addEventListener('mouseleave', () => {
    if (duration > 0) {
      timeoutId = setTimeout(removeToast, duration);
    }
  });
}

// ─── Scroll to Top ───
function initScrollToTop() {
  if (document.querySelector('.scroll-to-top')) return;
  
  const btn = document.createElement('button');
  btn.className = 'scroll-to-top';
  btn.setAttribute('aria-label', 'Scroll to top');
  btn.innerHTML = '<i data-lucide="chevron-up"></i>';
  btn.style.cssText = `
    position: fixed;
    bottom: 2rem;
    left: 2rem;
    z-index: 998;
    width: 3rem;
    height: 3rem;
    background: linear-gradient(135deg, var(--primary-600, #4f46e5), var(--secondary-600, #7c3aed));
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3);
    opacity: 0;
    visibility: hidden;
    transform: translateY(20px);
    transition: all 0.3s ease;
  `;
  
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  document.body.appendChild(btn);
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
      btn.style.opacity = '1';
      btn.style.visibility = 'visible';
      btn.style.transform = 'translateY(0)';
    } else {
      btn.style.opacity = '0';
      btn.style.visibility = 'hidden';
      btn.style.transform = 'translateY(20px)';
    }
  });
}

// ─── Keyboard Shortcuts ───
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape to close active dialogs/modals
    if (e.key === 'Escape') {
      const chatWindow = document.getElementById('chatWindow');
      if (chatWindow?.classList.contains('active')) {
        chatWindow.classList.remove('active');
      }
      const searchOverlay = document.getElementById('searchOverlay');
      if (searchOverlay?.classList.contains('active')) {
        searchOverlay.classList.remove('active');
      }
    }
    
    // Ctrl/Cmd + Shift + T: Toggle theme
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      toggleTheme();
    }
    
    // Ctrl/Cmd + /: Toggle chat
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      document.getElementById('chatToggle')?.click();
    }
  });
}

// ─── Performance Monitor ───
function initPerformanceMonitor() {
  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        AppState.performance.lcp = lastEntry.renderTime || lastEntry.loadTime;
        console.debug(`🚀 LCP: ${AppState.performance.lcp}ms`);
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          AppState.performance.fcp = entries[0].startTime;
          console.debug(`🎨 FCP: ${AppState.performance.fcp}ms`);
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
    } catch (e) {
      // Silently fail
    }
  }
}

// ─── Lazy Load Images ───
function initLazyLoadImages() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            img.addEventListener('load', () => {
              img.style.animation = 'fadeIn 0.5s ease';
            });
          }
          imageObserver.unobserve(img);
        }
      });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }
}

// ─── Smooth Scroll Polyfill ───
function initSmoothScrollPolyfill() {
  if (!('scrollBehavior' in document.documentElement.style)) {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          const targetPosition = target.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({ top: targetPosition, behavior: 'auto' });
        }
      });
    });
  }
}

// ─── Focus Visible ───
function initFocusVisible() {
  document.addEventListener('mousedown', () => {
    document.body.classList.add('using-mouse');
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      document.body.classList.remove('using-mouse');
    }
  });
}

// ─── Reduced Motion Detection ───
function detectReducedMotion() {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const applyReducedMotion = (matches) => {
    if (matches) {
      document.documentElement.classList.add('reduced-motion');
      document.documentElement.style.setProperty('--transition-fast', '0s');
      document.documentElement.style.setProperty('--transition-base', '0s');
      document.documentElement.style.setProperty('--transition-slow', '0s');
    } else {
      document.documentElement.classList.remove('reduced-motion');
      document.documentElement.style.removeProperty('--transition-fast');
      document.documentElement.style.removeProperty('--transition-base');
      document.documentElement.style.removeProperty('--transition-slow');
    }
  };
  
  applyReducedMotion(mediaQuery.matches);
  mediaQuery.addEventListener('change', (e) => applyReducedMotion(e.matches));
}

// ─── Form Validation Helpers ───
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  return {
    minLength: password.length >= 6,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    isValid: password.length >= 6 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password),
  };
}

function showFieldError(fieldId, message) {
  const errorElement = document.getElementById(`${fieldId}Error`);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.animation = 'fadeInUp 0.3s ease';
  }
  
  const input = document.getElementById(fieldId);
  if (input) {
    input.classList.add('error');
    input.setAttribute('aria-invalid', 'true');
  }
}

function clearFieldError(fieldId) {
  const errorElement = document.getElementById(`${fieldId}Error`);
  if (errorElement) {
    errorElement.textContent = '';
  }
  
  const input = document.getElementById(fieldId);
  if (input) {
    input.classList.remove('error');
    input.removeAttribute('aria-invalid');
  }
}

function clearAllErrors() {
  document.querySelectorAll('.error-message').forEach(el => {
    el.textContent = '';
  });
  document.querySelectorAll('input.error, select.error, textarea.error').forEach(el => {
    el.classList.remove('error');
    el.removeAttribute('aria-invalid');
  });
}

// ─── URL/Path Helpers (UPDATED for frontend/ structure) ───
/**
 * Gets the correct base path for navigation links
 * Handles the new frontend/ folder structure:
 *   Root: index.html
 *   Auth: frontend/auth/*.html
 *   Voter: frontend/voter/*.html
 *   Admin: frontend/admin/*.html
 *   Profile: frontend/profile/*.html
 * 
 * @returns {string} The correct relative path prefix
 */
function getBasePath() {
  const path = window.location.pathname;
  const normalizedPath = path.replace(/\/\/+/, '/');
  const segments = normalizedPath.split('/').filter(Boolean);

  if (segments.length === 0) return './';

  const adminPaths = ['auth', 'admin', 'voter', 'profile'];
  if (adminPaths.includes(segments[0]) || normalizedPath.includes('/frontend/')) {
    return '../';
  }

  return './';
}

// ─── Date Formatting Helpers ───
function formatDate(date, format = 'short') {
  const d = new Date(date);
  const options = {
    short: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
    time: { hour: '2-digit', minute: '2-digit' },
    full: { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    },
    iso: { year: 'numeric', month: '2-digit', day: '2-digit' }
  };
  return d.toLocaleDateString('en-US', options[format] || options.short);
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  if (seconds < 0) return 'Just now';
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  
  return 'Just now';
}

function getRelativeTime(date) {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const now = new Date();
  const diff = new Date(date) - now;
  
  const seconds = Math.round(diff / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  
  if (Math.abs(days) > 30) return formatDate(date, 'short');
  if (Math.abs(days) >= 1) return rtf.format(days, 'day');
  if (Math.abs(hours) >= 1) return rtf.format(hours, 'hour');
  if (Math.abs(minutes) >= 1) return rtf.format(minutes, 'minute');
  return rtf.format(seconds, 'second');
}

// ─── Number Formatting ───
function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCompactNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// ─── Text Helpers ───
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trimEnd() + '...';
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// ─── Clipboard ───
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast('Copied to clipboard!', 'success', 2000);
    return true;
  } catch (err) {
    showToast('Failed to copy', 'error');
    return false;
  }
}

// ─── Debounce & Throttle ───
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ─── Token Management ───
function setTokens(accessToken, refreshToken) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  AppState.isAuthenticated = true;
}

function getToken() {
  return localStorage.getItem('accessToken');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  AppState.isAuthenticated = false;
  AppState.user = null;
}

function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function isAdmin() {
  const user = getUser();
  return user && (user.role === 'admin' || user.role === 'superadmin');
}

function getUser() {
  if (AppState.user) return AppState.user;
  
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      AppState.user = JSON.parse(userStr);
      return AppState.user;
    } catch {
      return null;
    }
  }
  return null;
}

function setUser(user) {
  AppState.user = user;
  localStorage.setItem('user', JSON.stringify(user));
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }

  clearTokens();
  return false;
}

async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout error:', error);
  }
  
  clearTokens();
  updateAuthUI();
  showToast('Logged out successfully', 'success');
  
  // Redirect to home
  window.location.href = getBasePath() + 'index.html';
}

// ─── Button Loading States ───
function setButtonLoading(button, loading, text = null) {
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = `
      <div class="loading-spinner" style="width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite; display: inline-block; margin-right: 8px;"></div>
      ${text || 'Loading...'}
    `;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

function startResendTimer() {
  const resendBtn = document.getElementById('resendBtn');
  if (!resendBtn) return;

  let timeLeft = 60;
  resendBtn.disabled = true;
  
  const timer = setInterval(() => {
    resendBtn.textContent = `Resend in ${timeLeft}s`;
    timeLeft--;
    
    if (timeLeft < 0) {
      clearInterval(timer);
      resendBtn.textContent = 'Resend OTP';
      resendBtn.disabled = false;
    }
  }, 1000);
}

function getRedirectUrl(role) {
  switch (role) {
    case 'admin':
    case 'superadmin':
      return getBasePath() + 'admin/dashboard.html';
    case 'voter':
    default:
      return getBasePath() + 'voter/elections.html';
  }
}

// ─── Utility Functions ───
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Export for use in other scripts ───
window.VoteWave = {
  showToast,
  toggleTheme,
  AppState,
  updateAuthUI,
  apiRequest,
  getToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  isLoggedIn,
  isAdmin,
  getUser,
  setUser,
  refreshAccessToken,
  logout,
  setButtonLoading,
  startResendTimer,
  getRedirectUrl,
  getBasePath,
  formatDate,
  timeAgo,
  formatNumber,
  truncateText,
  copyToClipboard,
  debounce,
  throttle,
  validateEmail,
  validatePassword,
  escapeHtml,
};

// ─── Make key functions available globally for inline scripts ───
window.escapeHtml = escapeHtml;
window.formatDate = formatDate;
window.formatNumber = formatNumber;
window.truncateText = truncateText;

// ─── Global Error Handlers ───
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  if (event.error && event.error.message && !event.error.message.includes('lucide')) {
    showToast('An unexpected error occurred. Please refresh the page.', 'error', 3000);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  if (event.reason && event.reason.message && !event.reason.message.includes('lucide')) {
    showToast('An unexpected error occurred. Please try again.', 'error', 3000);
  }
});