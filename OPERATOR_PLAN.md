# Founder Mode — План оператора-разработчика

> Пошаговая инструкция: от первого запуска до production.
> Основан на PDA v1.1, docs (Uncertainty Map, Acts of Certainty, Invariants, Constants) и текущем состоянии `src/`.

---

## Фаза 0. Подготовка окружения

### 0.1 Зависимости

| Что             | Версия        |
|-----------------|---------------|
| Node.js         | ≥ 20          |
| PostgreSQL      | 15+           |
| Telegram бот    | токен от @BotFather |
| OpenAI API ключ | GPT-4o-mini или совместимый |

### 0.2 Установка

```bash
git clone <repo-url> && cd founder_mode
npm install
cp .env.example .env
```

### 0.3 Заполнение `.env`

Обязательные переменные:

| Переменная       | Что указать                            |
|------------------|----------------------------------------|
| `BOT_TOKEN`      | Токен бота от @BotFather               |
| `DATABASE_URL`   | postgresql://user:password@host:5432/founder_mode |
| `OPENAI_API_KEY` | API ключ OpenAI                        |

Опционально: `OPENAI_MODEL` (по умолчанию gpt-4o-mini).

---

## Фаза 1. Smoke Test (первый запуск)

**Цель:** убедиться, что система запускается и основной flow работает.

### 1.1 Поднять PostgreSQL

PostgreSQL должен быть запущен и доступен. Создать БД:

```bash
createdb founder_mode
```

Или через Docker (если установлен):

```bash
docker run -d --name founder_mode_pg \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=founder_mode \
  -p 5433:5432 postgres:15
```

### 1.2 Применить миграции

```bash
npm run db:migrate
```

Ожидаемый вывод: `Migration 001 applied`.

### 1.3 Сборка и запуск

```bash
npm run build
npm run dev
```

Ожидаемый вывод: `Bot @<username> started`.

### 1.4 Проверка в Telegram

| Шаг | Действие           | Ожидаемый результат                |
|-----|--------------------|------------------------------------|
| 1   | `/start`           | Бот приветствует, список команд   |
| 2   | `/plan`            | Первый вопрос планирования        |
| 3   | Ответить на 4 вопроса  | Бот генерирует план через LLM |
| 4   | `/reflect`         | Выбор даты (Вчера/Сегодня)        |
| 5   | Да/Нет → ответы по ветке | Генерируется raw_post рефлексии |
| 6   | `/review`          | Обзор (если план + ≥3 рефлексии)  |

### 1.5 Критерии прохождения

- [✔️] Приложение стартует без ошибок
- [✔️] `/start` создаёт пользователя в таблице `users`
- [✔️] `/plan` → 4 вопроса → GPT → PlanCreated event, запись в `weekly_plans`
- [✔️] `/reflect` → ветка Да/Нет → ReflectionSubmitted event, запись в `daily_reflections`
- [✔️] `/review` при достаточных данных → ReviewGenerated event
- [ ] События записываются в таблицу `events`

### 1.6 Частые проблемы

| Проблема | Решение |
|----------|---------|
| `ECONNREFUSED :5432` | PostgreSQL не запущен или неверный `DATABASE_URL` |
| `BOT_TOKEN is required` | Заполнить `BOT_TOKEN` в `.env` |
| LLM timeout / 401 | Проверить `OPENAI_API_KEY` |
| `/review` — «мало данных» | INV-003: нужен план + ≥3 рефлексии в day_range |
| Рефлексия в будущем | INV-004: date <= today |

---

## Фаза 2. Ручное тестирование сценариев

**Цель:** прогнать все ключевые потоки через Telegram.

### 2.1 Сценарии для проверки

