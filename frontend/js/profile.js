/**
 * VoteWave - Profile Page JavaScript
 * Handles profile management, password changes, and settings
 */

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadProfile();
  initTabs();
  initForms();
  initAvatarUpload();
});

// Check authentication
function checkAuth() {
  if (!isLoggedIn()) {
    window.location.href = '../auth/login.html';
    return;
  }
}

// Load user profile
async function loadProfile() {
  try {
    const response = await apiRequest('/users/profile');
    
    if (response.success) {
      currentUser = response.data;
      renderProfile(response.data);
    } else {
      showToast('Failed to load profile', 'error');
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    showToast('Failed to load profile', 'error');
  }
}

// Render profile data
function renderProfile(user) {
  // Profile card
  const nameEl = document.getElementById('profileName');
  const emailEl = document.getElementById('profileEmail');
  const initialsEl = document.getElementById('avatarInitials');
  const avatarImg = document.getElementById('avatarImage');
  const roleEl = document.getElementById('roleBadge');

  if (nameEl) nameEl.textContent = `${user.firstName} ${user.lastName}`;
  if (emailEl) emailEl.textContent = user.email;
  if (roleEl) {
    roleEl.textContent = user.role;
    roleEl.className = `role-badge ${user.role}`;
  }

  // Avatar
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  if (initialsEl) initialsEl.textContent = initials;

  if (user.avatar) {
    if (initialsEl) initialsEl.classList.add('hidden');
    if (avatarImg) {
      avatarImg.src = user.avatar;
      avatarImg.classList.remove('hidden');
    }
  }

  // Personal form
  const firstNameInput = document.getElementById('firstName');
  const lastNameInput = document.getElementById('lastName');
  const emailInput = document.getElementById('email');

  if (firstNameInput) firstNameInput.value = user.firstName;
  if (lastNameInput) lastNameInput.value = user.lastName;
  if (emailInput) emailInput.value = user.email;

  // Notification preferences
  if (user.notificationPreferences) {
    const emailNotif = document.getElementById('emailNotifications');
    const electionRemind = document.getElementById('electionReminders');
    const resultNotif = document.getElementById('resultNotifications');

    if (emailNotif) emailNotif.checked = user.notificationPreferences.emailNotifications;
    if (electionRemind) electionRemind.checked = user.notificationPreferences.electionReminders;
    if (resultNotif) resultNotif.checked = user.notificationPreferences.resultNotifications;
  }

  // Load activity
  loadActivity();
}

// Initialize tabs
function initTabs() {
  const tabLinks = document.querySelectorAll('.profile-nav-link');
  const tabs = document.querySelectorAll('.profile-tab');

  tabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = link.dataset.tab;

      // Update active states
      tabLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      tabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.id === targetTab) {
          tab.classList.add('active');
        }
      });

      // Update URL hash
      window.location.hash = targetTab;
    });
  });

  // Check URL hash on load
  const hash = window.location.hash.slice(1);
  if (hash) {
    const targetLink = document.querySelector(`[data-tab="${hash}"]`);
    if (targetLink) {
      targetLink.click();
    }
  }
}

