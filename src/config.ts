import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.error('[Config] .env file not found. Copy .env.example to .env and fill in your values:');
  console.error('  cp .env.example .env');
  process.exit(1);
}

dotenv.config({ path: envPath });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`[Config] Missing required env var: ${key}`);
    process.exit(1);
  }
  return value;
}

export const config = {
  serverUrl: required('SERVER_URL'),
  accountId: required('ACCOUNT_ID'),
  slaveKey: required('SLAVE_KEY'),
  chromeDebugPort: parseInt(process.env.CHROME_DEBUG_PORT ?? '9222', 10),
};
