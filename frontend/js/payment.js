// VoteWave Payment System
// Handles Paystack integration for voting payments

const PAYMENT_CONFIG = {
  votePrice: 1.00, // GHS per vote
  currency: 'GHS',
  publicKey: 'pk_test_your_public_key' // Will be replaced with env variable
};

// Initialize payment for voting
async function initializeVotePayment(electionId, categoryId, candidateId, votesCount = 1) {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) {
      showToast('Please login to vote', 'error');
      setTimeout(() => window.location.href = '../auth/login.html', 1500);
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/payment/vote/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        electionId,
        categoryId,
        candidateId,
        votesCount
      })
    });

    const data = await response.json();

    if (data.success && data.data.authorizationUrl) {
      // Store pending vote info for after payment callback
      localStorage.setItem('pendingVote', JSON.stringify({
        electionId,
        categoryId,
        candidateId,
        votesCount,
        reference: data.data.reference,
        timestamp: new Date().toISOString()
      }));
      
      // Redirect to Paystack payment page
      window.location.href = data.data.authorizationUrl;
      return data.data;
    } else {
      showToast(data.message || 'Failed to initialize payment', 'error');
      return null;
    }
  } catch (error) {
    console.error('Payment initialization error:', error);
    showToast('Failed to initialize payment. Please try again.', 'error');
    return null;
  }
}

// Verify payment after callback
async function verifyVotePayment(reference) {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    
    const response = await fetch(`${API_BASE_URL}/payment/vote/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (data.success) {
      // Clear pending vote
      localStorage.removeItem('pendingVote');
      
      // Record the vote locally for immediate feedback
      const pendingVote = JSON.parse(localStorage.getItem('pendingVote') || '{}');
      if (pendingVote.electionId) {
        recordLocalVote(pendingVote);
      }
      
      return {
        success: true,
        voteCount: data.data.votesCast || 1,
        confirmationCode: data.data.confirmationCode
      };
    } else {
      return { success: false, message: data.message };
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    return { success: false, message: error.message };
  }
}

// Record vote locally for immediate UI update
function recordLocalVote(voteInfo) {
  try {
    let votesData = JSON.parse(localStorage.getItem('votewave_votes') || '{}');
    votesData[voteInfo.electionId] = {
      candidate: voteInfo.candidateId,
      count: voteInfo.votesCount,
      category: voteInfo.categoryId,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('votewave_votes', JSON.stringify(votesData));
    
    // Update election vote count
    let elections = JSON.parse(localStorage.getItem('votewave_elections') || '[]');
    const electionIndex = elections.findIndex(e => e._id === voteInfo.electionId);
    if (electionIndex !== -1) {
      elections[electionIndex].totalVotes = (elections[electionIndex].totalVotes || 0) + voteInfo.votesCount;
      localStorage.setItem('votewave_elections', JSON.stringify(elections));
    }
  } catch (e) {
    console.error('Error recording local vote:', e);
  }
}

// Calculate total price
function calculateVoteTotal(votesCount) {
  return (votesCount * PAYMENT_CONFIG.votePrice).toFixed(2);
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    padding: 1rem 1.5rem;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
    border-radius: 0.5rem;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Check for payment callback on page load
function checkPaymentCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const reference = urlParams.get('reference');
  const status = urlParams.get('status');
  
  if (reference && status === 'success') {
    // Verify the payment
    verifyVotePayment(reference).then(result => {
      if (result.success) {
        showToast('Payment successful! Your vote has been recorded.', 'success');
        
        // Show success overlay if on vote page
        const successOverlay = document.getElementById('successOverlay');
        const successVoteCount = document.getElementById('successVoteCount');
        if (successOverlay && successVoteCount) {
          successVoteCount.textContent = result.voteCount || 1;
          successOverlay.classList.add('show');
        }
        
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        showToast('Payment verification failed. Please contact support.', 'error');
      }
    });
  } else if (status === 'cancelled' || status === 'failed') {
    showToast('Payment was cancelled or failed. You can try again.', 'warning');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  checkPaymentCallback();
});
