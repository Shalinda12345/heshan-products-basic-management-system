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

const connection = globalForDb.conn ?? mysql.createPool(connectionString as string);

if (process.env.NODE_ENV !== 'production') globalForDb.conn = connection;

export const db = drizzle(connection, {
  schema,
  mode: 'default',
});