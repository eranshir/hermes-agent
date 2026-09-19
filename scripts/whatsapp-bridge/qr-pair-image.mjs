import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';

const sessionDir = process.argv[2] || '/home/eran/.hermes/profiles/hal/whatsapp/session';
const outPng = process.argv[3] || '/tmp/hermes-whatsapp-qr.png';
const outSvg = outPng.replace(/\.png$/i, '.svg');
try { rmSync(sessionDir, { recursive: true, force: true }); } catch {}
mkdirSync(sessionDir, { recursive: true });
let qrWritten = false;
let reconnects = 0;
let sock;
async function start() {
  console.log('START_QR session=' + sessionDir + ' out=' + outPng);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
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
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !qrWritten) {
      qrWritten = true;
      console.log('QR_RAW=' + qr);
      console.log('\nQR_TERMINAL:\n');
      qrcodeTerminal.generate(qr, { small: false });
      await QRCode.toFile(outPng, qr, { margin: 3, width: 1024, errorCorrectionLevel: 'M' });
      const svg = await QRCode.toString(qr, { type: 'svg', margin: 3, width: 1024, errorCorrectionLevel: 'M' });
      writeFileSync(outSvg, svg);
      console.log('\nQR_PNG=' + outPng);
      console.log('QR_SVG=' + outSvg);
      console.log('Scan the image from WhatsApp -> Settings -> Linked Devices -> Link a Device.');
    }
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
setTimeout(() => { console.error('QR_PAIRING_TIMEOUT'); process.exit(3); }, 10 * 60 * 1000);