// Initialize forms
function initForms() {
  // Personal info form
  const personalForm = document.getElementById('personalForm');
  if (personalForm) {
    personalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const firstName = document.getElementById('firstName').value.trim();
      const lastName = document.getElementById('lastName').value.trim();
      const submitBtn = document.getElementById('savePersonal');

      setButtonLoading(submitBtn, true);

      try {
        const response = await apiRequest('/users/profile', {
          method: 'PUT',
          body: { firstName, lastName },
        });

        if (response.success) {
          showToast('Profile updated successfully!', 'success');
          // Update stored user data
          const user = getUser();
          user.firstName = firstName;
          user.lastName = lastName;
          setUser(user);
          // Re-render profile name
          document.getElementById('profileName').textContent = `${firstName} ${lastName}`;
        } else {
          showToast(response.message || 'Failed to update profile', 'error');
        }
      } catch (error) {
        showToast('Failed to update profile', 'error');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Password form
  const passwordForm = document.getElementById('passwordForm');
  if (passwordForm) {
    // Password strength
    const newPasswordInput = document.getElementById('newPassword');
    if (newPasswordInput) {
      newPasswordInput.addEventListener('input', updatePasswordStrength);
    }

    // Toggle password visibility
    passwordForm.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.previousElementSibling;
        if (input.type === 'password') {
          input.type = 'text';
          btn.innerHTML = '<i data-lucide="eye-off"></i>';
        } else {
          input.type = 'password';
          btn.innerHTML = '<i data-lucide="eye"></i>';
        }
        lucide.createIcons();
      });
    });

    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmNewPassword = document.getElementById('confirmNewPassword').value;
      const submitBtn = document.getElementById('changePassword');

      if (newPassword !== confirmNewPassword) {
        showToast('New passwords do not match', 'error');
        return;
      }

      const validation = validatePassword(newPassword);
      if (!validation.isValid) {
        showToast('Password must be at least 6 characters with uppercase, lowercase, and number', 'error');
        return;
      }

      setButtonLoading(submitBtn, true);

      try {
        const response = await apiRequest('/users/password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });

        if (response.success) {
          showToast('Password changed successfully!', 'success');
          passwordForm.reset();
          updatePasswordStrength();
        } else {
          showToast(response.message || 'Failed to change password', 'error');
        }
      } catch (error) {
        showToast(error.message || 'Failed to change password', 'error');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Notifications form
  const notificationsForm = document.getElementById('notificationsForm');
  if (notificationsForm) {
    notificationsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = document.getElementById('saveNotifications');
      setButtonLoading(submitBtn, true);

      const preferences = {
        emailNotifications: document.getElementById('emailNotifications').checked,
        electionReminders: document.getElementById('electionReminders').checked,
        resultNotifications: document.getElementById('resultNotifications').checked,
      };

      try {
        const response = await apiRequest('/users/profile', {
          method: 'PUT',
          body: { notificationPreferences: preferences },
        });

        if (response.success) {
          showToast('Preferences saved successfully!', 'success');
        } else {
          showToast(response.message || 'Failed to save preferences', 'error');
        }
      } catch (error) {
        showToast('Failed to save preferences', 'error');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // Delete account button
  const deleteBtn = document.getElementById('deleteAccount');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        return;
      }

      try {
        const response = await apiRequest('/users/profile', {
          method: 'DELETE',
        });

        if (response.success) {
          showToast('Account deleted successfully', 'success');
          clearTokens();
          window.location.href = '../index.html';
        } else {
          showToast(response.message || 'Failed to delete account', 'error');
        }
      } catch (error) {
        showToast('Failed to delete account', 'error');
      }
    });
  }
}

// Initialize avatar upload
function initAvatarUpload() {
  const avatarInput = document.getElementById('avatarInput');
  if (!avatarInput) return;

  avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch(`${API_BASE_URL}/users/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        showToast('Avatar updated successfully!', 'success');
        
        // Update avatar display
        const initialsEl = document.getElementById('avatarInitials');
        const avatarImg = document.getElementById('avatarImage');
        
        if (initialsEl) initialsEl.classList.add('hidden');
        if (avatarImg) {
          avatarImg.src = data.data.avatar;
          avatarImg.classList.remove('hidden');
        }

        // Update stored user data
        const user = getUser();
        user.avatar = data.data.avatar;
        setUser(user);
      } else {
        showToast(data.message || 'Failed to upload avatar', 'error');
      }
    } catch (error) {
      showToast('Failed to upload avatar', 'error');
    }
  });
}

// Load activity
async function loadActivity() {
  const container = document.getElementById('activityList');
  if (!container) return;

  try {
    const response = await apiRequest('/users/voting-history?limit=10');
    
    if (response.success && response.data.length > 0) {
      container.innerHTML = response.data.map(vote => `
        <div class="activity-item">
          <div class="activity-icon">
            <i data-lucide="vote"></i>
          </div>
          <div class="activity-content">
            <p>Voted in <strong>${escapeHtml(vote.election?.title || 'Unknown Election')}</strong></p>
            <span class="time">${timeAgo(vote.votedAt)}</span>
          </div>
        </div>
      `).join('');
      lucide.createIcons();
    } else {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-8);">
          <p>No recent activity</p>
        </div>
      `;
    }
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-8);">
        <p>Failed to load activity</p>
      </div>
    `;
  }
}

// Update password strength indicator
function updatePasswordStrength() {
  const password = document.getElementById('newPassword').value;
  const strengthFill = document.getElementById('strengthFill');
  const strengthText = document.getElementById('strengthText');

  if (!strengthFill || !strengthText) return;

  const validation = validatePassword(password);
  strengthFill.className = 'strength-fill';

  if (password.length === 0) {
    strengthFill.style.width = '0';
    strengthText.textContent = 'Password strength';
  } else if (validation.isValid) {
    strengthFill.classList.add('strong');
    strengthText.textContent = 'Strong password';
  } else if (validation.minLength && (validation.hasUppercase || validation.hasLowercase)) {
    strengthFill.classList.add('medium');
    strengthText.textContent = 'Medium strength';
  } else {
    strengthFill.classList.add('weak');
    strengthText.textContent = 'Weak password';
  }
}

// Helper function
function setButtonLoading(button, loading) {
  if (!button) return;
  
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = '<span class="spinner" style="width: 1rem; height: 1rem; border-width: 2px;"></span>';
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