| # | Сценарий                  | Команды / действия                      | Что проверяем                        |
|---|---------------------------|-----------------------------------------|--------------------------------------|
| 1 | Регистрация               | `/start`                                | Пользователь в users                 |
| 2 | Планирование недели       | `/plan` → 4 вопроса                     | PlanCreated, weekly_plans             |
| 3 | Рефлексия (движение)      | `/reflect` → Сегодня → Да → ответы     | ReflectionSubmitted, raw_post        |
| 4 | Рефлексия (без движения)  | `/reflect` → Вчера → Нет → ответы      | Ветка what_stopped/body_state        |
| 5 | Идемпотентность рефлексии| Повтор `/reflect` на тот же день        | Upsert (INV-001)                     |
| 6 | Обзор при нехватке данных | `/review` без плана или <3 рефлексий   | Предупреждение (INV-003)             |
| 7 | Обзор при достатке данных | План + 3+ рефлексии → `/review`        | ReviewGenerated, текст обзора        |
| 8 | Лимит истории Free        | `/review` для недели старше 2 недель    | Сообщение «вне доступной истории»    |
| 9 | Повтор `/plan` на ту же неделю | Новый план той же недели          | PlanUpdated, upsert (INV-002)       |
| 10 | Рефлексия в будущем       | (если возможно) date > today            | Ошибка (INV-004)                     |

### 2.2 Детали проверки сценариев

**Сценарий 2 — Планирование:**  
1. `/plan`  
2. Ответить на 4 вопроса (current_state, main_focus, weekly_result, week_failure)  
3. Ожидаемый ответ: «Воскресенье — План недели» (структурированный пост)  
4. Проверить: `events` — PlanCreated; `weekly_plans` — запись

**Сценарий 3 — Рефлексия с движением:**  
1. `/reflect` → «Сегодня» → «Да»  
2. Ответить: что продвинуло, чувствительный момент, шаг на завтра, мысль дня  
3. Ожидаемый ответ: «<День> — Рефлексия дня»  
4. Проверить: ReflectionSubmitted, `daily_reflections`

**Сценарий 4 — Рефлексия без движения:**  
1. `/reflect` → «Вчера» → «Нет»  
2. Ответить: что остановило, как ощущался день, что заняло внимание, как вернуть вектор, мысль дня  
3. Проверить: ветка what_stopped/body_state/attention_sink/return_step

**Сценарий 7 — Обзор:**  
1. Создать план (`/plan`)  
2. 3+ рефлексии (`/reflect`)  
3. `/review`  
4. Ожидаемый ответ: «Недельный срез» (фокус, статус результата, что сработало, узкое место, вывод)

### 2.3 Что фиксировать

- Любые ошибки в логах
- Несоответствия между ожидаемым и фактическим поведением
- Telegram: корректность текстов, кнопок, последовательности вопросов

### 2.4 Итерация PDA: поиск новых неопределённостей

| Вопрос | Если да → действие |
|--------|--------------------|
| Новая неопределённость? | Добавить в `docs/uncertainty_map.md` |
| Инвариант без механизма? | Добавить механизм в `docs/invariants.md` |
| Пользователь в тупике? | Спроектировать акт в `docs/acts_of_certainty.md` |
| Новый порог/лимит? | Constant Card в `docs/constants.md` |

---

## Фаза 3. Исправление найденных проблем (итерация PDA §3)

**Цель:** устранить всё, что всплыло при ручном тестировании.

### 3.1 Процесс

Для каждого найденного несоответствия:

| Шаг PDA | Артефакт | Действие |
|---------|----------|----------|
| §3.1 | Uncertainty Map | Добавить неопределённость |
| §3.2 | Acts of Certainty | Спроектировать акт (кнопка/подтверждение) |
| §3.4 | Invariants | Механизм обеспечения инварианта |
| §3.5 | Constants | Constant Card |
| §3.8 | Stabilization | Fix → повторный прогон сценария |

### 3.2 Критерий выхода

- Все сценарии фазы 2 проходят стабильно
- Новые неопределённости отражены в docs
- Каждый новый инвариант имеет механизм

---

## Фаза 4. Наблюдаемость (PDA §7)

**Цель:** видеть, что происходит в системе.

### 4.1 Уже реализовано

- Pino logging
- Event Store (append-only events)
- Runbook: `docs/runbook.md` — нарушение инварианта, падение OpenAI, дубликаты

### 4.2 Что добавить

| Компонент          | Описание                                          | Приоритет |
|--------------------|---------------------------------------------------|-----------|
| Prometheus metrics | invariant_violations, llm_calls, funnel completion | Реализовано   |
| trace_id в логах   | Корреляция запросов                               | Реализовано   |
| Health endpoint   | Проверка DB, LLM (если отдельный HTTP-сервис)       | Реализовано   |

