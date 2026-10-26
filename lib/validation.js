/**
 * ============================================================================
 * STOCK MARKET — SERVER-SIDE VALIDATION MODULE
 * ============================================================================
 */

const ALLOWED_CHALLENGES = [
  'Frequent stop-loss hits',
  'Wrong position sizing',
  'No proper exit plan',
  'Emotional decision-making'
];

const ALLOWED_SEGMENTS = [
  'Equity',
  'Options',
  'Futures',
  'Commodity'
];

const ALLOWED_CAPITALS = [
  'Below 50K',
  '50K–1 Lakh',
  '50K-1 Lakh',
  '1 Lakh–2 Lakh',
  '1 Lakh-2 Lakh',
  '2 Lakh+'
];

const ALLOWED_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi (NCT)',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

/**
 * Safely extracts trimmed string from input
 */
function safeString(val) {
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Validates session_id format (SM-SESSION-XXXXXXXX or AT-SESSION-XXXXXXXX)
 */
function isValidSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  return /^(AT|SM)-SESSION-[A-Z0-9]{8}$/.test(sessionId.trim());
}

/**
 * Clean & validate Indian mobile numbers (10 digits starting with 6,7,8,9)
 */
function validateIndianMobile(phoneStr) {
  if (typeof phoneStr === 'number') {
    phoneStr = String(phoneStr);
  }
  if (!phoneStr || typeof phoneStr !== 'string') return null;
  let clean = phoneStr.trim().replace(/[\s\-\(\)]/g, '');

  if (clean.startsWith('+91')) {
    clean = clean.substring(3);
  } else if (clean.startsWith('91') && clean.length === 12) {
    clean = clean.substring(2);
  } else if (clean.startsWith('0') && clean.length === 11) {
    clean = clean.substring(1);
  }

  const regex = /^[6-9]\d{9}$/;
  if (regex.test(clean)) {
    return clean;
  }
  return null;
}

/**
 * Validates step payload
 */
function validateStepPayload(step, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Invalid payload: data must be a valid JSON object.' };
  }

  const stepNum = parseInt(step, 10);
  if (isNaN(stepNum) || stepNum < 1 || stepNum > 5) {
    return { valid: false, error: 'Invalid step number.' };
  }

  if (stepNum === 1) {
    const challenge = safeString(data.challenge);
    if (!challenge || !ALLOWED_CHALLENGES.includes(challenge)) {
      return { valid: false, error: 'Please select a valid trading challenge option.' };
    }
    return { valid: true, sanitized: { challenge } };
  }

  if (stepNum === 2) {
    const rawName = data.full_name !== undefined ? data.full_name : data.fullName;
    const name = safeString(rawName);
    if (!name || name.length < 2 || name.length > 100) {
      return { valid: false, error: 'Please enter a valid full name (minimum 2 characters).' };
    }
    if (!/^[A-Za-z\s\.\-']{2,100}$/.test(name)) {
      return { valid: false, error: 'Full name contains invalid characters.' };
    }

    const rawMobile = data.mobile_number !== undefined ? data.mobile_number : data.mobileNumber;
    const mobile = validateIndianMobile(rawMobile);
    if (!mobile) {
      return { valid: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
    }

    return { valid: true, sanitized: { full_name: name, mobile_number: mobile } };
  }

  if (stepNum === 3) {
    const segment = safeString(data.trading_segment !== undefined ? data.trading_segment : data.tradingSegment);
    if (!segment || !ALLOWED_SEGMENTS.includes(segment)) {
      return { valid: false, error: 'Please select a valid trading segment.' };
    }
    return { valid: true, sanitized: { trading_segment: segment } };
  }

  if (stepNum === 4) {
    let capital = safeString(data.trading_capital !== undefined ? data.trading_capital : data.tradingCapital);
    // Normalize en-dash / hyphen
    if (capital === '50K-1 Lakh') capital = '50K–1 Lakh';
    if (capital === '1 Lakh-2 Lakh') capital = '1 Lakh–2 Lakh';

    if (!capital || !ALLOWED_CAPITALS.includes(capital)) {
      return { valid: false, error: 'Please select a valid trading capital option.' };
    }
    return { valid: true, sanitized: { trading_capital: capital } };
  }

  if (stepNum === 5) {
    const rawWa = data.whatsapp_number !== undefined ? data.whatsapp_number : data.whatsappNumber;
    const wa = validateIndianMobile(rawWa);
    if (!wa) {
      return { valid: false, error: 'Please enter a valid 10-digit WhatsApp number.' };
    }

    const rawState = safeString(data.state !== undefined ? data.state : data.userState);
    if (!rawState || !ALLOWED_STATES.includes(rawState)) {
      return { valid: false, error: 'Please select a valid Indian state or Union Territory.' };
    }

    return { valid: true, sanitized: { whatsapp_number: wa, state: rawState } };
  }

  return { valid: false, error: 'Unhandled step.' };
}

module.exports = {
  safeString,
  safeTrim: safeString,
  isValidSessionId,
  validateIndianMobile,
  validateStepPayload,
  ALLOWED_CHALLENGES,
  ALLOWED_SEGMENTS,
  ALLOWED_CAPITALS,
  ALLOWED_STATES
};
