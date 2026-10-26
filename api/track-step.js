/**
 * ============================================================================
 * STOCK MARKET — PROGRESSIVE STEP TRACKING API
 * Endpoint: POST /api/track-step
 * ============================================================================
 */

const { query } = require('../lib/db');
const { safeString, isValidSessionId, validateStepPayload } = require('../lib/validation');
const { generateLeadReference, getClientIp, getUserAgent, parseRequestBody, sendJson } = require('../lib/helpers');

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

    const stepNum = parseInt(body.step || body.current_step || body.currentStep, 10);
    if (isNaN(stepNum) || stepNum < 1 || stepNum > 5) {
      return sendJson(res, 400, { success: false, message: 'Invalid questionnaire step (Steps 1-5 allowed).' });
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
      const utmSource = safeString(body.utm_source) || null;
      const utmMedium = safeString(body.utm_medium) || null;
      const utmCampaign = safeString(body.utm_campaign) || null;
      const utmContent = safeString(body.utm_content) || null;
      const utmTerm = safeString(body.utm_term) || null;
      const fbclid = safeString(body.fbclid) || null;

      const challengeVal = sanitized.challenge || null;
      const fullNameVal = sanitized.full_name || null;
      const mobileVal = sanitized.mobile_number || null;
      const segmentVal = sanitized.trading_segment || null;
      const capitalVal = sanitized.trading_capital || null;
      const whatsappVal = sanitized.whatsapp_number || null;
      const stateVal = sanitized.state || null;

      const insertSql = `
        INSERT INTO leads (
          session_id, lead_reference, status, current_step,
          challenge, full_name, mobile_number, trading_segment, trading_capital,
          whatsapp_number, state,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
          ip_address, user_agent, created_at, updated_at
        ) VALUES (
          $1, $2, 'partial', $3,
          $4, $5, $6, $7, $8,
          $9, $10,
          $11, $12, $13, $14, $15, $16,
          $17, $18, NOW(), NOW()
        )
        RETURNING session_id, lead_reference, status, current_step
      `;

      const insertRes = await query(insertSql, [
        sessionId, leadRef, stepNum,
        challengeVal, fullNameVal, mobileVal, segmentVal, capitalVal,
        whatsappVal, stateVal,
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

      // Enforce immutability of completed sessions
      if (existing.status === 'completed') {
        return sendJson(res, 409, {
          success: false,
          message: 'This questionnaire session has already been completed and cannot be modified.'
        });
      }

      if (stepNum === 1) {
        const utmSource = safeString(body.utm_source) || null;
        const utmMedium = safeString(body.utm_medium) || null;
        const utmCampaign = safeString(body.utm_campaign) || null;
        const utmContent = safeString(body.utm_content) || null;
        const utmTerm = safeString(body.utm_term) || null;
        const fbclid = safeString(body.fbclid) || null;

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
          WHERE session_id = $8 AND status != 'completed'
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.challenge,
          utmSource, utmMedium, utmCampaign, utmContent, utmTerm, fbclid,
          sessionId
        ]);
        if (updateRes.rows.length === 0) {
          return sendJson(res, 409, {
            success: false,
            message: 'This questionnaire session has already been completed and cannot be modified.'
          });
        }
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
          WHERE session_id = $3 AND status != 'completed'
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.full_name,
          sanitized.mobile_number,
          sessionId
        ]);
        if (updateRes.rows.length === 0) {
          return sendJson(res, 409, {
            success: false,
            message: 'This questionnaire session has already been completed and cannot be modified.'
          });
        }
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
          WHERE session_id = $2 AND status != 'completed'
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.trading_segment,
          sessionId
        ]);
        if (updateRes.rows.length === 0) {
          return sendJson(res, 409, {
            success: false,
            message: 'This questionnaire session has already been completed and cannot be modified.'
          });
        }
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
          WHERE session_id = $2 AND status != 'completed'
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.trading_capital,
          sessionId
        ]);
        if (updateRes.rows.length === 0) {
          return sendJson(res, 409, {
            success: false,
            message: 'This questionnaire session has already been completed and cannot be modified.'
          });
        }
        const lead = updateRes.rows[0];
        return sendJson(res, 200, {
          success: true,
          lead_reference: lead.lead_reference,
          current_step: lead.current_step,
          status: lead.status
        });
      } else if (stepNum === 5) {
        const updateSql = `
          UPDATE leads SET
            whatsapp_number = $1,
            state = $2,
            current_step = GREATEST(current_step, 5),
            updated_at = NOW()
          WHERE session_id = $3 AND status != 'completed'
          RETURNING session_id, lead_reference, status, current_step
        `;
        const updateRes = await query(updateSql, [
          sanitized.whatsapp_number,
          sanitized.state,
          sessionId
        ]);
        if (updateRes.rows.length === 0) {
          return sendJson(res, 409, {
            success: false,
            message: 'This questionnaire session has already been completed and cannot be modified.'
          });
        }
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
