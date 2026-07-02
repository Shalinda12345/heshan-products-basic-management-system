import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load env variables for the CLI tool
dotenv.config({ path: '.env.local' });

const config: Config = {
  schema: './app/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
};

export default config;