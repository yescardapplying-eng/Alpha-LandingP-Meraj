/**
 * ============================================================================
 * ALPHA TRADERS — FINAL LEAD SUBMISSION API
 * Endpoint: POST /api/submit-lead
 * ============================================================================
 */

const { query } = require('../lib/db');
const { isValidSessionId, validateStepPayload } = require('../lib/validation');
const { parseRequestBody, sendJson } = require('../lib/helpers');

module.exports = async function handler(req, res) {
  // Method Validation
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method Not Allowed' });
  }

  try {
    const body = await parseRequestBody(req);
    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, { success: false, message: 'Invalid JSON request payload.' });
    }

    const sessionId = (body.session_id || body.sessionId || '').trim();
    if (!isValidSessionId(sessionId)) {
      return sendJson(res, 400, { success: false, message: 'Invalid or missing session_id.' });
    }

    // Server-side validation for Step 5
    const validation = validateStepPayload(5, body);
    if (!validation.valid) {
      return sendJson(res, 400, { success: false, message: validation.error });
    }

    const { whatsapp_number, state } = validation.sanitized;

    // Verify session existence in database
    const checkRes = await query('SELECT id, session_id, lead_reference, status, current_step FROM leads WHERE session_id = $1 LIMIT 1', [sessionId]);

    if (checkRes.rows.length === 0) {
      return sendJson(res, 404, {
        success: false,
        message: 'Questionnaire session record not found. Please start from Step 1.'
      });
    }

    // Atomic update to mark lead as completed
    const updateSql = `
      UPDATE leads SET
        whatsapp_number = $1,
        state = $2,
        current_step = 5,
        status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
      WHERE session_id = $3
      RETURNING session_id, lead_reference, status, current_step, completed_at
    `;

    const updateRes = await query(updateSql, [whatsapp_number, state, sessionId]);

    if (updateRes.rows.length === 0) {
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
