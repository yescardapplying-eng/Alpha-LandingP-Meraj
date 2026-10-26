/**
 * ============================================================================
 * STOCK MARKET — INTEGRATION, DATABASE & SECURITY TEST SUITE
 * Uses pg-mem to run real PostgreSQL engine with schema.sql
 * ============================================================================
 */

const { newDb } = require('pg-mem');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function runTestSuite() {
  console.log('============================================================');
  console.log('STOCK MARKET: VERIFICATION & TEST SUITE');
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
  // TEST B: COMPLETE USER JOURNEY (ALL 5 STEPS PROGRESSIVE -> COMPLETED)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST B: COMPLETE USER JOURNEY ---');
  const sessionB = 'AT-SESSION-USERBBB2';

  // Step 1: Challenge
  const resB1 = await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 1,
    challenge: 'Wrong position sizing',
    utm_source: 'instagram',
    utm_medium: 'reel_ad',
    utm_campaign: 'risk_management'
  });
  assert(resB1.status === 200, 'User B Step 1 saved');
  const leadRefB = resB1.body.lead_reference;

  let rowsB = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionB])).rows;
  assert(rowsB.length === 1, 'User B: Exactly 1 record inserted after Step 1');
  assert(rowsB[0].status === 'partial', 'User B: Status is partial after Step 1');
  assert(rowsB[0].current_step === 1, 'User B: current_step is 1');

  // Step 2: Contact
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 2,
    full_name: 'Ananya Deshmukh',
    mobile_number: '8689921644'
  });
  rowsB = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionB])).rows;
  assert(rowsB.length === 1, 'User B: Still 1 record after Step 2');
  assert(rowsB[0].current_step === 2, 'User B: current_step is 2');
  assert(rowsB[0].status === 'partial', 'User B: Status remains partial after Step 2');

  // Step 3: Segment
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 3,
    trading_segment: 'Futures'
  });
  rowsB = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionB])).rows;
  assert(rowsB.length === 1, 'User B: Still 1 record after Step 3');
  assert(rowsB[0].current_step === 3, 'User B: current_step is 3');
  assert(rowsB[0].status === 'partial', 'User B: Status remains partial after Step 3');

  // Step 4: Capital
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 4,
    trading_capital: '1 Lakh–2 Lakh'
  });
  rowsB = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionB])).rows;
  assert(rowsB.length === 1, 'User B: Still 1 record after Step 4');
  assert(rowsB[0].current_step === 4, 'User B: current_step is 4');
  assert(rowsB[0].status === 'partial', 'User B: Status remains partial after Step 4');

  // Step 5: Save Step 5 progressively
  const resBStep5 = await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 5,
    whatsapp_number: '9123456789',
    state: 'Maharashtra'
  });
  assert(resBStep5.status === 200, 'User B: Step 5 saved progressively');
  rowsB = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionB])).rows;
  assert(rowsB.length === 1, 'User B: Still 1 record after Step 5 save');
  assert(rowsB[0].current_step === 5, 'User B: current_step is 5');
  assert(rowsB[0].status === 'partial', 'User B: Status remains partial before final submit');
  assert(rowsB[0].whatsapp_number === '9123456789', 'User B: whatsapp_number saved on step 5');
  assert(rowsB[0].state === 'Maharashtra', 'User B: state saved on step 5');

  // Then Final Submission: submit-lead
  const resBSubmit = await callApi(submitLeadHandler, 'POST', {
    session_id: sessionB,
    whatsapp_number: '9123456789',
    state: 'Maharashtra'
  });

  assert(resBSubmit.status === 200 && resBSubmit.body.success === true, 'Submit lead returns HTTP 200');
  assert(resBSubmit.body.status === 'completed', 'Submit response status is completed');

  // Verify DB after Final Submit
  rowsB = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionB])).rows;
  assert(rowsB.length === 1, 'User B: Still exactly ONE record after final submit');
  assert(rowsB[0].status === 'completed', 'User B: DB status updated to completed');
  assert(rowsB[0].current_step === 5, 'User B: DB current_step is 5');
  assert(rowsB[0].completed_at !== null, 'User B: completed_at timestamp recorded');
  assert(rowsB[0].lead_reference === leadRefB, 'User B: lead_reference remained identical');
  assert(rowsB[0].whatsapp_number === '9123456789', 'User B: whatsapp_number is separate');
  assert(rowsB[0].mobile_number === '8689921644', 'User B: mobile_number remains distinct');
  assert(rowsB[0].state === 'Maharashtra', 'User B: state recorded');
  assert(rowsB[0].trading_capital === '1 Lakh–2 Lakh', 'User B: trading_capital recorded');

  // --------------------------------------------------------------------------
  // TEST C: DUPLICATE PROTECTION, RETRIES & COMPLETED SESSION LOCKING
  // --------------------------------------------------------------------------
  console.log('\n--- TEST C: DUPLICATE PROTECTION & COMPLETED SESSION LOCKING ---');
  // 1. Duplicate call to Step 1 for in-progress sessionA
  const resADup = await callApi(trackStepHandler, 'POST', {
    session_id: sessionA,
    step: 1,
    challenge: 'Frequent stop-loss hits'
  });
  assert(resADup.status === 200, 'Duplicate request on in-progress session handled gracefully');
  const countA = (await client.query('SELECT COUNT(*) as cnt FROM leads WHERE session_id = $1', [sessionA])).rows[0].cnt;
  assert(parseInt(countA, 10) === 1, 'Database count for sessionA is still 1 (No duplicate records)');

  // 2. Completed session B cannot be modified by track-step
  const resBMod = await callApi(trackStepHandler, 'POST', {
    session_id: sessionB,
    step: 1,
    challenge: 'Emotional decision-making'
  });
  assert(resBMod.status === 409, 'Attempt to modify completed session via track-step returns HTTP 409 Conflict');
  assert(resBMod.body.success === false, 'Modification of completed lead rejected');

  // 3. Completed session B idempotent final-submit retry (matching Step 5 data) returns 200 OK
  const resBRetrySame = await callApi(submitLeadHandler, 'POST', {
    session_id: sessionB,
    whatsapp_number: '9123456789',
    state: 'Maharashtra'
  });
  assert(resBRetrySame.status === 200 && resBRetrySame.body.success === true, 'Idempotent final-submit retry returns HTTP 200 with lead reference');
  assert(resBRetrySame.body.status === 'completed', 'Idempotent retry confirms completed status');

  // 4. Completed session B cannot be altered with different Step 5 data (returns 409 Conflict)
  const resBAlter = await callApi(submitLeadHandler, 'POST', {
    session_id: sessionB,
    whatsapp_number: '9888888888',
    state: 'Karnataka'
  });
  assert(resBAlter.status === 409, 'Attempting to alter completed lead data returns HTTP 409 Conflict');

  // 5. Incomplete lead cannot be marked completed
  const sessionInc = 'SM-SESSION-INCOMP01';
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionInc,
    step: 1,
    challenge: 'Frequent stop-loss hits'
  });
  const resIncSubmit = await callApi(submitLeadHandler, 'POST', {
    session_id: sessionInc,
    whatsapp_number: '9876543210',
    state: 'Maharashtra'
  });
  assert(resIncSubmit.status === 400 && resIncSubmit.body.success === false, 'Final submit rejected with 400 when earlier steps are missing');
  assert(resIncSubmit.body.message.includes('Incomplete questionnaire'), 'Meaningful message explaining missing steps');
  const rowInc = (await client.query('SELECT status, completed_at FROM leads WHERE session_id = $1', [sessionInc])).rows[0];
  assert(rowInc.status === 'partial', 'Incomplete lead remains status = partial in database');
  assert(rowInc.completed_at === null, 'Incomplete lead completed_at remains NULL');

  // 6. Safe handling of non-string inputs (does not crash with 500 TypeError)
  const resNumSession = await callApi(trackStepHandler, 'POST', {
    session_id: 12345678,
    step: 1,
    challenge: 'Frequent stop-loss hits'
  });
  assert(resNumSession.status === 400 && resNumSession.body.success === false, 'Number session_id returns HTTP 400 instead of 500 TypeError');

  const resObjSession = await callApi(submitLeadHandler, 'POST', {
    session_id: { evil: 'nested_object' },
    whatsapp_number: '9876543210',
    state: 'Maharashtra'
  });
  assert(resObjSession.status === 400 && resObjSession.body.success === false, 'Object session_id returns HTTP 400 instead of 500 TypeError');

  const resArrayBody = await callApi(trackStepHandler, 'POST', [1, 2, 3]);
  assert(resArrayBody.status === 400, 'Array body payload returns HTTP 400 Bad Request');

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

  // --------------------------------------------------------------------------
  // TEST G: EXPLICIT ABANDONMENT AT STEP 1, STEP 2, AND STEP 4
  // --------------------------------------------------------------------------
  console.log('\n--- TEST G: ABANDONMENT AT STEP 1, STEP 2, AND STEP 4 ---');
  // 1. Abandon after Step 1
  const sessionC = 'AT-SESSION-ABANDN01';
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionC,
    step: 1,
    challenge: 'No proper exit plan'
  });
  const rowsC = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionC])).rows;
  assert(rowsC.length === 1, 'Abandon Step 1: Exactly 1 record');
  assert(rowsC[0].status === 'partial', 'Abandon Step 1: status is partial');
  assert(rowsC[0].current_step === 1, 'Abandon Step 1: current_step is 1');
  assert(rowsC[0].challenge === 'No proper exit plan', 'Abandon Step 1: challenge saved');
  assert(rowsC[0].full_name === null, 'Abandon Step 1: full_name is NULL');
  assert(rowsC[0].completed_at === null, 'Abandon Step 1: completed_at is NULL');

  // 2. Abandon after Step 2
  const sessionD = 'AT-SESSION-ABANDN02';
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionD,
    step: 1,
    challenge: 'Emotional decision-making'
  });
  await callApi(trackStepHandler, 'POST', {
    session_id: sessionD,
    step: 2,
    full_name: 'Pooja Hegde',
    mobile_number: '9820012345'
  });
  const rowsD = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionD])).rows;
  assert(rowsD.length === 1, 'Abandon Step 2: Exactly 1 record');
  assert(rowsD[0].status === 'partial', 'Abandon Step 2: status is partial');
  assert(rowsD[0].current_step === 2, 'Abandon Step 2: current_step is 2');
  assert(rowsD[0].full_name === 'Pooja Hegde', 'Abandon Step 2: full_name saved');
  assert(rowsD[0].mobile_number === '9820012345', 'Abandon Step 2: mobile_number saved');
  assert(rowsD[0].trading_segment === null, 'Abandon Step 2: trading_segment is NULL');

  // 3. Abandon after Step 4
  const sessionE = 'AT-SESSION-ABANDN04';
  await callApi(trackStepHandler, 'POST', { session_id: sessionE, step: 1, challenge: 'Frequent stop-loss hits' });
  await callApi(trackStepHandler, 'POST', { session_id: sessionE, step: 2, full_name: 'Karan Mehra', mobile_number: '9711223344' });
  await callApi(trackStepHandler, 'POST', { session_id: sessionE, step: 3, trading_segment: 'Equity' });
  await callApi(trackStepHandler, 'POST', { session_id: sessionE, step: 4, trading_capital: '2 Lakh+' });
  const rowsE = (await client.query('SELECT * FROM leads WHERE session_id = $1', [sessionE])).rows;
  assert(rowsE.length === 1, 'Abandon Step 4: Exactly 1 record');
  assert(rowsE[0].status === 'partial', 'Abandon Step 4: status is partial');
  assert(rowsE[0].current_step === 4, 'Abandon Step 4: current_step is 4');
  assert(rowsE[0].trading_capital === '2 Lakh+', 'Abandon Step 4: capital saved');
  assert(rowsE[0].whatsapp_number === null, 'Abandon Step 4: whatsapp is NULL');
  assert(rowsE[0].state === null, 'Abandon Step 4: state is NULL');
  assert(rowsE[0].completed_at === null, 'Abandon Step 4: completed_at is NULL');

  // --------------------------------------------------------------------------
  // TEST H: BRAND AUDIT (PUBLIC-FACING "STOCK MARKET" REPLACEMENT)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST H: BRAND AUDIT ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, 'assets/js/app.js'), 'utf8');
  const styleCss = fs.readFileSync(path.join(__dirname, 'assets/css/style.css'), 'utf8');

  assert(!/Alpha\s*Traders?/i.test(indexHtml), 'index.html contains NO public-facing "Alpha Trader(s)"');
  assert(indexHtml.includes('STOCK MARKET') && indexHtml.includes('Stock Market — Trader Qualification'), 'index.html contains "Stock Market" branding');
  assert(!/Alpha\s*Traders?/i.test(styleCss), 'style.css contains NO "Alpha Trader(s)" references');
  assert(windowCheck(appJs), 'app.js contains window.StockMarketApp');

  function windowCheck(content) {
    return content.includes('window.StockMarketApp');
  }

  // --------------------------------------------------------------------------
  // TEST I: FOOTER REQUIREMENTS AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- TEST I: FOOTER REQUIREMENTS AUDIT ---');
  assert(indexHtml.includes('Copyright © 2026 Stock Market. All rights reserved.'), 'Footer contains exact 2026 copyright text');
  assert(!indexHtml.includes('Trading in derivatives and capital markets'), 'Unwanted trading disclaimer is completely removed from footer');
  assert(!indexHtml.includes('Noor Web'), 'Noor Web agency credit is not displayed');

  // --------------------------------------------------------------------------
  // TEST J: WHATSAPP AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- TEST J: WHATSAPP AUDIT ---');
  assert(!indexHtml.includes('floatingWhatsAppBtn'), 'Floating WhatsApp button element removed from index.html');
  assert(!indexHtml.includes('btnReviewWhatsApp'), 'Review screen WhatsApp CTA button removed from index.html');
  assert(!indexHtml.includes('wa.me/'), 'No wa.me external chat links in index.html');
  assert(!styleCss.includes('floating-whatsapp'), 'No floating WhatsApp classes in style.css');
  assert(!styleCss.includes('btn-whatsapp-chat'), 'No btn-whatsapp-chat class in style.css');
  assert(!appJs.includes('WHATSAPP_CONFIG'), 'WHATSAPP_CONFIG removed from app.js');

  // --------------------------------------------------------------------------
  // TEST K: DATABASE FAILURE ERROR HANDLING
  // --------------------------------------------------------------------------
  console.log('\n--- TEST K: DATABASE FAILURE ERROR HANDLING ---');
  // Temporarily replace __TEST_DB__ with a failing database client
  global.__TEST_DB__ = {
    query: async () => {
      throw new Error('connection refused at ep-fail.neon.tech');
    }
  };

  const resDbFailTrack = await callApi(trackStepHandler, 'POST', {
    session_id: 'SM-SESSION-FAIL0001',
    step: 1,
    challenge: 'Frequent stop-loss hits'
  });
  assert(resDbFailTrack.status === 500, 'track-step returns HTTP 500 on DB failure');
  assert(resDbFailTrack.body.success === false, 'track-step does NOT falsely report success on DB error');
  assert(!JSON.stringify(resDbFailTrack.body).includes('password'), 'DB failure does not leak credentials');

  const resDbFailSubmit = await callApi(submitLeadHandler, 'POST', {
    session_id: 'SM-SESSION-FAIL0001',
    whatsapp_number: '9876543210',
    state: 'Maharashtra'
  });
  assert(resDbFailSubmit.status === 500, 'submit-lead returns HTTP 500 on DB failure');
  assert(resDbFailSubmit.body.success === false, 'submit-lead does NOT falsely report success on DB error');

  // Restore client
  global.__TEST_DB__ = client;

  // --------------------------------------------------------------------------
  // TEST L: LOCAL HTTP SERVER ROUTING & PRIVATE FILE SECURITY (DYNAMIC PORT 0)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST L: LOCAL HTTP SERVER & ROUTING ---');
  const { startServer } = require('./server');
  const { server: localServer, port: serverPort } = await startServer(0);

  function makeLocalRequest(method, reqPath, reqBody) {
    return new Promise((resolve) => {
      const bodyStr = reqBody ? (typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)) : null;
      const headers = { 'Content-Type': 'application/json' };
      if (bodyStr) {
        headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }
      const opts = {
        hostname: '127.0.0.1',
        port: serverPort,
        path: reqPath,
        method: method,
        headers: headers
      };

      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });

      req.on('error', (err) => resolve({ status: 500, error: err.message }));
      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  try {
    // 1. GET / returns 200 and index.html
    const resHome = await makeLocalRequest('GET', '/');
    assert(resHome.status === 200, 'GET / returns HTTP 200');
    assert(typeof resHome.body === 'string' && resHome.body.includes('STOCK MARKET'), 'GET / delivers index.html with STOCK MARKET');

    // 2. GET CSS & JS
    const resCss = await makeLocalRequest('GET', '/assets/css/style.css');
    assert(resCss.status === 200 && resCss.headers['content-type'].includes('text/css'), 'GET /assets/css/style.css returns HTTP 200 text/css');

    const resJs = await makeLocalRequest('GET', '/assets/js/app.js');
    assert(resJs.status === 200 && resJs.headers['content-type'].includes('javascript'), 'GET /assets/js/app.js returns HTTP 200 application/javascript');

    // 3. Block private / environment files
    const resEnv = await makeLocalRequest('GET', '/.env');
    assert(resEnv.status === 404, 'GET /.env is safely blocked (HTTP 404)');

    const resPkg = await makeLocalRequest('GET', '/package.json');
    assert(resPkg.status === 404, 'GET /package.json is safely blocked (HTTP 404)');

    // 4. Unknown /api/* path returns JSON 404
    const resApi404 = await makeLocalRequest('GET', '/api/nonexistent-endpoint');
    assert(resApi404.status === 404 && resApi404.body.success === false, 'GET /api/nonexistent-endpoint returns JSON 404');

    // 5. POST /api/track-step through local server HTTP
    const resHttpTrack = await makeLocalRequest('POST', '/api/track-step', {
      session_id: 'SM-SESSION-HTTP0001',
      step: 1,
      challenge: 'Emotional decision-making'
    });
    assert(resHttpTrack.status === 200 && resHttpTrack.body.success === true, 'POST /api/track-step over HTTP returns 200 success');

    // 6. Unsupported HTTP method returns 405
    const resMethod405 = await makeLocalRequest('PUT', '/api/track-step', {});
    assert(resMethod405.status === 405, 'PUT /api/track-step returns HTTP 405 Method Not Allowed');

    // 7. Traversal and encoded path attempts blocked
    const resTraversal = await makeLocalRequest('GET', '/%2e%2e/package.json');
    assert(resTraversal.status === 404 || resTraversal.status === 403, 'Encoded directory traversal attempt safely blocked');
  } finally {
    // Close local server cleanly
    localServer.close();
  }

  // --------------------------------------------------------------------------
  // TEST M: VERCEL DEPLOYMENT CONFIGURATION AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- TEST M: VERCEL DEPLOYMENT CONFIGURATION ---');
  const vercelJsonPath = path.join(__dirname, 'vercel.json');
  assert(fs.existsSync(vercelJsonPath), 'vercel.json exists in root');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  assert(vercelConfig.cleanUrls === true, 'vercel.json has cleanUrls configured');
  assert(fs.existsSync(path.join(__dirname, 'api/track-step.js')), 'api/track-step.js exists for Vercel functions');
  assert(fs.existsSync(path.join(__dirname, 'api/submit-lead.js')), 'api/submit-lead.js exists for Vercel functions');

  // --------------------------------------------------------------------------
  // TEST N: PRIVACY POLICY & ACCESSIBILITY AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- TEST N: PRIVACY POLICY & UI AUDIT ---');
  const freshIndex = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const freshApp = fs.readFileSync(path.join(__dirname, 'assets/js/app.js'), 'utf8');

  assert(freshIndex.includes('id="privacyModal"'), 'index.html contains #privacyModal dialog');
  assert(freshIndex.includes('id="btnPrivacyPolicy"'), 'index.html contains #btnPrivacyPolicy button');
  assert(freshIndex.includes('id="btnRestart"'), 'index.html contains #btnRestart button for fresh questionnaire');
  assert(freshIndex.includes('Privacy Notice &amp; Policy') || freshIndex.includes('Privacy Notice & Policy'), 'index.html contains Privacy Notice title');
  assert(freshIndex.includes('role="dialog"') && freshIndex.includes('aria-modal="true"'), 'privacyModal is an accessible modal dialog');
  assert(freshApp.includes('restartQuestionnaire'), 'app.js implements restartQuestionnaire');
  assert(freshApp.includes('stock_market_completed_session'), 'app.js tracks completed session to prevent reuse');

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
