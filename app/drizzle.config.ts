import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load env variables for the CLI tool
dotenv.config({ path: '.env.local' });

const config: Config = {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'mysql2',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
};

export default config;