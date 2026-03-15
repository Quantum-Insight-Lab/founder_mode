# Architecture Rule Card — Code Edition (Founder Mode)

**Основа:** 10_Codebase_Bootstrap_Domain_Application_Infrastructure

---

## Слои

| Слой | Содержит | Не содержит |
|------|----------|-------------|
| **domain/** | Правила, инварианты, value objects, чистые функции | HTTP, pg, grammy, observability, llm |
| **services/** | Use-cases (plan, reflect, review, settings) | — |
| **db/** | SQL, миграции, getUserLocalDate, validateReviewMinData | — |
| **bot/** | Handlers, маппинг в Telegram | Бизнес-правила (кроме маппинга) |
| **events/** | Event store, projectors | — |

---

## Dependency rules

**Разрешено:**
- bot → domain, services, db
- services → domain, db, events, llm
- db → domain (только чистые утилиты)

**Запрещено:**
- domain → pg, grammy, observability, llm, events
- domain → что-либо кроме стандартной библиотеки

---

## Use-case как единица работы

- Handlers вызывают services (use-cases)
- Идемпотентность, инварианты — в domain + services
- Handlers только маппят DTO → use-case → ответ

---

## AI rules

- AI не переносит логику между слоями
- AI не добавляет pg/observability в domain
- При неясности: задать 1 вопрос или предложить 2 варианта и остановиться
