import path from 'path';
import { existsSync, readFileSync } from 'fs';

export function normalizeWhatsAppIdentifier(value) {
  return String(value || '')
    .trim()
    .replace(/:.*@/, '@')
    .replace(/@.*/, '')
    .replace(/^\+/, '');
}

export function parseAllowedUsers(rawValue) {
  return new Set(
    String(rawValue || '')
      .split(',')
      .map((value) => normalizeWhatsAppIdentifier(value))
      .filter(Boolean)
  );
}

function readMappingFile(sessionDir, identifier, suffix = '') {
  const filePath = path.join(sessionDir, `lid-mapping-${identifier}${suffix}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const normalized = normalizeWhatsAppIdentifier(parsed);
    return normalized || null;
  } catch {
    return null;
  }
}

export function expandWhatsAppIdentifiers(identifier, sessionDir) {
  const normalized = normalizeWhatsAppIdentifier(identifier);
  if (!normalized) {
    return new Set();
  }

  // Walk both phone->LID and LID->phone mapping files so allowlists can use
  // either form transparently in bot mode.
  const resolved = new Set();
  const queue = [normalized];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || resolved.has(current)) {
      continue;
    }

    resolved.add(current);

    for (const suffix of ['', '_reverse']) {
      const mapped = readMappingFile(sessionDir, current, suffix);
      if (mapped && !resolved.has(mapped)) {
        queue.push(mapped);
      }
    }
  }

  return resolved;
}

export function parseAllowedGroups(rawValue) {
  // Group JIDs (…@g.us) are matched verbatim (case-insensitive, trimmed).
  return new Set(
    String(rawValue || '')
      .split(',')
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

// Unified chat-scoped allowlist used for BOTH inbound gating and outbound
// (/send etc.).  Groups are allowed by their chat JID (any participant may
// speak in an approved group); DMs are allowed only when the counterparty
// number is in the sender allowlist (empty = deny, secure default).  For
// outbound calls senderId is unknown, so the DM counterparty is chatId.
export function isChatAllowed(chatId, senderId, { allowedGroups, allowedUsers, sessionDir } = {}) {
  const cid = String(chatId || '');
  if (!cid) return false;
  if (cid.endsWith('@g.us')) {
    if (!allowedGroups || allowedGroups.size === 0) return false;
    return allowedGroups.has('*') || allowedGroups.has(cid.toLowerCase());
  }
  // Direct message (or status/broadcast, which will fail the user match).
  const peer = senderId || cid;
  return matchesAllowedUser(peer, allowedUsers, sessionDir);
}

export function matchesAllowedUser(senderId, allowedUsers, sessionDir) {
  // Empty allowlist = NO ONE allowed (secure default, #8389).  Operators
  // who want an open bot must set ``WHATSAPP_ALLOWED_USERS=*`` explicitly.
  // Previous behaviour (empty → return true) let any stranger DM the
  // bridge and trigger a Python-side pairing-code reply.
  if (!allowedUsers || allowedUsers.size === 0) {
    return false;
  }

  // "*" means allow everyone (consistent with SIGNAL_GROUP_ALLOWED_USERS)
  if (allowedUsers.has('*')) {
    return true;
  }

  const aliases = expandWhatsAppIdentifiers(senderId, sessionDir);
  for (const alias of aliases) {
    if (allowedUsers.has(alias)) {
      return true;
    }
  }

  return false;
}
