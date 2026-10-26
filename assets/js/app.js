/**
 * ==========================================================================
 * STOCK MARKET — QUALIFICATION QUESTIONNAIRE
 * Centralized State Management, Progressive Hooks & Responsive Controller
 * ==========================================================================
 */

(function () {
  'use strict';

  /**
   * Centralized Frontend State Object
   */
  const formState = {
    sessionId: '',
    currentStep: 1,

    // Step 1: Challenge
    challenge: '',

    // Step 2: User Contact Details
    fullName: '',
    mobileNumber: '',

    // Step 3: Segment
    tradingSegment: '',

    // Step 4: Capital
    tradingCapital: '',

    // Step 5: Final Details
    whatsappNumber: '',
    state: '',

    status: 'partial',

    // Marketing Attribution & Meta Parameters
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    fbclid: ''
  };

  /**
   * DOM Elements Cache
   */
  let dom = {};

  /**
   * Initialize Application
   */
  function init() {
    cacheDom();
    initSession();
    captureTrackingParams();
    bindEvents();
    renderStep(formState.currentStep);
    updateProgress(formState.currentStep);
  }

  /**
   * Cache critical DOM elements
   */
  function cacheDom() {
    dom = {
      cardHeader: document.getElementById('cardHeader'),
      cardBody: document.getElementById('cardBody'),
      stepLabel: document.getElementById('stepLabel'),
      stepCounter: document.getElementById('stepCounter'),
      progressFill: document.getElementById('progressFill'),
      reviewScreen: document.getElementById('reviewScreen'),

      // Navigation buttons
      btnBack: document.getElementById('btnBack'),
      btnContinue: document.getElementById('btnContinue'),
      btnSubmit: document.getElementById('btnSubmit'),
      btnRestart: document.getElementById('btnRestart'),

      // Privacy policy modal elements
      btnPrivacyPolicy: document.getElementById('btnPrivacyPolicy'),
      privacyModal: document.getElementById('privacyModal'),
      btnClosePrivacyModal: document.getElementById('btnClosePrivacyModal'),
      btnClosePrivacyModalBottom: document.getElementById('btnClosePrivacyModalBottom'),

      // Input elements
      inputFullName: document.getElementById('fullName'),
      inputMobileNumber: document.getElementById('mobileNumber'),
      inputWhatsappNumber: document.getElementById('whatsappNumber'),
      selectState: document.getElementById('userState'),

      // Review screen elements
      reviewChallenge: document.getElementById('reviewChallenge'),
      reviewFullName: document.getElementById('reviewFullName'),
      reviewMobileNumber: document.getElementById('reviewMobileNumber'),
      reviewTradingSegment: document.getElementById('reviewTradingSegment'),
      reviewTradingCapital: document.getElementById('reviewTradingCapital'),
      reviewWhatsappNumber: document.getElementById('reviewWhatsappNumber'),
      reviewState: document.getElementById('reviewState')
    };
  }

  /**
   * Generate or retrieve existing Session ID
   */
  function initSession() {
    const storageKey = 'stock_market_session_id';
    let savedSession = null;
    let completedSession = null;

    try {
      savedSession = sessionStorage.getItem(storageKey) || sessionStorage.getItem('alpha_traders_session_id');
      completedSession = sessionStorage.getItem('stock_market_completed_session');
    } catch (e) {
      // Handle storage exceptions if private mode disables storage
    }

    // Do NOT reuse if session was already marked completed
    if (savedSession && savedSession !== completedSession && /^(AT|SM)-SESSION-[A-Z0-9]{8}$/.test(savedSession)) {
      formState.sessionId = savedSession;
    } else {
      formState.sessionId = generateSessionId();
      try {
        sessionStorage.setItem(storageKey, formState.sessionId);
      } catch (e) {}
    }
  }

  /**
   * Generates unique session ID formatted as SM-SESSION-XXXXXXXX
   */
  function generateSessionId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `SM-SESSION-${result}`;
  }

  /**
   * Capture UTM and fbclid tracking parameters from current URL
   */
  function captureTrackingParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];

    trackingKeys.forEach(function (key) {
      const val = urlParams.get(key);
      if (val) {
        formState[key] = val.trim();
        try {
          sessionStorage.setItem(`sm_${key}`, val.trim());
        } catch (e) {}
      } else {
        // Fallback to existing session storage if present
        try {
          const cached = sessionStorage.getItem(`sm_${key}`) || sessionStorage.getItem(`alpha_${key}`);
          if (cached) formState[key] = cached;
        } catch (e) {}
      }
    });
  }

  /**
   * Bind DOM event listeners
   */
  function bindEvents() {
    // Option Card selection (Step 1, Step 3, Step 4)
    document.addEventListener('click', function (e) {
      const optionCard = e.target.closest('.option-card');
      if (!optionCard) return;

      const groupName = optionCard.getAttribute('data-group');
      const value = optionCard.getAttribute('data-value');
      const radioInput = optionCard.querySelector('input[type="radio"]');

      if (groupName && value) {
        handleOptionSelect(groupName, value, optionCard, radioInput);
      }
    });

    // Continue / Next Button
    if (dom.btnContinue) {
      dom.btnContinue.addEventListener('click', handleContinue);
    }

    // Back Button
    if (dom.btnBack) {
      dom.btnBack.addEventListener('click', handleBack);
    }

    // Final Submit Button
    if (dom.btnSubmit) {
      dom.btnSubmit.addEventListener('click', handleSubmit);
    }

    // Restart Button (Review Screen)
    if (dom.btnRestart) {
      dom.btnRestart.addEventListener('click', restartQuestionnaire);
    }

    // Privacy Policy Modal Events
    if (dom.btnPrivacyPolicy) {
      dom.btnPrivacyPolicy.addEventListener('click', openPrivacyModal);
    }
    if (dom.btnClosePrivacyModal) {
      dom.btnClosePrivacyModal.addEventListener('click', closePrivacyModal);
    }
    if (dom.btnClosePrivacyModalBottom) {
      dom.btnClosePrivacyModalBottom.addEventListener('click', closePrivacyModal);
    }
    if (dom.privacyModal) {
      dom.privacyModal.addEventListener('click', function (e) {
        if (e.target === dom.privacyModal) {
          closePrivacyModal();
        }
      });
    }

    // Escape key closes modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dom.privacyModal && dom.privacyModal.style.display === 'flex') {
        closePrivacyModal();
      }
    });

    // Input clearing error feedback on typing
    const inputsToWatch = [
      { el: dom.inputFullName, group: 'groupFullName' },
      { el: dom.inputMobileNumber, group: 'groupMobileNumber' },
      { el: dom.inputWhatsappNumber, group: 'groupWhatsappNumber' },
      { el: dom.selectState, group: 'groupState' }
    ];

    inputsToWatch.forEach(function (item) {
      if (item.el) {
        item.el.addEventListener('input', function () {
          clearFieldError(item.group);
        });
        item.el.addEventListener('change', function () {
          clearFieldError(item.group);
        });
      }
    });

    // Keyboard support for option cards (Enter / Space)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        const optionCard = document.activeElement.closest('.option-card');
        if (optionCard) {
          e.preventDefault();
          optionCard.click();
        }
      }
    });
  }

  /**
   * Handle Option Card Selection
   */
  function handleOptionSelect(groupName, value, cardElement, radioInput) {
    // Unselect all other cards in same step
    const parentPane = cardElement.closest('.step-pane');
    if (!parentPane) return;

    const cardsInGroup = parentPane.querySelectorAll(`.option-card[data-group="${groupName}"]`);
    cardsInGroup.forEach(function (card) {
      card.classList.remove('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = false;
    });

    // Select this card
    cardElement.classList.add('selected');
    if (radioInput) radioInput.checked = true;

    // Update state
    if (groupName === 'challenge') {
      formState.challenge = value;
      clearStepBannerError(1);
    } else if (groupName === 'tradingSegment') {
      formState.tradingSegment = value;
      clearStepBannerError(3);
    } else if (groupName === 'tradingCapital') {
      formState.tradingCapital = value;
      clearStepBannerError(4);
    }

    // Enable continue button if it was disabled
    updateButtonStates();
  }

  /**
   * Render active step pane and sync button visibility
   */
  function renderStep(stepNumber) {
    // Hide all step panes
    const panes = document.querySelectorAll('.step-pane');
    panes.forEach(function (pane) {
      pane.classList.remove('active');
    });

    // Show current pane
    const targetPane = document.getElementById(`stepPane${stepNumber}`);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    // Update Back button visibility (Hidden on Step 1)
    if (dom.btnBack) {
      dom.btnBack.style.display = stepNumber === 1 ? 'none' : 'inline-flex';
    }

    // Update Continue / Submit button visibility
    if (dom.btnContinue && dom.btnSubmit) {
      if (stepNumber === 5) {
        dom.btnContinue.style.display = 'none';
        dom.btnSubmit.style.display = 'inline-flex';
      } else {
        dom.btnContinue.style.display = 'inline-flex';
        dom.btnSubmit.style.display = 'none';
      }
    }

    // Restore selected UI state if navigating backwards or forwards
    restoreStepValues(stepNumber);

    // Update button enabled / disabled states
    updateButtonStates();
  }

  /**
   * Restore entered/selected values for a specific step
   */
  function restoreStepValues(stepNumber) {
    if (stepNumber === 1 && formState.challenge) {
      highlightSelectedCard('challenge', formState.challenge);
    } else if (stepNumber === 2) {
      if (dom.inputFullName && formState.fullName) {
        dom.inputFullName.value = formState.fullName;
      }
      if (dom.inputMobileNumber && formState.mobileNumber) {
        dom.inputMobileNumber.value = formState.mobileNumber;
      }
    } else if (stepNumber === 3 && formState.tradingSegment) {
      highlightSelectedCard('tradingSegment', formState.tradingSegment);
    } else if (stepNumber === 4 && formState.tradingCapital) {
      highlightSelectedCard('tradingCapital', formState.tradingCapital);
    } else if (stepNumber === 5) {
      if (dom.inputWhatsappNumber && formState.whatsappNumber) {
        dom.inputWhatsappNumber.value = formState.whatsappNumber;
      }
      if (dom.selectState && formState.state) {
        dom.selectState.value = formState.state;
      }
    }
  }

  /**
   * Helper to highlight selected option card
   */
  function highlightSelectedCard(groupName, value) {
    const card = document.querySelector(`.option-card[data-group="${groupName}"][data-value="${CSS.escape(value)}"]`);
    if (card) {
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    }
  }

  /**
   * Update progress bar and step indicators
   */
  function updateProgress(stepNumber) {
    const totalSteps = 5;
    const percentage = Math.round((stepNumber / totalSteps) * 100);

    if (dom.stepLabel) {
      dom.stepLabel.textContent = `Step ${stepNumber} of ${totalSteps}`;
    }

    if (dom.stepCounter) {
      dom.stepCounter.textContent = `${percentage}% Completed`;
    }

    if (dom.progressFill) {
      dom.progressFill.style.width = `${percentage}%`;
      dom.progressFill.setAttribute('aria-valuenow', percentage);
    }
  }

  /**
   * Update button disabled/enabled state based on current step requirements
   */
  function updateButtonStates() {
    if (!dom.btnContinue) return;

    if (formState.currentStep === 1) {
      dom.btnContinue.disabled = !formState.challenge;
    } else if (formState.currentStep === 3) {
      dom.btnContinue.disabled = !formState.tradingSegment;
    } else if (formState.currentStep === 4) {
      dom.btnContinue.disabled = !formState.tradingCapital;
    } else {
      dom.btnContinue.disabled = false;
    }
  }

  /**
   * Clean and normalize Indian Mobile numbers
   * Strips spaces, dashes, +91, 0 prefixes and ensures 10 digits starting with 6-9
   */
  function validateIndianMobile(phoneStr) {
    if (!phoneStr || typeof phoneStr !== 'string') return false;
    // Strip all non-digit characters except leading plus
    let clean = phoneStr.trim().replace(/[\s\-\(\)]/g, '');

    // Strip leading +91 or 91 if present and length > 10
    if (clean.startsWith('+91')) {
      clean = clean.substring(3);
    } else if (clean.startsWith('91') && clean.length === 12) {
      clean = clean.substring(2);
    } else if (clean.startsWith('0') && clean.length === 11) {
      clean = clean.substring(1);
    }

    // Must be exactly 10 digits starting with 6, 7, 8, or 9
    const regex = /^[6-9]\d{9}$/;
    if (regex.test(clean)) {
      return clean;
    }
    return false;
  }

  /**
   * Validate current step before advancing
   */
  function validateStep(stepNumber) {
    let isValid = true;

    if (stepNumber === 1) {
      if (!formState.challenge) {
        showStepBannerError(1, 'Please select an option to continue.');
        isValid = false;
      }
    } else if (stepNumber === 2) {
      // Full Name Validation
      const rawName = dom.inputFullName ? dom.inputFullName.value.trim() : '';
      if (!rawName || rawName.length < 2) {
        showFieldError('groupFullName', 'Please enter your full name (minimum 2 letters).');
        isValid = false;
      } else if (!/^[A-Za-z\s\.\-']{2,60}$/.test(rawName)) {
        showFieldError('groupFullName', 'Please enter a valid name using letters only.');
        isValid = false;
      } else {
        clearFieldError('groupFullName');
        formState.fullName = rawName;
      }

      // Mobile Number Validation
      const rawMobile = dom.inputMobileNumber ? dom.inputMobileNumber.value.trim() : '';
      const normalizedMobile = validateIndianMobile(rawMobile);
      if (!rawMobile) {
        showFieldError('groupMobileNumber', 'Please enter your primary mobile number.');
        isValid = false;
      } else if (!normalizedMobile) {
        showFieldError('groupMobileNumber', 'Please enter a valid 10-digit Indian mobile number.');
        isValid = false;
      } else {
        clearFieldError('groupMobileNumber');
        formState.mobileNumber = normalizedMobile;
      }
    } else if (stepNumber === 3) {
      if (!formState.tradingSegment) {
        showStepBannerError(3, 'Please select your trading segment to continue.');
        isValid = false;
      }
    } else if (stepNumber === 4) {
      if (!formState.tradingCapital) {
        showStepBannerError(4, 'Please select your trading capital to continue.');
        isValid = false;
      }
    } else if (stepNumber === 5) {
      // WhatsApp Number Validation (MUST remain separate from mobileNumber)
      const rawWa = dom.inputWhatsappNumber ? dom.inputWhatsappNumber.value.trim() : '';
      const normalizedWa = validateIndianMobile(rawWa);
      if (!rawWa) {
        showFieldError('groupWhatsappNumber', 'Please enter your WhatsApp number.');
        isValid = false;
      } else if (!normalizedWa) {
        showFieldError('groupWhatsappNumber', 'Please enter a valid 10-digit WhatsApp number.');
        isValid = false;
      } else {
        clearFieldError('groupWhatsappNumber');
        formState.whatsappNumber = normalizedWa;
      }

      // State Validation
      const selectedState = dom.selectState ? dom.selectState.value.trim() : '';
      if (!selectedState) {
        showFieldError('groupState', 'Please select your state.');
        isValid = false;
      } else {
        clearFieldError('groupState');
        formState.state = selectedState;
      }
    }

    return isValid;
  }

  /**
   * UI Error helpers
   */
  function showFieldError(groupId, message) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.classList.add('has-error');
    const msgEl = group.querySelector('.field-error-msg');
    if (msgEl) {
      msgEl.textContent = message;
      msgEl.style.display = 'flex';
    }
  }

  function clearFieldError(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.classList.remove('has-error');
    const msgEl = group.querySelector('.field-error-msg');
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.style.display = 'none';
    }
  }

  function showStepBannerError(stepNumber, message) {
    const banner = document.getElementById(`stepBannerError${stepNumber}`);
    if (banner) {
      banner.textContent = message;
      banner.classList.add('visible');
    }
  }

  function clearStepBannerError(stepNumber) {
    const banner = document.getElementById(`stepBannerError${stepNumber}`);
    if (banner) {
      banner.textContent = '';
      banner.classList.remove('visible');
    }
  }

  let isSaving = false;
  let isSubmitting = false;

  /**
   * ==========================================================================
   * PROGRESSIVE BACKEND SAVING ARCHITECTURE
   * Asynchronously saves progress via Vercel Node.js Serverless API
   * ==========================================================================
   */
  async function saveStepProgress(stepNumber) {
    const payload = {
      session_id: formState.sessionId,
      step: stepNumber,
      utm_source: formState.utm_source,
      utm_medium: formState.utm_medium,
      utm_campaign: formState.utm_campaign,
      utm_content: formState.utm_content,
      utm_term: formState.utm_term,
      fbclid: formState.fbclid
    };

    if (stepNumber === 1) {
      payload.challenge = formState.challenge;
    } else if (stepNumber === 2) {
      payload.full_name = formState.fullName;
      payload.mobile_number = formState.mobileNumber;
    } else if (stepNumber === 3) {
      payload.trading_segment = formState.tradingSegment;
    } else if (stepNumber === 4) {
      payload.trading_capital = formState.tradingCapital;
    } else if (stepNumber === 5) {
      payload.whatsapp_number = formState.whatsappNumber;
      payload.state = formState.state;
    }

    let response;
    try {
      response = await fetch('/api/track-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (netErr) {
      throw new Error('Network error. Please check your internet connection and try again.');
    }

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseErr) {
        data = null;
      }
    }

    if (!response.ok || !data || data.success !== true) {
      if (response.status === 404) {
        throw new Error('API route not found (HTTP 404). Please ensure the backend server is running.');
      }
      const errorMsg = (data && data.message) ? data.message : `Unable to save your progress (HTTP ${response.status}). Please try again.`;
      throw new Error(errorMsg);
    }

    if (data.lead_reference) {
      formState.leadReference = data.lead_reference;
    }

    return data;
  }

  /**
   * Handle Continue / Next Step with Backend Confirmation
   */
  async function handleContinue() {
    if (isSaving) return;
    const current = formState.currentStep;

    if (!validateStep(current)) {
      return;
    }

    isSaving = true;

    // Double-click protection & visual loading state
    if (dom.btnContinue) {
      dom.btnContinue.disabled = true;
      dom.btnContinue.setAttribute('data-original-text', dom.btnContinue.innerHTML);
      dom.btnContinue.innerHTML = '<span>Saving...</span>';
    }

    try {
      // Advance ONLY after backend confirms successful save
      await saveStepProgress(current);
      clearStepBannerError(current);

      if (current < 5) {
        formState.currentStep = current + 1;
        renderStep(formState.currentStep);
        updateProgress(formState.currentStep);
        scrollToTopOfCard();
      }
    } catch (err) {
      // On failure: Stay on current step, keep data, show friendly retry error
      showStepBannerError(current, err.message || 'Unable to save your progress. Please check your connection and try again.');
    } finally {
      isSaving = false;
      if (dom.btnContinue) {
        dom.btnContinue.disabled = false;
        const originalText = dom.btnContinue.getAttribute('data-original-text');
        if (originalText) dom.btnContinue.innerHTML = originalText;
        updateButtonStates();
      }
    }
  }

  /**
   * Handle Back Step Navigation
   */
  function handleBack() {
    if (formState.currentStep > 1) {
      clearStepBannerError(formState.currentStep);
      formState.currentStep -= 1;
      renderStep(formState.currentStep);
      updateProgress(formState.currentStep);
      scrollToTopOfCard();
    }
  }

  /**
   * Handle Final Submission (Step 5 via POST /api/submit-lead)
   */
  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    if (!validateStep(5)) {
      return;
    }

    isSubmitting = true;

    // Disable button to prevent multi-clicks
    if (dom.btnSubmit) {
      dom.btnSubmit.disabled = true;
      dom.btnSubmit.innerHTML = '<span>Submitting...</span>';
    }

    try {
      // Step 1: Save Step 5 data to PostgreSQL before final completion
      await saveStepProgress(5);

      // Step 2: Final completion submission
      const payload = {
        session_id: formState.sessionId,
        whatsapp_number: formState.whatsappNumber,
        state: formState.state
      };

      let response;
      try {
        response = await fetch('/api/submit-lead', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } catch (netErr) {
        throw new Error('Network error. Please check your internet connection and try again.');
      }

      let data = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (parseErr) {
          data = null;
        }
      }

      if (!response.ok || !data || data.success !== true) {
        if (response.status === 404) {
          throw new Error('API route not found (HTTP 404). Please ensure the backend server is running.');
        }
        const errorMsg = (data && data.message) ? data.message : `Unable to submit your application (HTTP ${response.status}). Please try again.`;
        throw new Error(errorMsg);
      }

      clearStepBannerError(5);
      formState.status = 'completed';
      if (data.lead_reference) {
        formState.leadReference = data.lead_reference;
      }

      // Invalidate completed session so it can NEVER be reused or modified
      try {
        sessionStorage.setItem('stock_market_completed_session', formState.sessionId);
        sessionStorage.removeItem('stock_market_session_id');
        sessionStorage.removeItem('alpha_traders_session_id');
      } catch (e) {}

      // Show Review / Confirmation Screen
      showReviewScreen();
    } catch (err) {
      showStepBannerError(5, err.message || 'Unable to submit your application. Please check your connection and try again.');
      if (dom.btnSubmit) {
        dom.btnSubmit.disabled = false;
        dom.btnSubmit.innerHTML = '<span>Submit</span><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      }
    } finally {
      isSubmitting = false;
    }
  }

  /**
   * Reset questionnaire and start a fresh session
   */
  function restartQuestionnaire() {
    // Generate brand new session ID
    formState.sessionId = generateSessionId();
    try {
      sessionStorage.setItem('stock_market_session_id', formState.sessionId);
    } catch (e) {}

    // Reset state values
    formState.currentStep = 1;
    formState.challenge = '';
    formState.fullName = '';
    formState.mobileNumber = '';
    formState.tradingSegment = '';
    formState.tradingCapital = '';
    formState.whatsappNumber = '';
    formState.state = '';
    formState.status = 'partial';
    delete formState.leadReference;

    // Reset inputs
    if (dom.inputFullName) dom.inputFullName.value = '';
    if (dom.inputMobileNumber) dom.inputMobileNumber.value = '';
    if (dom.inputWhatsappNumber) dom.inputWhatsappNumber.value = '';
    if (dom.selectState) dom.selectState.value = '';

    // Unselect all option cards
    document.querySelectorAll('.option-card').forEach(function (card) {
      card.classList.remove('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = false;
    });

    // Clear all error banners & field messages
    for (let s = 1; s <= 5; s++) {
      clearStepBannerError(s);
    }
    clearFieldError('groupFullName');
    clearFieldError('groupMobileNumber');
    clearFieldError('groupWhatsappNumber');
    clearFieldError('groupState');

    // Reset submit button state
    if (dom.btnSubmit) {
      dom.btnSubmit.disabled = false;
      dom.btnSubmit.innerHTML = '<span>Submit</span><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }

    // Hide review screen, show card header and body
    if (dom.reviewScreen) dom.reviewScreen.classList.remove('active');
    if (dom.cardHeader) dom.cardHeader.style.display = 'block';
    if (dom.cardBody) dom.cardBody.style.display = 'block';

    // Render Step 1
    renderStep(1);
    updateProgress(1);
    scrollToTopOfCard();
  }

  /**
   * Modal Dialog Controllers
   */
  function openPrivacyModal() {
    if (dom.privacyModal) {
      dom.privacyModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      if (dom.btnClosePrivacyModal) dom.btnClosePrivacyModal.focus();
    }
  }

  function closePrivacyModal() {
    if (dom.privacyModal) {
      dom.privacyModal.style.display = 'none';
      document.body.style.overflow = '';
      if (dom.btnPrivacyPolicy) dom.btnPrivacyPolicy.focus();
    }
  }

  /**
   * Render Review Screen with collected data
   */
  function showReviewScreen() {
    // Hide Form Header and Body
    if (dom.cardHeader) dom.cardHeader.style.display = 'none';
    if (dom.cardBody) dom.cardBody.style.display = 'none';

    // Populate readable summary values
    if (dom.reviewChallenge) dom.reviewChallenge.textContent = formState.challenge || '—';
    if (dom.reviewFullName) dom.reviewFullName.textContent = formState.fullName || '—';
    if (dom.reviewMobileNumber) dom.reviewMobileNumber.textContent = formState.mobileNumber ? `+91 ${formState.mobileNumber}` : '—';
    if (dom.reviewTradingSegment) dom.reviewTradingSegment.textContent = formState.tradingSegment || '—';
    if (dom.reviewTradingCapital) dom.reviewTradingCapital.textContent = formState.tradingCapital || '—';
    if (dom.reviewWhatsappNumber) dom.reviewWhatsappNumber.textContent = formState.whatsappNumber ? `+91 ${formState.whatsappNumber}` : '—';
    if (dom.reviewState) dom.reviewState.textContent = formState.state || '—';

    // Show Review Screen
    if (dom.reviewScreen) {
      dom.reviewScreen.classList.add('active');
    }

    scrollToTopOfCard();
  }

  /**
   * Smoothly scroll to the assessment container top on step transition
   */
  function scrollToTopOfCard() {
    const card = document.querySelector('.assessment-card');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Expose state and hook on window object for testing and Phase 2 inspection
  window.StockMarketApp = {
    getState: function () {
      return Object.assign({}, formState);
    },
    saveStepProgress: saveStepProgress,
    renderStep: renderStep,
    validateStep: validateStep,
    restartQuestionnaire: restartQuestionnaire
  };
  window.AlphaTradersApp = window.StockMarketApp; // Alias for backward compatibility

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
