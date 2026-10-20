// Executed on a CI runner, not inside Telegram Cloud.
// The generated module is gitignored and uploaded directly with tgcloud push.
import { writeFileSync } from 'node:fs';

const token = (process.env.YANDEX_OAUTH_TOKEN || '').trim();
if (token && !/^[A-Za-z0-9._~+-]{10,4096}$/.test(token)) {
  throw new Error('YANDEX_OAUTH_TOKEN contains an invalid character or length.');
}
const output = new URL('../tgcloud/lib/runtime-secrets.js', import.meta.url);
writeFileSync(output,
  '// Generated for serverless deployment. NEVER COMMIT.\n' +
  'export const YANDEX_OAUTH_TOKEN = ' + JSON.stringify(token) + ';\n',
  { mode: 0o600 });
console.log('Runtime configuration generated (Yandex OAuth ' +
  (token ? 'configured' : 'not configured') + ').');
