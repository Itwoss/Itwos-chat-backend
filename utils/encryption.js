import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const keyLength = 32;
const ivLength = 16;
const saltLength = 64;
const _tagLength = 16;

// Generate encryption key from environment variable or generate one
const getEncryptionKey = () => {
  const envKey = (process.env.ENCRYPTION_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (envKey && envKey.length === 64 && /^[a-f0-9]+$/i.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  // No valid key: use random key so server starts, but decryption will fail for
  // all messages (and a new random key on every restart breaks existing messages).
  console.warn(
    '[encryption] ENCRYPTION_KEY is missing or invalid (must be 64 hex characters, no quotes). ' +
    'Chat messages will show "[Encrypted message - decryption failed]". ' +
    'Add ENCRYPTION_KEY to your .env (e.g. run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")'
  );
  return crypto.randomBytes(keyLength);
};

const encryptionKey = getEncryptionKey();
const normalizedEnvKey = (process.env.ENCRYPTION_KEY || '').trim().replace(/^["']|["']$/g, '');
const isKeyValid = normalizedEnvKey.length === 64 && /^[a-f0-9]+$/i.test(normalizedEnvKey);

/** True if ENCRYPTION_KEY was loaded and used (so chat encrypt/decrypt works). */
export const isEncryptionKeyLoaded = isKeyValid;

if (isKeyValid) {
  console.log('[encryption] ENCRYPTION_KEY loaded successfully (chat encryption active).');
}

/**
 * Encrypt message content
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text (format: salt:iv:tag:encrypted)
 */
export const encryptMessage = (text) => {
  try {
    if (!text) return text;

    // Generate random salt and IV for each message
    const salt = crypto.randomBytes(saltLength);
    const iv = crypto.randomBytes(ivLength);

    // Derive key from master key and salt
    const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, keyLength, 'sha512');

    // Create cipher
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    // Encrypt
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const tag = cipher.getAuthTag();

    // Return format: salt:iv:tag:encrypted
    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
};

/**
 * Decrypt message content
 * @param {string} encryptedText - Encrypted text (format: salt:iv:tag:encrypted)
 * @returns {string} - Decrypted plain text
 */
export const decryptMessage = (encryptedText) => {
  try {
    if (!encryptedText) return encryptedText;

    // Check if already decrypted (for backward compatibility) — only if it looks like plain text
    if (!encryptedText.includes(':')) {
      // Don't return raw hex/ciphertext to client
      if (encryptedText.length > 32 && /^[a-f0-9]+$/i.test(encryptedText)) {
        return '[Message could not be decrypted]';
      }
      return encryptedText;
    }

    // Parse encrypted format: salt:iv:tag:encrypted
    const parts = encryptedText.split(':');
    if (parts.length !== 4) {
      // If format is wrong, don't send raw ciphertext to client
      if (encryptedText.length > 32 && /^[a-f0-9:]+$/i.test(encryptedText)) {
        return '[Message could not be decrypted]';
      }
      return encryptedText;
    }

    const [saltHex, ivHex, tagHex, encrypted] = parts;

    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    // Derive key from master key and salt
    const key = crypto.pbkdf2Sync(encryptionKey, salt, 100000, keyLength, 'sha512');

    // Create decipher
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(tag);

    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('DECRYPT_FAILED');
  }
};

/**
 * Check if text is encrypted
 * @param {string} text - Text to check
 * @returns {boolean} - True if encrypted
 */
export const isEncrypted = (text) => {
  if (!text) return false;
  return text.includes(':') && text.split(':').length === 4;
};

