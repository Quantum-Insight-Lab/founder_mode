# Runbook — Founder Mode

**Дата:** 2026-03-09

---

## (а) Нарушение инварианта

**Симптомы:** InvariantViolationError в логах, отказ в операции.

**Действия:**
1. Проверить лог: `invariantId` (INV-001..010)
2. INV-001 (дубликат рефлексии): ожидаемо при retry — upsert. Не критично
3. INV-003 (мало данных для обзора): пользователь получил предупреждение. Не вызывать GPT
4. INV-004 (рефлексия в будущем): проверить timezone, дату на клиенте
5. INV-007 (unauthorized): проверить, что user_id в запросе совпадает с tg_id сессии

**Эскалация:** повторяющиеся нарушения → проверить валидаторы в domain layer

---

## (б) Падение OpenAI API

**Симптомы:** Timeout, 503, rate limit в llm_calls.

**Действия:**
1. Проверить OPENAI_API_KEY, лимиты аккаунта
2. Ретраи: CONST-102 (LLM_MAX_RETRIES=2). При перманентной ошибке — не ретраить
3. Показать пользователю: «Сервис временно недоступен. Попробуйте через минуту»
4. Логировать в llm_calls с latency_ms, model

**Эскалация:** длительный outage → status.openai.com, рассмотреть fallback модель

---

## (в) Дубликаты (идемпотентность)

**Симптомы:** две одинаковые записи в weekly_plans или daily_reflections.

**Действия:**
1. Проверить idempotency_key в запросе — должен быть уникальным для (user, context)
2. Проверить idempotency_cache: TTL = CONST-103 (24ч)
3. При дубликате: manual dedup в БД (оставить последнюю по updated_at)
4. Убедиться, что projectors используют ON CONFLICT DO UPDATE

**Профилактика:** unique constraints (user_id, week_id), (user_id, date)

---

## Алерты в Telegram

При сервисных ошибках (LLM недоступен, БД, таймаут и т.д.) сообщение отправляется разработчику в Telegram, если задан `ALERT_CHAT_ID`.

**Настройка:** `ALERT_CHAT_ID` в .env — ID чата (узнать у @userinfobot). InvariantViolationError не алертятся.

**Token spike:** при резком росте токенов (сумма за окно превышает порог) — алерт `token_spike`. Порог и окно в `config/default.yaml`: `observability.token_spike_threshold`, `observability.token_spike_window_minutes`. Cooldown 30 мин.

---

## Метрики для мониторинга

- `invariant_violations_total` — счётчик отклонённых команд
- `llm_calls_total`, `llm_latency_p95`, `llm_errors_total`
- `planning_completed_total`, `reflection_completed_total`, `review_completed_total`
