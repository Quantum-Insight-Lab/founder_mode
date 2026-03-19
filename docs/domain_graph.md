# Граф домена — Founder Mode

**Основа:** PDA Methodology v1.1, Uncertainty Map, Acts of Certainty, `WEEKLY_REVIEW_INPUT_SCHEMA`  
**Дата:** 2026-03-09

---

## Часть A: Сущности (nodes)

| Сущность | Описание | Ключевые поля | ID/ключ | Владелец (bounded context) |
|----------|----------|---------------|---------|----------------------------|
| **User** | Фаундер, использующий бота. Внутренний ID + связь с платформой (Telegram) | user_id (UUID), tg_id, created_at | user_id (внутр.), tg_id (платф.) | Identity |
| **Week** | Временной интервал недели (цикл планирования) | start, end (date) | (start, end) или week_id | Planning |
| **WeeklyPlan** | Недельный план. Эталон для обзора | current_state, main_focus, weekly_result, week_failure, raw_post | (user_id, week_id) | Planning |
| **DailyReflection** | Рефлексия за один день | date, day, had_movement, what_moved/what_stopped, sensitive_moment/body_state, tomorrow_step/return_step, thought_of_day, raw_post | (user_id, date) | Reflection |
| **WeeklyReview** | Сгенерированный обзор недели | focus, result_status, what_worked, bottleneck, conclusion (или raw_text) | (user_id, week_id) | Review |
| **LLMCall** | Запись вызова GPT (аудит) | event_type (plan/reflection/review), model, tokens_in, tokens_out, latency_ms, trace_id, idempotency_key | event_id | Observability |

---

## Часть B: Связи (edges)

| Связь | От (Entity) | К (Entity) | Тип | Смысл/правило | Ключевые события |
|-------|-------------|------------|-----|---------------|------------------|
| **owns** | User | WeeklyPlan | 1:N | Пользователь создаёт планы. Один план на неделю | PlanCreated, PlanUpdated |
| **owns** | User | DailyReflection | 1:N | Пользователь пишет рефлексии. Одна рефлексия на день | ReflectionSubmitted |
| **owns** | User | WeeklyReview | 1:N | Обзор принадлежит пользователю | ReviewGenerated |
| **spans** | Week | — | — | Week задаёт day_range. Границы цикла | — |
| **has_plan** | Week | WeeklyPlan | 1:1 | У недели один план. План привязан к неделе | PlanCreated |
| **contains_reflections** | Week | DailyReflection | 1:N | Неделя содержит рефлексии. Рефлексии внутри day_range | ReflectionSubmitted |
| **has_review** | Week | WeeklyReview | 1:1 | У недели один обзор. Производная от плана + рефлексий | ReviewGenerated |
| **belongs_to_week** | DailyReflection | Week | N:1 | Рефлексия привязана к дате. Дата внутри day_range недели | — |
| **references** | WeeklyPlan | Week | N:1 | План относится к конкретной неделе | — |
| **derived_from** | WeeklyReview | WeeklyPlan | 1:1 | Обзор строится из плана | ReviewGenerated |
| **derived_from** | WeeklyReview | DailyReflection | 1:N | Обзор строится из рефлексий (≥3) | ReviewGenerated |
| **produced_by** | WeeklyPlan.raw_post | LLMCall | 1:1 | План сгенерирован GPT | PlanGenerated |
| **produced_by** | DailyReflection.raw_post | LLMCall | 1:1 | Ответ на рефлексию сгенерирован GPT | ReflectionResponseGenerated |
| **produced_by** | WeeklyReview | LLMCall | 1:1 | Обзор сгенерирован GPT | ReviewGenerated |

---

## Каталог типов связей

| Тип | Смысл | Пример |
|-----|-------|--------|
| **owns** | Владение. Только владелец может изменять | User owns WeeklyPlan |
| **has_plan** / **has_review** | Агрегация 1:1. Один план/обзор на неделю | Week has_plan WeeklyPlan |
| **contains_reflections** | Агрегация 1:N. Неделя содержит рефлексии | Week contains DailyReflection |
| **belongs_to_week** | Принадлежность к циклу. Рефлексия в границах недели | DailyReflection belongs_to_week Week |
| **derived_from** | Производность. Обзор не существует без плана и рефлексий | WeeklyReview derived_from (WeeklyPlan, DailyReflection[]) |
| **produced_by** | Генерация. Артефакт создан LLM | WeeklyReview produced_by LLMCall |

---

## Словарь сущностей (Entity Dictionary)

### User
Фаундер, аутентифицированный через платформу (сейчас — Telegram). **user_id** — внутренний UUID, единый для всех каналов (при добавлении другого мессенджера данные сохранятся). **tg_id** — Telegram ID. Владелец всех своих планов, рефлексий и обзоров.

### Week
Временной интервал (day_range). Обычно Пн–Вс или Вс–Сб. Идентифицируется парой (start, end) или week_id. Задаёт границы цикла: план и рефлексии должны относиться к одной неделе.

### WeeklyPlan
Структурированный план недели. Создаётся в воскресенье через ответы на 4 вопроса. GPT возвращает raw_post. Сохраняется как эталон для обзора. Поля: current_state, main_focus, weekly_result, week_failure.

### DailyReflection
Рефлексия за конкретный день. Две ветки: had_movement=true (what_moved, sensitive_moment, tomorrow_step) или had_movement=false (what_stopped, body_state, attention_sink, return_step). Поле thought_of_day в обеих. raw_post — ответ GPT. Одна рефлексия на пользователя на день (идемпотентность).

### WeeklyReview
Результат GPT-анализа: план + рефлексии → обзор. Содержит: главный фокус, статус результата (достигнут/частично/не), что сработало, узкое место, вывод. Генерируется только при ≥1 план + ≥3 рефлексии.

### LLMCall
Запись вызова GPT. Для аудита и воспроизводимости. Поля: event_type, model, tokens, latency, trace_id, idempotency_key. Связан с PlanGenerated, ReflectionResponseGenerated, ReviewGenerated.

---

## Схема (ASCII)

```
                    ┌─────────┐
                    │  User   │
                    └────┬────┘
                         │ owns
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐
  │ WeeklyPlan  │ │DailyReflection│ │WeeklyReview │
  └──────┬──────┘ └───────┬───────┘ └──────┬──────┘
         │               │                │
         │ references    │ belongs_to     │ derived_from
         │               │                │
         ▼               ▼                │
  ┌─────────────┐ ┌─────────────┐         │
  │    Week     │◄──────────────┘         │
  │ (day_range) │                         │
  └──────┬──────┘                         │
         │ has_plan, has_review            │
         └────────────────────────────────┘
         
  LLMCall ← produced_by — Plan, Reflection.raw_post, Review
```

---

## Связь с артефактами

- **Uncertainty Map** → неопределённости закрываются актами, оперирующими этими сущностями
- **Acts of Certainty** → акты создают/изменяют Plan, Reflection, Review
- **Invariants** → инварианты задают правила для сущностей и операций. См. `invariants.md`
- **Constants** → MIN_REFLECTIONS и др. См. `constants.md`
- **WEEKLY_REVIEW_INPUT_SCHEMA** → day_range + weekly_plan + daily_reflections = вход для генерации WeeklyReview

---

## Changelog

- v1.1 (2026-03-09) — разделение user_id (внутренний UUID) и tg_id (платформа Telegram). Подготовка к multi-messenger
- v1.0 (2026-03-09) — первая версия по PDA 5.2, схеме входа, актам определённости
