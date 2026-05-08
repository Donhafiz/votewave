document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) {
    window.location.href = '../auth/login.html';
    return;
  }

  const user = getUser();
  if (user.role !== 'admin' && user.role !== 'superadmin') {
    showToast('Access denied. Admin privileges required.', 'error');
    window.location.href = '../voter/elections.html';
    return;
  }

  loadSettings();
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
});

async function loadSettings() {
  try {
    const response = await apiRequest('/admin/settings');
    if (!response.success) {
      showToast('Unable to load settings', 'error');
      return;
    }

    const settings = response.data;
    // General settings
    document.getElementById('registrationEnabled').checked = !!settings.registrationEnabled;
    document.getElementById('emailVerificationRequired').checked = !!settings.emailVerificationRequired;
    document.getElementById('maxElectionsPerUser').value = settings.maxElectionsPerUser || 10;
    document.getElementById('maxCandidatesPerElection').value = settings.maxCandidatesPerElection || 20;
    document.getElementById('defaultTimezone').value = settings.defaultTimezone || 'UTC';
    document.getElementById('maintenanceMode').checked = !!settings.maintenanceMode;

    // Security settings (may not exist in older API versions)
    const twoFactorEl = document.getElementById('twoFactorRequired');
    if (twoFactorEl) twoFactorEl.checked = !!settings.twoFactorRequired;

    const sessionTimeoutEl = document.getElementById('sessionTimeout');
    if (sessionTimeoutEl) sessionTimeoutEl.value = settings.sessionTimeout || 24;

    const passwordMinLengthEl = document.getElementById('passwordMinLength');
    if (passwordMinLengthEl) passwordMinLengthEl.value = settings.passwordMinLength || 8;

    const auditLogRetentionEl = document.getElementById('auditLogRetention');
    if (auditLogRetentionEl) auditLogRetentionEl.value = settings.auditLogRetention || 90;
  } catch (error) {
    console.error('Settings load failed:', error);
    showToast('Unable to load system settings', 'error');
  }
}

async function saveSettings() {
  const saveButton = document.getElementById('saveSettingsBtn');
  if (saveButton) saveButton.disabled = true;

  const payload = {
    registrationEnabled: document.getElementById('registrationEnabled').checked,
    emailVerificationRequired: document.getElementById('emailVerificationRequired').checked,
    maxElectionsPerUser: parseInt(document.getElementById('maxElectionsPerUser').value, 10) || 10,
    maxCandidatesPerElection: parseInt(document.getElementById('maxCandidatesPerElection').value, 10) || 20,
    defaultTimezone: document.getElementById('defaultTimezone').value.trim() || 'UTC',
    maintenanceMode: document.getElementById('maintenanceMode').checked,
    // Security settings
    twoFactorRequired: document.getElementById('twoFactorRequired')?.checked || false,
    sessionTimeout: parseInt(document.getElementById('sessionTimeout')?.value, 10) || 24,
    passwordMinLength: parseInt(document.getElementById('passwordMinLength')?.value, 10) || 8,
    auditLogRetention: parseInt(document.getElementById('auditLogRetention')?.value, 10) || 90,
  };

  try {
    const response = await apiRequest('/admin/settings', {
      method: 'PUT',
      body: payload,
    });

    if (response.success) {
      showToast('Settings updated successfully', 'success');
    } else {
      showToast(response.message || 'Failed to save settings', 'error');
    }
  } catch (error) {
    console.error('Settings update failed:', error);
    showToast('Failed to save system settings', 'error');
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}
