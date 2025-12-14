import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const keyLength = 32;
const ivLength = 16;
const saltLength = 64;
const tagLength = 16;

// Generate encryption key from environment variable or generate one
const getEncryptionKey = () => {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, 'hex');
  }
  // Generate a key if not set (for development)
  // In production, set ENCRYPTION_KEY in .env
  return crypto.randomBytes(keyLength);
};

const encryptionKey = getEncryptionKey();

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

    // Check if already decrypted (for backward compatibility)
    if (!encryptedText.includes(':')) {
      return encryptedText;
    }

    // Parse encrypted format: salt:iv:tag:encrypted
    const parts = encryptedText.split(':');
    if (parts.length !== 4) {
      // If format is wrong, return as is (might be old unencrypted message)
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
    // Return encrypted text if decryption fails (for security)
    return '[Encrypted message - decryption failed]';
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

