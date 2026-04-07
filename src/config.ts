import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
