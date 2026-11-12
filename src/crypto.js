// RC4 + base64 for locked tab notes.
// RC4 is cryptographically weak, but adequate: it stops casual viewing of
// the sync file. Reversible with PIN. No crypto.subtle dependency — works
// on file:// origins where WebCrypto is unreliable.

const MARKER = '[KARUI]';
const ENC_PREFIX = '[enc]';

export function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function utf8Encode(s) { return new TextEncoder().encode(s); }
function utf8Decode(b) { return new TextDecoder().decode(b); }

function base64Encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function base64Decode(str) {
  const raw = atob(str);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function rc4(keyBytes, dataBytes) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) & 0xFF;
    const t = S[i]; S[i] = S[j]; S[j] = t;
  }
  let i = 0; j = 0;
  const out = new Uint8Array(dataBytes.length);
  for (let k = 0; k < dataBytes.length; k++) {
    i = (i + 1) & 0xFF;
    j = (j + S[i]) & 0xFF;
    const t = S[i]; S[i] = S[j]; S[j] = t;
    out[k] = dataBytes[k] ^ S[(S[i] + S[j]) & 0xFF];
  }
  return out;
}

export function deriveKeyBytes(pin, salt) {
  return utf8Encode(pin + ':' + salt);
}

export function encryptNoteFromKey(keyBytes, plaintext) {
  const marked = MARKER + plaintext;
  const enc = rc4(keyBytes, utf8Encode(marked));
  return ENC_PREFIX + base64Encode(enc);
}

export function decryptNoteFromKey(keyBytes, ciphertext) {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return null;
  try {
    const data = base64Decode(ciphertext.slice(ENC_PREFIX.length));
    const dec = rc4(keyBytes, data);
    const marked = utf8Decode(dec);
    if (!marked.startsWith(MARKER)) return null;
    return marked.slice(MARKER.length);
  } catch (e) { return null; }
}

export function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith(ENC_PREFIX);
}