/**
 * ============================================================================
 * ALPHA TRADERS — PROGRESSIVE STEP TRACKING API
 * Endpoint: POST /api/track-step
 * ============================================================================
 */

const { query } = require('../lib/db');
const { isValidSessionId, validateStepPayload } = require('../lib/validation');
const { generateLeadReference, getClientIp, getUserAgent, parseRequestBody, sendJson } = require('../lib/helpers');

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

    const stepNum = parseInt(body.step || body.current_step || body.currentStep, 10);
    if (isNaN(stepNum) || stepNum < 1 || stepNum > 4) {
      return sendJson(res, 400, { success: false, message: 'Invalid questionnaire step (Steps 1-4 allowed).' });
    }

    // Server-side field validation
    const validation = validateStepPayload(stepNum, body);
    if (!validation.valid) {
      return sendJson(res, 400, { success: false, message: validation.error });
    }

    const sanitized = validation.sanitized;
    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    // Check if session record already exists
    const checkRes = await query('SELECT id, session_id, lead_reference, current_step, status FROM leads WHERE session_id = $1 LIMIT 1', [sessionId]);

    if (checkRes.rows.length === 0) {
      // First Save (INSERT new partial lead record)
      const leadRef = generateLeadReference();
      const utmSource = (body.utm_source || '').trim() || null;
      const utmMedium = (body.utm_medium || '').trim() || null;
      const utmCampaign = (body.utm_campaign || '').trim() || null;
      const utmContent = (body.utm_content || '').trim() || null;
      const utmTerm = (body.utm_term || '').trim() || null;
      const fbclid = (body.fbclid || '').trim() || null;

      const challengeVal = sanitized.challenge || null;
      const fullNameVal = sanitized.full_name || null;
      const mobileVal = sanitized.mobile_number || null;
      const segmentVal = sanitized.trading_segment || null;
      const capitalVal = sanitized.trading_capital || null;

      const insertSql = `
        INSERT INTO leads (
          session_id, lead_reference, status, current_step,
          challenge, full_name, mobile_number, trading_segment, trading_capital,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
          ip_address, user_agent, created_at, updated_at
        ) VALUES (
          $1, $2, 'partial', $3,
          $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, NOW(), NOW()
        )
        RETURNING session_id, lead_reference, status, current_step
      `;

      const insertRes = await query(insertSql, [
        sessionId, leadRef, stepNum,
        challengeVal, fullNameVal, mobileVal, segmentVal, capitalVal,
        utmSource, utmMedium, utmCampaign, utmContent, utmTerm, fbclid,
        ipAddress, userAgent
      ]);

      const lead = insertRes.rows[0];
      return sendJson(res, 200, {
        success: true,
        lead_reference: lead.lead_reference,
        current_step: lead.current_step,
        status: lead.status
      });
    } else {
      // Subsequent Save (UPDATE existing record)
      const existing = checkRes.rows[0];

      if (stepNum === 1) {
        const utmSource = (body.utm_source || '').trim() || null;
        const utmMedium = (body.utm_medium || '').trim() || null;
        const utmCampaign = (body.utm_campaign || '').trim() || null;
        const utmContent = (body.utm_content || '').trim() || null;
        const utmTerm = (body.utm_term || '').trim() || null;
        const fbclid = (body.fbclid || '').trim() || null;

        const updateSql = `
          UPDATE leads SET
            challenge = $1,
            current_step = GREATEST(current_step, 1),
            utm_source = COALESCE($2, utm_source),
            utm_medium = COALESCE($3, utm_medium),
            utm_campaign = COALESCE($4, utm_campaign),
            utm_content = COALESCE($5, utm_content),
            utm_term = COALESCE($6, utm_term),
            fbclid = COALESCE($7, fbclid),
            updated_at = NOW()
          WHERE session_id = $8
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.challenge,
          utmSource, utmMedium, utmCampaign, utmContent, utmTerm, fbclid,
          sessionId
        ]);
        const lead = updateRes.rows[0];
        return sendJson(res, 200, {
          success: true,
          lead_reference: lead.lead_reference,
          current_step: lead.current_step,
          status: lead.status
        });
      } else if (stepNum === 2) {
        const updateSql = `
          UPDATE leads SET
            full_name = $1,
            mobile_number = $2,
            current_step = GREATEST(current_step, 2),
            updated_at = NOW()
          WHERE session_id = $3
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.full_name,
          sanitized.mobile_number,
          sessionId
        ]);
        const lead = updateRes.rows[0];
        return sendJson(res, 200, {
          success: true,
          lead_reference: lead.lead_reference,
          current_step: lead.current_step,
          status: lead.status
        });
      } else if (stepNum === 3) {
        const updateSql = `
          UPDATE leads SET
            trading_segment = $1,
            current_step = GREATEST(current_step, 3),
            updated_at = NOW()
          WHERE session_id = $2
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.trading_segment,
          sessionId
        ]);
        const lead = updateRes.rows[0];
        return sendJson(res, 200, {
          success: true,
          lead_reference: lead.lead_reference,
          current_step: lead.current_step,
          status: lead.status
        });
      } else if (stepNum === 4) {
        const updateSql = `
          UPDATE leads SET
            trading_capital = $1,
            current_step = GREATEST(current_step, 4),
            updated_at = NOW()
          WHERE session_id = $2
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.trading_capital,
          sessionId
        ]);
        const lead = updateRes.rows[0];
        return sendJson(res, 200, {
          success: true,
          lead_reference: lead.lead_reference,
          current_step: lead.current_step,
          status: lead.status
        });
      }
    }
  } catch (err) {
    console.error('[API Error: /api/track-step]', err.message);
    return sendJson(res, 500, {
      success: false,
      message: 'Unable to save your progress. Please check your connection and try again.'
    });
  }
};
