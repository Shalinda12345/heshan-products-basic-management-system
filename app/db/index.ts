import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

// Prevent multiple connections in development hot-reloads
const globalForDb = globalThis as unknown as {
  conn: mysql.Pool | undefined;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Add it to a root .env.local or set the environment variable before starting Next.js.'
  );
}

function createPool(): mysql.Pool {
  const pool = mysql.createPool(connectionString as string);
  // Drizzle reads and writes TIMESTAMP columns as UTC, so each session must use UTC as well. Otherwise
  // values filled in by the database (DEFAULT CURRENT_TIMESTAMP) come back shifted by the server's offset.
  // TIMESTAMP is stored as UTC internally, so rows written before this setting read back correctly too.
  pool.on('connection', (conn) => {
    // mysql2 passes its callback-style connection here, despite the promise typings
    (conn as unknown as { query: (sql: string, callback: (error: unknown) => void) => void })
      .query("SET time_zone = '+00:00'", (error) => {
        if (error) console.error('Failed to set the database session time zone:', error);
      });
  });
  return pool;
}

const connection = globalForDb.conn ?? createPool();

if (process.env.NODE_ENV !== 'production') globalForDb.conn = connection;

export const db = drizzle(connection, {
  schema,
  mode: 'default',
});

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Either the database itself or an open transaction: code that writes "as part of" a larger change accepts both
export type DbExecutor = typeof db | DbTransaction;