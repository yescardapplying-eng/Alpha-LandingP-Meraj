/**
 * ============================================================================
 * STOCK MARKET — FINAL LEAD SUBMISSION API
 * Endpoint: POST /api/submit-lead
 * ============================================================================
 */

const { query } = require('../lib/db');
const { safeString, isValidSessionId, validateStepPayload } = require('../lib/validation');
const { parseRequestBody, sendJson } = require('../lib/helpers');

module.exports = async function handler(req, res) {
  // Method Validation
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method Not Allowed' });
  }

  try {
    const body = await parseRequestBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { success: false, message: 'Invalid JSON request payload.' });
    }

    const sessionId = safeString(body.session_id || body.sessionId);
    if (!isValidSessionId(sessionId)) {
      return sendJson(res, 400, { success: false, message: 'Invalid or missing session_id.' });
    }

    // Server-side validation for Step 5
    const validation = validateStepPayload(5, body);
    if (!validation.valid) {
      return sendJson(res, 400, { success: false, message: validation.error });
    }

    const { whatsapp_number, state } = validation.sanitized;

    // Verify session existence in database and inspect all questionnaire fields
    const checkRes = await query(
      'SELECT id, session_id, lead_reference, status, current_step, challenge, full_name, mobile_number, trading_segment, trading_capital, whatsapp_number, state FROM leads WHERE session_id = $1 LIMIT 1',
      [sessionId]
    );

    if (checkRes.rows.length === 0) {
      return sendJson(res, 404, {
        success: false,
        message: 'Questionnaire session record not found. Please start from Step 1.'
      });
    }

    const existing = checkRes.rows[0];

    // Check if session is already completed
    if (existing.status === 'completed') {
      // Idempotent retry check: If same Step 5 data is being submitted (e.g. lost network response), return success
      if (existing.whatsapp_number === whatsapp_number && (!state || existing.state === state)) {
        return sendJson(res, 200, {
          success: true,
          lead_reference: existing.lead_reference,
          status: 'completed'
        });
      }

      // Otherwise reject attempts to modify completed lead
      return sendJson(res, 409, {
        success: false,
        message: 'This questionnaire session has already been completed and cannot be modified.'
      });
    }

    // Server-side validation: Ensure Steps 1 through 4 have been recorded before marking completed
    const incompleteErrors = [];
    if (!existing.challenge || typeof existing.challenge !== 'string' || !existing.challenge.trim()) {
      incompleteErrors.push('Step 1 (challenge) is required.');
    }
    if (!existing.full_name || typeof existing.full_name !== 'string' || !existing.full_name.trim()) {
      incompleteErrors.push('Step 2 (full_name) is required.');
    }
    if (!existing.mobile_number || typeof existing.mobile_number !== 'string' || !existing.mobile_number.trim()) {
      incompleteErrors.push('Step 2 (mobile_number) is required.');
    }
    if (!existing.trading_segment || typeof existing.trading_segment !== 'string' || !existing.trading_segment.trim()) {
      incompleteErrors.push('Step 3 (trading_segment) is required.');
    }
    if (!existing.trading_capital || typeof existing.trading_capital !== 'string' || !existing.trading_capital.trim()) {
      incompleteErrors.push('Step 4 (trading_capital) is required.');
    }

    if (incompleteErrors.length > 0) {
      return sendJson(res, 400, {
        success: false,
        message: `Incomplete questionnaire: All previous steps must be completed before submission. ${incompleteErrors.join(' ')}`
      });
    }

    // Atomic update to mark lead as completed (guarded against concurrent completions)
    const updateSql = `
      UPDATE leads SET
        whatsapp_number = $1,
        state = $2,
        current_step = 5,
        status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
      WHERE session_id = $3 AND status != 'completed'
      RETURNING session_id, lead_reference, status, current_step, completed_at
    `;

    const updateRes = await query(updateSql, [whatsapp_number, state, sessionId]);

    if (updateRes.rows.length === 0) {
      // Check if a concurrent request completed this lead
      const recheck = await query('SELECT lead_reference, status FROM leads WHERE session_id = $1', [sessionId]);
      if (recheck.rows.length > 0 && recheck.rows[0].status === 'completed') {
        return sendJson(res, 200, {
          success: true,
          lead_reference: recheck.rows[0].lead_reference,
          status: 'completed'
        });
      }

      return sendJson(res, 500, {
        success: false,
        message: 'Failed to record completed lead. Please try again.'
      });
    }

    const lead = updateRes.rows[0];

    return sendJson(res, 200, {
      success: true,
      lead_reference: lead.lead_reference,
      status: lead.status
    });
  } catch (err) {
    console.error('[API Error: /api/submit-lead]', err.message);
    return sendJson(res, 500, {
      success: false,
      message: 'Unable to submit your application. Please try again.'
    });
  }
};
