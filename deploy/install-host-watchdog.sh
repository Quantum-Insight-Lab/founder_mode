#!/usr/bin/env bash
# Установка хостового watchdog: softdog + RuntimeWatchdogSec в systemd.
# Запуск: sudo ./deploy/install-host-watchdog.sh
set -euo pipefail

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "Запустите с sudo: sudo $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d /etc/systemd/system.conf.d
install -m 644 "$SCRIPT_DIR/systemd/50-watchdog.conf" /etc/systemd/system.conf.d/50-watchdog.conf

install -d /etc/modules-load.d
install -m 644 "$SCRIPT_DIR/modules-load.d/softdog.conf" /etc/modules-load.d/softdog.conf

if modprobe softdog 2>/dev/null; then
  echo "Модуль softdog загружен."
else
  echo "Предупреждение: modprobe softdog не удался (нет модуля или запрет). Проверьте ядро после перезагрузки." >&2
fi

echo "Перезапуск systemd (daemon-reexec) с новой конфигурацией..."
systemctl daemon-reexec

echo "Готово. Проверка:"
systemctl show systemd --property=RuntimeWatchdogUSec --property=RebootWatchdogUSec 2>/dev/null || true
echo ""
echo "RuntimeWatchdogUSec > 0 означает, что watchdog активен. Иначе — перезагрузите сервер после исправления softdog."
