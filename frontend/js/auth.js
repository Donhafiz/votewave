/**
 * VoteWave - Authentication JavaScript
 * Handles login, registration, OTP verification, and password reset
 */

// Initialize auth page
document.addEventListener('DOMContentLoaded', () => {
  initLoginForm();
  initRegisterForm();
  initOTPForm();
  initForgotPasswordForm();
  initResetPasswordForm();
  initPasswordToggle();
});

// Login Form
function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember')?.checked;
    const submitBtn = document.getElementById('submitBtn');

    // Validation
    let isValid = true;

    if (!email) {
      showFieldError('email', 'Email is required');
      isValid = false;
    } else if (!validateEmail(email)) {
      showFieldError('email', 'Please enter a valid email');
      isValid = false;
    }

    if (!password) {
      showFieldError('password', 'Password is required');
      isValid = false;
    }

    if (!isValid) return;

    // Submit
    setButtonLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setTokens(data.data.accessToken, data.data.refreshToken);
        setUser(data.data.user);

        if (remember) {
          localStorage.setItem('rememberEmail', email);
        }

        showToast('Login successful!', 'success');
        
        // Redirect based on role
        const redirect = getRedirectUrl(data.data.user.role);
        window.location.href = redirect;
      } else if (data.code === 'EMAIL_NOT_VERIFIED') {
        // Store userId for OTP verification
        sessionStorage.setItem('pendingUserId', data.data.userId);
        sessionStorage.setItem('pendingEmail', email);
        window.location.href = 'verify-otp.html';
      } else {
        showToast(data.message || 'Login failed', 'error');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
      console.error('Login error:', error);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  // Pre-fill remembered email
  const rememberedEmail = localStorage.getItem('rememberEmail');
  if (rememberedEmail) {
    document.getElementById('email').value = rememberedEmail;
  }
}

// Register Form
function initRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  // Password strength indicator
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('input', updatePasswordStrength);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const agreeTerms = document.getElementById('agreeTerms')?.checked;
    const submitBtn = document.getElementById('submitBtn');

    // Validation
    let isValid = true;

    if (!firstName) {
      showFieldError('firstName', 'First name is required');
      isValid = false;
    } else if (firstName.length < 2) {
      showFieldError('firstName', 'First name must be at least 2 characters');
      isValid = false;
    }

    if (!lastName) {
      showFieldError('lastName', 'Last name is required');
      isValid = false;
    } else if (lastName.length < 2) {
      showFieldError('lastName', 'Last name must be at least 2 characters');
      isValid = false;
    }

    if (!email) {
      showFieldError('email', 'Email is required');
      isValid = false;
    } else if (!validateEmail(email)) {
      showFieldError('email', 'Please enter a valid email');
      isValid = false;
    }

    const passwordValidation = validatePassword(password);
    if (!password) {
      showFieldError('password', 'Password is required');
      isValid = false;
    } else if (!passwordValidation.isValid) {
      showFieldError('password', 'Password must be at least 6 characters with uppercase, lowercase, and number');
      isValid = false;
    }

    if (password !== confirmPassword) {
      showFieldError('confirmPassword', 'Passwords do not match');
      isValid = false;
    }

    if (!agreeTerms) {
      showFieldError('terms', 'You must agree to the terms');
      isValid = false;
    }

    if (!isValid) return;

    // Submit
    setButtonLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store userId for OTP verification
        sessionStorage.setItem('pendingUserId', data.data.userId);
        sessionStorage.setItem('pendingEmail', email);
        
        showToast('Registration successful! Please verify your email.', 'success');
        window.location.href = 'verify-otp.html';
      } else {
        showToast(data.message || 'Registration failed', 'error');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
      console.error('Registration error:', error);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

// OTP Form
function initOTPForm() {
  const form = document.getElementById('otpForm');
  if (!form) return;

  // Display user's email
  const email = sessionStorage.getItem('pendingEmail');
  const emailElement = document.getElementById('userEmail');
  if (email && emailElement) {
    emailElement.textContent = email;
  }

  // OTP input handling
  const inputs = document.querySelectorAll('.otp-input');
  
  inputs.forEach((input, index) => {
    // Only allow numbers
    input.addEventListener('keypress', (e) => {
      if (!/[0-9]/.test(e.key)) {
        e.preventDefault();
      }
    });

    // Auto-focus next input
    input.addEventListener('input', (e) => {
      if (e.target.value.length === 1) {
        input.classList.add('filled');
        if (index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      }
      updateOTPValue();
    });

    // Handle backspace
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    // Focus handling
    input.addEventListener('focus', () => {
      input.select();
    });

    // Paste handling
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData('text').slice(0, 6);
      
      pastedData.split('').forEach((char, i) => {
        if (inputs[i] && /[0-9]/.test(char)) {
          inputs[i].value = char;
          inputs[i].classList.add('filled');
        }
      });
      
      updateOTPValue();
      
      // Focus next empty or last input
      const nextEmpty = Array.from(inputs).find(inp => !inp.value);
      if (nextEmpty) {
        nextEmpty.focus();
      } else if (inputs[inputs.length - 1]) {
        inputs[inputs.length - 1].focus();
      }
    });
  });

  // Focus first input
  if (inputs[0]) {
    inputs[0].focus();
  }

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const otp = document.getElementById('otpCode').value;
    const userId = sessionStorage.getItem('pendingUserId');
    const verifyBtn = document.getElementById('verifyBtn');

    if (otp.length !== 6) {
      showFieldError('otp', 'Please enter all 6 digits');
      return;
    }

    setButtonLoading(verifyBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, otp }),
      });

      const data = await response.json();

      if (response.ok) {
        setTokens(data.data.accessToken, data.data.refreshToken);
        setUser(data.data.user);

        // Clear session storage
        sessionStorage.removeItem('pendingUserId');
        sessionStorage.removeItem('pendingEmail');

        showToast('Email verified successfully!', 'success');
        
        // Redirect to elections
        window.location.href = '../voter/elections.html';
      } else {
        showToast(data.message || 'Verification failed', 'error');
        
        // Clear inputs on error
        inputs.forEach(input => {
          input.value = '';
          input.classList.remove('filled');
        });
        inputs[0]?.focus();
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
      console.error('OTP verification error:', error);
    } finally {
      setButtonLoading(verifyBtn, false);
    }
  });

  // Resend button
  const resendBtn = document.getElementById('resendBtn');
  if (resendBtn) {
    startResendTimer();
    
    resendBtn.addEventListener('click', async () => {
      const userId = sessionStorage.getItem('pendingUserId');
      
      setButtonLoading(resendBtn, true, 'Sending...');

      try {
        const response = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });

        const data = await response.json();

        if (response.ok) {
          showToast('New OTP sent!', 'success');
          startResendTimer();
        } else {
          showToast(data.message || 'Failed to resend OTP', 'error');
        }
      } catch (error) {
        showToast('Network error. Please try again.', 'error');
      } finally {
        setButtonLoading(resendBtn, false, 'Resend');
      }
    });
  }
}

