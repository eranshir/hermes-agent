import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { mkdirSync, rmSync } from 'fs';
import path from 'path';

const phone = process.argv[2];
const sessionDir = process.argv[3] || '/home/eran/.hermes/profiles/hal/whatsapp/session';
if (!phone) {
  console.error('Usage: node pair-code.mjs <phone-number-no-plus> [session-dir]');
  process.exit(2);
}
try { rmSync(sessionDir, { recursive: true, force: true }); } catch {}
mkdirSync(sessionDir, { recursive: true });
let requested = false;
let reconnects = 0;
let sock;
async function start() {
  console.log('START session=' + sessionDir + ' phone=' + phone);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  console.log('AUTH_STATE loaded registered=' + !!state.creds?.registered);
  const { version } = await fetchLatestBaileysVersion();
  console.log('BAILEYS_VERSION=' + JSON.stringify(version));
  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: false,
    browser: ['Hermes Agent', 'Chrome', '120.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  sock.ev.on('creds.update', saveCreds);
  setTimeout(async () => {
    console.log('REQUEST_TIMER registered=' + !!sock.authState.creds.registered + ' requested=' + requested);
    if (!requested && !sock.authState.creds.registered) {
      requested = true;
      try {
        const code = await sock.requestPairingCode(phone);
        console.log('\nPAIRING_CODE=' + code + '\n');
        console.log('On the WhatsApp phone: Linked Devices -> Link with phone number instead, then enter this code.');
      } catch (e) {
        console.error('PAIRING_CODE_ERROR=' + (e?.stack || e?.message || String(e)));
      }
    }
  }, 5000);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('PAIRING_COMPLETE creds=' + path.join(sessionDir, 'creds.json'));
      setTimeout(() => process.exit(0), 2000);
    }
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log('CONNECTION_CLOSED reason=' + reason);
      if (reason === DisconnectReason.loggedOut) process.exit(1);
      if (reconnects++ < 5) setTimeout(start, reason === 515 ? 1000 : 3000);
      else process.exit(1);
    }
  });
}
start().catch(e => { console.error(e?.stack || e); process.exit(1); });
setTimeout(() => { console.error('PAIRING_TIMEOUT'); process.exit(3); }, 10 * 60 * 1000);