### 4.3 Метрики устойчивости

| Метрика                    | Источник                |
|----------------------------|-------------------------|
| Invariant violations       | Rejected commands       |
| llm_calls_total, latency   | LLM client              |
| planning_completed         | PlanCreated events      |
| reflection_completed       | ReflectionSubmitted     |
| review_completed           | ReviewGenerated         |

---

## Фаза 5. Автоматизированные тесты

### 5.1 Текущее состояние

- `npm test` — vitest. Тестов домена/сервисов может не быть.

### 5.2 Что добавить

| Набор            | Файлы                         | Покрытие                    |
|------------------|-------------------------------|-----------------------------|
| Валидаторы       | `tests/validators.test.ts`    | INV-003, INV-004, INV-005   |
| Event Store      | `tests/event-store.test.ts`  | append, idempotency         |
| Services         | `tests/services.test.ts`     | Plan, Reflection, Review    |

---

## Фаза 6. Production-деплой

### 6.1 Предварительные условия

- [ ] Все сценарии фазы 2 проходят
- [ ] `.env` заполнен production-значениями
- [ ] Миграции применены

### 6.2 Запуск

```bash
npm run build
npm start
```

Бот работает в режиме long polling. Для production с высокой нагрузкой рассмотреть webhook (grammY + reverse proxy).

### 6.4 Systemd и порядок старта после перезагрузки

Чтобы приложение не стартовало раньше Postgres (Docker):

1. **Unit** `deploy/founder-mode.service`: зависимость `After=docker.service` и `ExecStartPre` — скрипт `scripts/wait-for-db.js`, который по `DATABASE_URL` ждёт готовности порта БД (до 60 с), затем запускается приложение.
2. **Установка unit:**
   ```bash
   sudo cp /opt/founder_mode/deploy/founder-mode.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable founder-mode
   sudo systemctl start founder-mode
   ```
3. **Порядок:** Docker поднимается → контейнер Postgres стартует → systemd запускает founder-mode → ExecStartPre ждёт доступности БД → ExecStart запускает `node dist/index.js`. При падении приложения — `Restart=on-failure` с паузой 10 с.

### 6.3 Чек-лист (PDA §7.3)

- [ ] Runbook для доменных инцидентов (`docs/runbook.md`)
- [ ] План деградации при падении LLM
- [ ] Константы в `config/default.yaml` проверены

---

## Фаза 7. Эксперименты и стабилизация (PDA §8)

**Цель:** калибровка констант.

### 7.1 Константы

Управляются через `config/default.yaml`:

| Константа | Назначение |
|-----------|------------|
| min_reflections_for_review | INV-003 |
| llm_request_timeout_ms | Тайм-аут LLM |
| llm_max_retries | Ретраи |

### 7.2 Experiment Card (шаблон)

| Поле                   | Значение |
|------------------------|----------|
| Гипотеза               |          |
| Целевая неопределённость |        |
| Изменение              |          |
| Метрика успеха         |          |
| Guardrails             |          |
| Длительность           |          |

---

## Справочник: npm-скрипты

| Команда           | Назначение                       |
|-------------------|----------------------------------|
| `npm run dev`     | Запуск с hot-reload (tsx watch)  |
| `npm start`       | Production (node dist/index.js)  |
| `npm run build`   | TypeScript + копирование промптов|
| `npm test`        | Vitest                           |
| `npm run db:migrate` | Применить миграции            |

---

## Справочник: структура проекта

```
src/
  domain/       — validators (INV-001..010), errors
  events/       — типы событий, Event Store
  projectors/   — Event → Read Model
  services/     — PlanService, ReflectionService, ReviewService
  llm/          — prompts, client (OpenAI + idempotency)
  bot/          — handlers/ (onboarding, plan, reflect, review, settings, delete), context, conversations
  config/       — constants (YAML)
  db/           — PostgreSQL pool
  observability/— logger, metrics
  index.ts      — entry point
migrations/     — 001_init.sql
config/         — default.yaml
docs/           — PDA artifacts (runbook, invariants, etc.)
scripts/        — migrate.ts, wait-for-db.js
deploy/         — founder-mode.service (systemd unit)
```
