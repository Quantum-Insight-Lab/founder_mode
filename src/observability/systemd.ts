import { execFile } from 'node:child_process';
import { logger } from './logger.js';

function runNotify(args: string[]): void {
  if (!process.env.NOTIFY_SOCKET) return;
  execFile('systemd-notify', args, { env: process.env }, (err) => {
    if (err) logger.debug({ err }, 'systemd-notify failed');
  });
}

/** Сигнал systemd, что сервис готов (нужно при Type=notify). */
export function notifySystemdReady(): void {
  runNotify(['--ready']);
}

/** Пинг watchdog (нужно при WatchdogSec= в unit). */
export function notifySystemdWatchdog(): void {
  runNotify(['--watchdog']);
}

/** Периодические пинги по WATCHDOG_USEC из окружения (ставит systemd). */
export function startSystemdWatchdogLoop(): void {
  const usec = process.env.WATCHDOG_USEC;
  if (!usec || !process.env.NOTIFY_SOCKET) return;
  const parsed = parseInt(usec, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return;
  const intervalMs = Math.max(1000, Math.floor(parsed / 2_000));
  setInterval(() => notifySystemdWatchdog(), intervalMs);
}
