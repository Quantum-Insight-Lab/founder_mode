# TODO

- [ ] **Вебхук** — реализовать

- [ ] **Вторая строка с режимом** — на карточке (rhythm / streak для engine-режимов)

- [ ] **Уведомления при уже пройденном этапе** — отключить

- [ ] **Обновить онбординг** — единый стиль для всех режимов

## Engine / Startup — фичи из старого Founder (отложено)

Startup Mode = упрощённый движок. Старый **Founder Mode** (`/declaration`, `/fixation`, `/report`, `/change`) пока остаётся отдельной вертикалью. Позже можно перенести в движок или выключить:

- [ ] **Онбординг-эксперимент** — CTA «начать эксперимент», funnelStarted/funnelCompleted, отдельные тексты после первого declaration/fixation/report
- [ ] **Воскресное приглашение на report** — первый report без настроенных напоминаний (`ONBOARDING_SUNDAY_REPORT_INVITE`)
- [ ] **Rhythm-строка на карточках** — streak/ритм на PNG (сейчас только у founder/closure, не у engine)
- [ ] **Расширенный pivot** — `/change` с 4 вопросами (reason, new_focus, new_win, new_failure) vs 3 в engine `/pivot`
- [ ] **Миграция founder → startup** — перенос данных `weekly_declarations` → `engine_commitments`, deprecation старой вертикали
- [ ] **Единые команды** — alias `/declaration`→`/focus` для startup или полный отказ от legacy-команд

## Engine / Closure — фичи из старой вертикали (отложено)

Closure переведён на движок (`/focus` `/log` `/recap` `/pivot`). Код legacy (`/matter` `/step` `/digest` `/switch`, `weekly_matters`, …) пока в репо, но не подключён:

- [ ] **Онбординг после recap** — CTA «Продолжим на следующей неделе?» (`onboard_digest_cta_*`)
- [ ] **Rhythm-строка на карточках** — streak на PNG matter/step (legacy render)
- [ ] **Миграция данных** — `weekly_matters` / `matter_steps` / `weekly_digests` → `engine_*`
- [ ] **Alias команд** — `/matter`→`/focus` для старых пользователей или удаление legacy-кода
- [ ] **Удалить мёртвый код** — `dispatch-closure.ts`, `handlers/closure/*`, `closure-conversations.ts`
