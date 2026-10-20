// Public, non-secret settings. Telegram Cloud Serverless runtime cannot read
// process.env; configure these constants through a reviewed PR.
// Fail closed: without an owner ID the bot only responds to /id.
export const OWNER_TELEGRAM_ID = 0;
export const PUBLIC_MODE = false;

// Jamendo Client ID is an application identifier, not a secret.
// Register a client at https://devportal.jamendo.com/ to enable licensed downloads.
export const JAMENDO_CLIENT_ID = '';

export const REQUEST_COOLDOWN_SECONDS = 3;
export const MAX_IN_MEMORY_AUDIO_BYTES = 25 * 1024 * 1024;