// Forgot Password Form
function initForgotPasswordForm() {
  const form = document.getElementById('forgotForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const email = document.getElementById('email').value.trim();
    const submitBtn = document.getElementById('submitBtn');

    if (!email) {
      showFieldError('email', 'Email is required');
      return;
    }

    setButtonLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        showToast('Password reset link sent to your email!', 'success');
        
        // Redirect to login after a delay
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 3000);
      } else {
        showToast(data.message || 'Failed to send reset link', 'error');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
      console.error('Forgot password error:', error);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

// Reset Password Form
function initResetPasswordForm() {
  const form = document.getElementById('resetForm');
  if (!form) return;

  // Get token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  if (!token) {
    showToast('Invalid reset link', 'error');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const submitBtn = document.getElementById('submitBtn');

    // Validation
    let isValid = true;

    const passwordValidation = validatePassword(password);
    if (!password) {
      showFieldError('password', 'Password is required');
      isValid = false;
    } else if (!passwordValidation.isValid) {
      showFieldError('password', 'Password must be at least 6 characters with uppercase, lowercase, and number');
      isValid = false;
    }

    if (password !== confirmPassword) {
      showFieldError('confirmPassword', 'Passwords do not match');
      isValid = false;
    }

    if (!isValid) return;

    // Submit
    setButtonLoading(submitBtn, true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (response.ok) {
        showToast('Password reset successfully!', 'success');

        // Redirect to login after a delay
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
      } else {
        showToast(data.message || 'Failed to reset password', 'error');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
      console.error('Reset password error:', error);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  // Password strength indicator
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.addEventListener('input', updatePasswordStrength);
  }
}

// Password Toggle
function initPasswordToggle() {
  const toggles = document.querySelectorAll('.password-toggle');

  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const input = toggle.parentElement.querySelector('input');
      const icon = toggle.querySelector('.eye-icon');

      if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-lucide', 'eye-off');
      } else {
        input.type = 'password';
        icon.setAttribute('data-lucide', 'eye');
      }
      lucide.createIcons();
    });
  });
}

// Password Strength Indicator
function updatePasswordStrength() {
  const password = document.getElementById('password').value;
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

// Update hidden OTP input value
function updateOTPValue() {
  const inputs = document.querySelectorAll('.otp-input');
  const otpCode = Array.from(inputs).map(input => input.value).join('');
  
  const hiddenInput = document.getElementById('otpCode');
  if (hiddenInput) {
    hiddenInput.value = otpCode;
  }
}

// Resend timer
function startResendTimer() {
  const resendBtn = document.getElementById('resendBtn');
  const timerElement = document.getElementById('resendTimer');
  const timerSpan = timerElement?.querySelector('span');
  
  if (!resendBtn || !timerElement) return;

  let seconds = 60;
  resendBtn.disabled = true;
  timerElement.style.display = 'block';

  const interval = setInterval(() => {
    seconds--;
    if (timerSpan) {
      timerSpan.textContent = seconds;
    }

    if (seconds <= 0) {
      clearInterval(interval);
      resendBtn.disabled = false;
      timerElement.style.display = 'none';
    }
  }, 1000);
}

// Helper function to set button loading state
function setButtonLoading(button, loading, text = null) {
  if (!button) return;
  
  if (loading) {
    button.classList.add('btn-loading');
    button.disabled = true;
    if (text) {
      button.dataset.originalText = button.querySelector('span')?.textContent || '';
      const span = button.querySelector('span');
      if (span) span.textContent = text;
    }
  } else {
    button.classList.remove('btn-loading');
    button.disabled = false;
    if (button.dataset.originalText) {
      const span = button.querySelector('span');
      if (span) span.textContent = button.dataset.originalText;
    }
  }
}

// Get redirect URL based on user role
function getRedirectUrl(role) {
  switch (role) {
    case 'superadmin':
    case 'admin':
      return '../admin/dashboard.html';
    default:
      return '../voter/elections.html';
  }
}
