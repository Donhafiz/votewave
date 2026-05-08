/**
 * VoteWave - Event Micro-Site JavaScript
 * Handles dedicated event voting pages accessed via unique slug
 * Reads ONLY real candidates from admin's data
 */

// ========================================
// CONFIGURATION
// ========================================
const VOTE_PRICE = 5; // GHS per vote
let selectedCandidateId = null;
let selectedCandidateName = null;

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  initEventPage();
  setupQuantityControls();
});

// ========================================
// LOAD EVENT DATA FROM LOCAL STORAGE
// ========================================
async function initEventPage() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('event');

  if (!slug) {
    showErrorState('No event specified. Please use a valid event link.');
    return;
  }

  // Get elections from localStorage (set by admin)
  const elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
  const event = elections.find(e => e.slug === slug);

  if (!event) {
    showErrorState('Event not found. The link may be invalid or the event has been removed.');
    document.getElementById('eventTitle').textContent = 'Event Not Found';
    return;
  }

  // Populate the header
  populateEventHeader(event);

  // Get ONLY real candidates for this event (from admin's candidate management)
  const allCandidates = JSON.parse(localStorage.getItem('votewave_candidates') || '[]');
  const eventCandidates = allCandidates.filter(c => c.electionId === event._id);

  // Render categories with only the admin's real candidates
  renderCategories(event.positions || [], eventCandidates);

  // Show the vote purchase panel
  const votePanel = document.getElementById('votePurchase');
  if (votePanel) votePanel.style.display = 'block';
}

// ========================================
// POPULATE EVENT HEADER
// ========================================
function populateEventHeader(event) {
  document.getElementById('eventTitle').textContent = event.title || 'Untitled Event';
  document.getElementById('eventDesc').textContent = event.description || 'Cast your vote for the nominees below.';
  document.getElementById('eventTypeBadge').textContent = getTypeIcon(event.type) + ' ' + capitalize(event.type || 'Election');
  document.getElementById('eventStatusBadge').textContent = capitalize(event.status || 'active');
  document.getElementById('eventDates').textContent = formatDate(event.startDate) + ' — ' + formatDate(event.endDate);
  document.getElementById('eventVotes').textContent = (event.totalVotes || 0).toLocaleString() + ' votes cast';
}

