/**
 * Database connection pool.
 * Owns: Pool singleton, connection string config.
 * Does NOT own: query logic, business entities — those live in db/<entity>.js.
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 30000,
});

pool.on('connect', client => {
  client.query('SET statement_timeout = 10000');
});

module.exports = pool;
