#!/usr/bin/env node
/**
 * Wait for Postgres to accept TCP connections (for systemd ExecStartPre).
 * Reads DATABASE_URL from env. Exits 0 when connected, 1 on timeout.
 * Usage: node scripts/wait-for-db.js [max_seconds=60]
 */
import net from 'net';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('wait-for-db: DATABASE_URL not set');
  process.exit(1);
}

let host, port;
try {
  const u = new URL(url);
  host = u.hostname;
  port = Number(u.port) || 5432;
} catch {
  console.error('wait-for-db: invalid DATABASE_URL');
  process.exit(1);
}

const maxSeconds = Number(process.argv[2]) || 60;
const deadline = Date.now() + maxSeconds * 1000;

function tryConnect() {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

(async () => {
  while (Date.now() < deadline) {
    if (await tryConnect()) {
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error('wait-for-db: timeout waiting for database');
  process.exit(1);
})();