// ========================================
// RENDER CATEGORIES & REAL CANDIDATES
// ========================================
function renderCategories(positions, candidates) {
  const container = document.getElementById('categoriesContainer');

  if (!positions || positions.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:3rem 2rem;color:var(--text-muted);">
        <i data-lucide="folder-open" style="width:3rem;height:3rem;margin-bottom:1rem;opacity:0.3;"></i>
        <h3 style="margin-bottom:0.5rem;">No Categories Set</h3>
        <p>This event doesn't have any positions or categories configured yet.</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  container.innerHTML = positions.map((pos, idx) => {
    const positionCandidates = candidates.filter(c => c.position === pos);

    return `
      <div class="category-section">
        <div class="category-header">
          <div class="category-icon">${idx + 1}</div>
          <h3>${escapeHtml(pos)}</h3>
          <span class="count">${positionCandidates.length} nominee${positionCandidates.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="candidates">
          ${positionCandidates.length > 0 
            ? positionCandidates.map(c => `
              <div class="candidate-card" onclick="selectCandidate('${c._id}', '${escapeAttr(c.firstName + ' ' + c.lastName)}', this)">
                <div class="avatar" style="background:linear-gradient(135deg,${getColorForName(c.firstName)},${getColorForName(c.lastName)});">
                  ${c.firstName[0]}${c.lastName[0]}
                </div>
                <div class="info">
                  <strong>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</strong>
                  ${c.bio ? `<p class="bio-text">${escapeHtml(c.bio)}</p>` : ''}
                  ${c.manifesto ? `<div class="manifesto-block">💬 "${escapeHtml(c.manifesto)}"</div>` : ''}
                </div>
                <div class="radio"><div class="inner"></div></div>
              </div>
            `).join('') 
            : `<div class="empty-candidates"><p>No nominees registered for this position yet.</p></div>`
          }
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ========================================
// SELECT CANDIDATE
// ========================================
function selectCandidate(candidateId, candidateName, element) {
  // Deselect all candidates
  document.querySelectorAll('.candidate-card').forEach(c => c.classList.remove('selected'));

  // Select this one
  element.classList.add('selected');
  selectedCandidateId = candidateId;
  selectedCandidateName = candidateName;

  // Enable the pay button
  const payBtn = document.getElementById('payAndVote');
  if (payBtn) {
    payBtn.disabled = false;
    payBtn.innerHTML = '<i data-lucide="credit-card"></i> Pay & Vote for ' + escapeHtml(candidateName);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// ========================================
// QUANTITY CONTROLS
// ========================================
function setupQuantityControls() {
  const qtyInput = document.getElementById('voteQty');
  const qtyPlus = document.getElementById('qtyPlus');
  const qtyMinus = document.getElementById('qtyMinus');

  if (qtyPlus) {
    qtyPlus.addEventListener('click', () => {
      let val = parseInt(qtyInput.value) || 1;
      if (val < 100) qtyInput.value = val + 1;
      updateTotal();
    });
  }

  if (qtyMinus) {
    qtyMinus.addEventListener('click', () => {
      let val = parseInt(qtyInput.value) || 1;
      if (val > 1) qtyInput.value = val - 1;
      updateTotal();
    });
  }

  if (qtyInput) {
    qtyInput.addEventListener('change', updateTotal);
  }
}

function updateTotal() {
  const qty = parseInt(document.getElementById('voteQty').value) || 1;
  const totalEl = document.getElementById('totalPrice');
  const countEl = document.getElementById('voteCountDisplay');

  if (totalEl) totalEl.textContent = 'GHS ' + (qty * VOTE_PRICE).toFixed(2);
  if (countEl) countEl.textContent = qty;
}

// ========================================
// PAYMENT INITIATION
// ========================================
function initiatePayment() {
  if (!selectedCandidateId) {
    showToast('Please select a candidate first', 'error');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('event');
  const votes = parseInt(document.getElementById('voteQty').value) || 1;
  const amount = votes * VOTE_PRICE;

  // Get Paystack public key from payment.js or use demo key
  const publicKey = (typeof PAYSTACK_CONFIG !== 'undefined' && PAYSTACK_CONFIG.publicKey) 
    ? PAYSTACK_CONFIG.publicKey 
    : 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

  const handler = PaystackPop.setup({
    key: publicKey,
    email: 'voter@votewave.com',
    amount: amount * 100, // Convert to pesewas
    currency: 'GHS',
    ref: 'VW-MICRO-' + Date.now(),
    label: 'VoteWave Event Voting',
    metadata: {
      eventSlug: slug,
      candidateId: selectedCandidateId,
      candidateName: selectedCandidateName,
      votesCount: votes,
      platform: 'event-micro-site'
    },
    callback: function(response) {
      if (response.status === 'success') {
        // Record the vote
        recordVote(slug, selectedCandidateId, selectedCandidateName, votes);

        // Show success overlay
        const successEl = document.getElementById('successOverlay');
        const voteCountEl = document.getElementById('successVoteCount');
        const candidateEl = document.getElementById('successCandidate');

        if (voteCountEl) voteCountEl.textContent = votes;
        if (candidateEl) candidateEl.textContent = selectedCandidateName;
        if (successEl) successEl.classList.add('show');
      } else {
        showToast('Payment was not successful. Please try again.', 'error');
      }
    },
    onClose: function() {
      showToast('Payment cancelled. You can try again anytime.', 'info');
    }
  });

  handler.openIframe();
}

// ========================================
// RECORD VOTE TO LOCAL STORAGE
// ========================================
function recordVote(eventSlug, candidateId, candidateName, votes) {
  // Record the vote
  let allVotes = JSON.parse(localStorage.getItem('votewave_votes') || '{}');

  if (!allVotes[eventSlug]) {
    allVotes[eventSlug] = [];
  }

  allVotes[eventSlug].push({
    candidateId,
    candidateName,
    votes,
    timestamp: new Date().toISOString()
  });

  localStorage.setItem('votewave_votes', JSON.stringify(allVotes));

  // Update the candidate's vote count
  let candidates = JSON.parse(localStorage.getItem('votewave_candidates') || '[]');
  const candidateIndex = candidates.findIndex(c => c._id === candidateId);

  if (candidateIndex !== -1) {
    candidates[candidateIndex].votes = (candidates[candidateIndex].votes || 0) + votes;
    localStorage.setItem('votewave_candidates', JSON.stringify(candidates));
  }

  // Update the election's total vote count
  let elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
  const electionIndex = elections.findIndex(e => e.slug === eventSlug);

  if (electionIndex !== -1) {
    elections[electionIndex].totalVotes = (elections[electionIndex].totalVotes || 0) + votes;
    localStorage.setItem('votewave_elections', JSON.stringify(elections));
  }

  console.log(`✅ Vote recorded: ${votes} vote(s) for ${candidateName} in event ${eventSlug}`);
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function getTypeIcon(type) {
  const icons = {
    student: '🎓',
    nomination: '🏆',
    event: '🎪',
    club: '🏛️',
    corporate: '🏢',
    poll: '📊',
    other: '🗳️'
  };
  return icons[type] || '🗳️';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  if (!text) return '';
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function getColorForName(name) {
  const colors = [
    '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
    '#f59e0b', '#ec4899', '#ef4444', '#3b82f6',
    '#14b8a6', '#f97316', '#8b5cf6', '#6366f1'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function showToast(message, type = 'info') {
  // Remove existing toasts
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  // Style the toast
  toast.style.cssText = `
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    padding: 1rem 1.5rem;
    background: #1e293b;
    border-left: 3px solid ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6366f1'};
    border-radius: 0.5rem;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    animation: slideIn 0.3s ease;
    max-width: 400px;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 300);
  }, 3500);
}

function showErrorState(message) {
  const container = document.getElementById('categoriesContainer');
  if (container) {
    container.innerHTML = `
      <div style="text-align:center;padding:3rem 2rem;color:var(--text-muted);">
        <i data-lucide="alert-circle" style="width:3rem;height:3rem;margin-bottom:1rem;opacity:0.3;"></i>
        <h3 style="margin-bottom:0.5rem;">Oops!</h3>
        <p>${message}</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// Add slideIn animation if not already present
if (!document.getElementById('micro-animations')) {
  const style = document.createElement('style');
  style.id = 'micro-animations';
  style.textContent = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateX(100%); }
      to { opacity: 1; transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);
}

console.log('✅ VoteWave Event Micro-Site Ready');
console.log('   - Reads real candidates from admin data');
console.log('   - No fake/placeholder data');
console.log('   - Payment integration active');