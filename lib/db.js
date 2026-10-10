/**
 * ============================================================================
 * ALPHA TRADERS — DATABASE CLIENT (NEON POSTGRESQL)
 * ============================================================================
 */

require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

let neonSql = null;

function getClient() {
  // Test / In-memory override
  if (global.__TEST_DB__) {
    return global.__TEST_DB__;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not configured.');
  }

  if (!neonSql) {
    neonSql = neon(databaseUrl);
  }
  return null;
}

/**
 * Execute parameterized SQL query
 * Returns { rows, rowCount }
 */
async function query(text, params = []) {
  // Handle in-memory / testing database
  if (global.__TEST_DB__) {
    const res = await global.__TEST_DB__.query(text, params);
    return {
      rows: res.rows || [],
      rowCount: (res.rows || []).length
    };
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing. Please set DATABASE_URL in your Vercel project settings or .env file.');
  }

  if (!neonSql) {
    neonSql = neon(databaseUrl);
  }

  // Execute parameterized query via Neon HTTP driver
  const result = await neonSql.query(text, params);
  const rows = Array.isArray(result) ? result : (result.rows || []);
  return {
    rows,
    rowCount: rows.length
  };
}

module.exports = {
  query
};
