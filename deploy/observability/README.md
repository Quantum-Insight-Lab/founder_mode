# Prometheus + Grafana (Founder Mode)

Стек поднимается отдельно от бота. Метрики бота — HTTP `GET /metrics` на порту **`METRICS_PORT`** (по коду по умолчанию **9090**).

## Быстрый старт

```bash
cd deploy/observability
cp .env.example .env   # отредактируй пароль Grafana
docker compose up -d
```

- **Prometheus UI**: `http://<сервер>:9091` (порт по умолчанию **9091**, чтобы не пересекаться с метриками бота на **9090**)
- **Grafana**: `http://<сервер>:3000` (логин из `.env`, по умолчанию `admin` / `change-me`)

В Grafana уже подключён datasource **Prometheus** и дашборд **Founder Mode — overview**.

## Куда смотрит Prometheus

Файл `targets/founder_mode.json` — список scrape targets (обновляется без перезапуска, refresh ~30s).

### Бот на хосте (systemd), метрики на `0.0.0.0:9090`

Оставь по умолчанию:

```json
[{ "targets": ["host.docker.internal:9090"], "labels": { "service": "founder_mode" } }]
```

`extra_hosts: host.docker.internal:host-gateway` уже задан в `docker-compose.yml` (Linux).

### Бот в Docker (другой compose / другой контейнер)

1. Убедись, что у контейнера бота **опубликован** порт `9090` на хост **или** Prometheus в одной сети с ботом.
2. Пропиши имя сервиса и порт, например:

```json
[{ "targets": ["имя_сервиса_бота:9090"], "labels": { "service": "founder_mode" } }]
```

3. Подключи сервис `prometheus` к той же Docker-сети, что и бот. Пример — **внешняя сеть**:

В `docker-compose.yml` этого стека добавь:

```yaml
networks:
  observability:
    external: true
    name: ИМЯ_СЕТИ_ГДЕ_БОТ
```

И убери `driver: bridge` / замени на `external` как выше (или используй `docker network connect`).

После правки `targets/founder_mode.json` подожди до ~30 секунд или перезагрузи конфиг Prometheus: **POST** `http://localhost:9091/-/reload` (если включён `--web.enable-lifecycle` — у нас включён).

## Проверка

1. В Prometheus: **Status → Targets** — job `founder_mode` должен быть **UP**.
2. Запрос: `up{job="founder_mode"}` → значение `1`.
3. Метрики приложения: `bot_opens_total`, `funnel_started_total`, и т.д.

## Имена метрик (кратко)

| Метрика | Смысл |
|--------|--------|
| `bot_opens_total` | вызовы `/start` |
| `experiment_started_total` | CTA «Да» на эксперимент |
| `experiment_completed_total` | завершение после первого report CTA |
| `funnel_started_total{type="..."}` | старт воронок |
| `funnel_completed_total{type="..."}` | завершение |
| `card_edit_clicks_total{kind="..."}` | клики «Изменить» по карточкам |
| `llm_calls_total`, `llm_call_latency_seconds_bucket` | LLM |

Если какой-то счётчик отсутствует в `/metrics`, обнови версию бота до той, где он добавлен.
