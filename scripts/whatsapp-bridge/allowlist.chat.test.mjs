// Focused tests for the chat-scoped allowlist (groups by JID, DMs by number).
// Run: node allowlist.chat.test.mjs
import assert from 'assert';
import { parseAllowedGroups, isChatAllowed, parseAllowedUsers } from './allowlist.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok -', name); };

const GROUPS = parseAllowedGroups('120363405514199458@g.us, 120363410890520982@g.us');
const ME = parseAllowedUsers('447700900000'); // fake number for test only
const NONE = parseAllowedUsers('');
const opts = (users) => ({ allowedGroups: GROUPS, allowedUsers: users, sessionDir: '/nonexistent' });

t('approved group passes (any sender)', () =>
  assert.strictEqual(isChatAllowed('120363405514199458@g.us', '999999@s.whatsapp.net', opts(ME)), true));

t('non-approved group blocked (Firestarters)', () =>
  assert.strictEqual(isChatAllowed('120363163918049106@g.us', '447700900000@s.whatsapp.net', opts(ME)), false));

t('DM from approved number passes', () =>
  assert.strictEqual(isChatAllowed('447700900000@s.whatsapp.net', '447700900000@s.whatsapp.net', opts(ME)), true));

t('DM from other number blocked', () =>
  assert.strictEqual(isChatAllowed('123456789@s.whatsapp.net', '123456789@s.whatsapp.net', opts(ME)), false));

t('DM blocked when no users allowlisted (secure default)', () =>
  assert.strictEqual(isChatAllowed('447700900000@s.whatsapp.net', '447700900000@s.whatsapp.net', opts(NONE)), false));

t('group blocked when no groups allowlisted', () =>
  assert.strictEqual(isChatAllowed('120363405514199458@g.us', 'x@s.whatsapp.net', { allowedGroups: parseAllowedGroups(''), allowedUsers: ME }), false));

t('outbound (senderId null) to approved group passes', () =>
  assert.strictEqual(isChatAllowed('120363410890520982@g.us', null, opts(ME)), true));

t('outbound to non-approved DM blocked', () =>
  assert.strictEqual(isChatAllowed('555555@s.whatsapp.net', null, opts(ME)), false));

t('empty chatId blocked', () =>
  assert.strictEqual(isChatAllowed('', null, opts(ME)), false));

console.log(`\n${pass} passed`);
