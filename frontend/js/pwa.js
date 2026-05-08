/**
 * VoteWave PWA - Install & Registration
 * Handles PWA installation prompt and updates
 */

let deferredPrompt = null;
let installButton = null;

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/frontend/service-worker.js', { scope: '/' })
      .then((registration) => {
        console.log('📱 PWA Service Worker registered:', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 New update available!');
              showUpdateNotification();
            }
          });
        });
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
}

// Capture install prompt
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  
  // Show custom install button
  showInstallButton();
  
  console.log('📲 PWA Install prompt available');
});

// App installed successfully
window.addEventListener('appinstalled', () => {
  console.log('✅ VoteWave PWA installed successfully!');
  deferredPrompt = null;
  hideInstallButton();
  
  // Track installation
  if (typeof gtag !== 'undefined') {
    gtag('event', 'pwa_install', { event_category: 'PWA' });
  }
});

// Show custom install button
function showInstallButton() {
  if (document.getElementById('pwa-install-btn')) return;
  
  const btn = document.createElement('button');
  btn.id = 'pwa-install-btn';
  btn.innerHTML = '📲 Install App';
  btn.style.cssText = `
    position: fixed;
    bottom: 6rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border: none;
    border-radius: 100px;
    font-size: 0.9rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(99,102,241,0.5);
    animation: slideUp 0.5s ease;
    transition: all 0.3s ease;
  `;
  
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User ${outcome} the installation`);
    deferredPrompt = null;
    btn.remove();
  });
  
  document.body.appendChild(btn);
  
  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (btn.parentNode) {
      btn.style.opacity = '0';
      btn.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => { if (btn.parentNode) btn.remove(); }, 300);
    }
  }, 10000);
}

function hideInstallButton() {
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.remove();
}

// Show update notification
function showUpdateNotification() {
  if (document.getElementById('pwa-update-banner')) return;
  
  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    padding: 0.75rem 1.5rem;
    background: #1e293b;
    border-bottom: 2px solid #6366f1;
    color: white;
    text-align: center;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    animation: slideDown 0.5s ease;
  `;
  
  banner.innerHTML = `
    <span>🔄 A new version of VoteWave is available!</span>
    <button id="pwa-update-btn" style="
      padding: 0.35rem 1rem;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 600;
    ">Update Now</button>
  `;
  
  document.body.appendChild(banner);
  
  document.getElementById('pwa-update-btn').addEventListener('click', () => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        window.location.reload();
      });
    }
  });
}

// Network status indicators
window.addEventListener('online', () => {
  console.log('🌐 Online');
  document.body.classList.remove('offline');
  showToast('You are back online!', 'success', 2000);
});

window.addEventListener('offline', () => {
  console.log('📡 Offline - Using cached version');
  document.body.classList.add('offline');
  showToast('You are offline. Using cached version.', 'warning', 3000);
});

// Add slideUp animation
if (!document.getElementById('pwa-animations')) {
  const style = document.createElement('style');
  style.id = 'pwa-animations';
  style.textContent = `
    @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(30px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(style);
}

console.log('📱 VoteWave PWA Module Ready');