/**
 * ============================================================================
 * ALPHA TRADERS — PHASE 2 INTEGRATION & DATABASE TEST SUITE
 * Uses pg-mem to run real PostgreSQL engine with schema.sql
 * ============================================================================
 */

const { newDb } = require('pg-mem');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
  console.log('============================================================');
  console.log('ALPHA TRADERS PHASE 2: VERIFICATION & TEST SUITE');
  console.log('============================================================\n');

  // 1. Initialize PostgreSQL in-memory database with actual schema.sql
  const db = newDb();

  // Register GREATEST function if not built-in in pg-mem
  db.public.registerFunction({
    name: 'greatest',
    args: [db.public.getType('integer'), db.public.getType('integer')],
    returns: db.public.getType('integer'),
    implementation: (a, b) => Math.max(a, b)
  });

  const schemaSql = fs.readFileSync(path.join(__dirname, 'database/schema.sql'), 'utf8');
  db.public.none(schemaSql);

  // Set global test DB so lib/db.js routes queries to it
  const { Pool } = db.adapters.createPg();
  const client = new Pool();
  global.__TEST_DB__ = client;

  const trackStepHandler = require('./api/track-step');
  const submitLeadHandler = require('./api/submit-lead');

  // Helper to simulate Vercel / Node serverless HTTP call
  async function callApi(handler, method, body, headers = {}) {
    return new Promise((resolve) => {
      const req = {
        method,
        headers: Object.assign({ 'user-agent': 'TestRunner/1.0', 'x-forwarded-for': '122.161.48.10' }, headers),
        body
      };

      let statusCode = 200;
      let responseHeaders = {};
      let responseBody = '';

      const res = {
        writeHead: (code, hdrs) => {
          statusCode = code;
          if (hdrs) responseHeaders = hdrs;
        },
        status: (code) => {
          statusCode = code;
          return res;
        },
        json: (data) => {
          responseBody = data;
          resolve({ status: statusCode, body: data, headers: responseHeaders });
        },
        end: (data) => {
          if (data) {
            try {
              responseBody = JSON.parse(data);
            } catch (e) {
              responseBody = data;
            }
          }
          resolve({ status: statusCode, body: responseBody, headers: responseHeaders });
        }
      };

      handler(req, res).catch(err => {
        resolve({ status: 500, body: { success: false, message: err.message } });
      });
    });
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST A: PARTIAL USER JOURNEY & ABANDONMENT
  // --------------------------------------------------------------------------
  console.log('--- TEST A: PARTIAL USER JOURNEY & ABANDONMENT ---');
  const sessionA = 'AT-SESSION-USERAAA1';

  // Step 1: Challenge
  const resA1 = await callApi(trackStepHandler, 'POST', {
    session_id: sessionA,
    step: 1,
    challenge: 'Frequent stop-loss hits',
    utm_source: 'meta_ads',
    utm_campaign: 'scalping_strategy_q4'
  });

  assert(resA1.status === 200 && resA1.body.success === true, 'Step 1 returns HTTP 200 success');
  const leadRefA = resA1.body.lead_reference;
  assert(leadRefA && leadRefA.startsWith('AT-'), `Generated lead_reference: ${leadRefA}`);

  // Verify DB after Step 1
  let rowsA = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionA])).rows;
  assert(rowsA.length === 1, 'Exactly ONE database record created');
  assert(rowsA[0].status === 'partial', 'Record status is partial');
  assert(rowsA[0].current_step === 1, 'Record current_step is 1');
  assert(rowsA[0].challenge === 'Frequent stop-loss hits', 'Challenge is saved');
  assert(rowsA[0].utm_source === 'meta_ads', 'UTM source is preserved');
  assert(rowsA[0].full_name === null, 'full_name is NULL after Step 1');

  // Step 2: Contact Details
  const resA2 = await callApi(trackStepHandler, 'POST', {
    session_id: sessionA,
    step: 2,
    full_name: 'Vikram Malhotra',
    mobile_number: '+91 98765 43210'
  });

  assert(resA2.status === 200 && resA2.body.success === true, 'Step 2 returns HTTP 200 success');

  // Verify DB after Step 2 (MUST BE SAME RECORD)
  rowsA = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionA])).rows;
  assert(rowsA.length === 1, 'Still exactly ONE record (NO duplicate row)');
  assert(rowsA[0].lead_reference === leadRefA, 'lead_reference unchanged');
  assert(rowsA[0].current_step === 2, 'current_step advanced to 2');
  assert(rowsA[0].full_name === 'Vikram Malhotra', 'full_name updated');
  assert(rowsA[0].mobile_number === '9876543210', 'mobile_number normalized to 10 digits');
  assert(rowsA[0].challenge === 'Frequent stop-loss hits', 'Step 1 challenge preserved');

  // Step 3: Segment
  const resA3 = await callApi(trackStepHandler, 'POST', {
    session_id: sessionA,
    step: 3,
    trading_segment: 'Options'
  });

  assert(resA3.status === 200 && resA3.body.success === true, 'Step 3 returns HTTP 200 success');

  // Verify DB after Step 3
  rowsA = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionA])).rows;
  assert(rowsA.length === 1, 'Still exactly ONE record');
  assert(rowsA[0].current_step === 3, 'current_step advanced to 3');
  assert(rowsA[0].trading_segment === 'Options', 'trading_segment saved');

  // User closes browser! (No Step 4 or Step 5)
  // Verify abandoned partial lead data remains intact
  rowsA = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionA])).rows;
  assert(rowsA[0].status === 'partial', 'Abandoned user remains status = partial');
  assert(rowsA[0].current_step === 3, 'Furthest completed step remains 3');
  assert(rowsA[0].completed_at === null, 'completed_at is NULL');
  assert(rowsA[0].full_name === 'Vikram Malhotra', 'Contact name retained for sales desk');
  assert(rowsA[0].mobile_number === '9876543210', 'Mobile retained for partial follow-up');

  // --------------------------------------------------------------------------
  // TEST B: COMPLETE USER JOURNEY (ALL 5 STEPS -> COMPLETED)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST B: COMPLETE USER JOURNEY ---');
  const sessionB = 'AT-SESSION-USERBBB2';

  await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 1,
    challenge: 'Wrong position sizing',
    utm_source: 'instagram',
    utm_medium: 'reel_ad',
    utm_campaign: 'risk_management'
  });

  await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 2,
    full_name: 'Ananya Deshmukh',
    mobile_number: '8689921644'
  });

  await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 3,
    trading_segment: 'Futures'
  });

  await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 4,
    trading_capital: '1 Lakh–2 Lakh'
  });

  // Step 5: Final Submission
  const resB5 = await callApi(submitLeadHandler, 'POST', {
    session_id: sessionB,
    whatsapp_number: '9123456789',
    state: 'Maharashtra'
  });

  assert(resB5.status === 200 && resB5.body.success === true, 'Submit lead returns HTTP 200');
  assert(resB5.body.status === 'completed', 'Submit response status is completed');

  // Verify DB for Complete User
  const rowsB = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionB])).rows;
  assert(rowsB.length === 1, 'Exactly ONE record for completed user');
  assert(rowsB[0].status === 'completed', 'DB status updated to completed');
  assert(rowsB[0].current_step === 5, 'DB current_step is 5');
  assert(rowsB[0].completed_at !== null, 'completed_at timestamp recorded');
  assert(rowsB[0].whatsapp_number === '9123456789', 'whatsapp_number is separate');
  assert(rowsB[0].mobile_number === '8689921644', 'mobile_number remains distinct');
  assert(rowsB[0].state === 'Maharashtra', 'state recorded');
  assert(rowsB[0].trading_capital === '1 Lakh–2 Lakh', 'trading_capital recorded');

  // --------------------------------------------------------------------------
  // TEST C: DUPLICATE PROTECTION & RETRIES
  // --------------------------------------------------------------------------
  console.log('\n--- TEST C: DUPLICATE PROTECTION & RETRIES ---');
  // Duplicate call to Step 1 for sessionB
  const resBDup = await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 1,
    challenge: 'Emotional decision-making'
  });

  assert(resBDup.status === 200, 'Duplicate request handled gracefully');
  const countB = (await client.query('SELECT COUNT(*) as cnt FROM leads WHERE session_id = $1', [sessionB])).rows[0].cnt;
  assert(parseInt(countB, 10) === 1, 'Database count is still 1 (No duplicate records)');

  // --------------------------------------------------------------------------
  // TEST D: BACK NAVIGATION STEP INTEGRITY
  // --------------------------------------------------------------------------
  console.log('\n--- TEST D: BACK NAVIGATION STEP INTEGRITY ---');
  // User on Step 3 goes Back to Step 1 on sessionA and changes challenge
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionA,
    step: 1,
    challenge: 'Emotional decision-making'
  });

  const rowsABack = (await client.query('SELECT current_step, challenge FROM leads WHERE session_id = $1', [sessionA])).rows;
  assert(rowsABack[0].challenge === 'Emotional decision-making', 'Challenge updated');
  assert(rowsABack[0].current_step === 3, 'current_step NOT reverted to 1 (stays 3)');

  // --------------------------------------------------------------------------
  // TEST E: UTM ATTRIBUTION NON-OVERWRITE
  // --------------------------------------------------------------------------
  console.log('\n--- TEST E: UTM ATTRIBUTION PERSISTENCE ---');
  // Send Step 2 without UTM fields
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionA,
    step: 2,
    full_name: 'Vikram Malhotra',
    mobile_number: '9876543210'
  });

  const rowUtm = (await client.query('SELECT utm_source, utm_campaign FROM leads WHERE session_id = $1', [sessionA])).rows[0];
  assert(rowUtm.utm_source === 'meta_ads', 'Original utm_source preserved');
  assert(rowUtm.utm_campaign === 'scalping_strategy_q4', 'Original utm_campaign preserved');

  // --------------------------------------------------------------------------
  // TEST F: SERVER-SIDE VALIDATION FAILURES
  // --------------------------------------------------------------------------
  console.log('\n--- TEST F: SERVER-SIDE VALIDATION FAILURES ---');
  // Invalid challenge
  const resBad1 = await callApi(trackStepHandler, 'POST', {
    session_id: 'AT-SESSION-BADVAL1',
    step: 1,
    challenge: 'Get rich quick overnight'
  });
  assert(resBad1.status === 400 && resBad1.body.success === false, 'Rejects unauthorized challenge option');

  // Invalid mobile
  const resBad2 = await callApi(trackStepHandler, 'POST', {
    session_id: sessionA,
    step: 2,
    full_name: 'Amit',
    mobile_number: '12345'
  });
  assert(resBad2.status === 400 && resBad2.body.success === false, 'Rejects invalid 5-digit phone number');

  // Invalid state
  const resBadState = await callApi(submitLeadHandler, 'POST', {
    session_id: sessionA,
    whatsapp_number: '9876543210',
    state: 'California'
  });
  assert(resBadState.status === 400 && resBadState.body.success === false, 'Rejects non-Indian state');

  // Method not allowed
  const resGet = await callApi(trackStepHandler, 'GET', {});
  assert(resGet.status === 405, 'Rejects GET request with 405 Method Not Allowed');

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
