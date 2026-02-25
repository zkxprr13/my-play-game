# My Play Game Monorepo

Monorepo на `pnpm workspaces` с тремя пакетами:

- `apps/client` — Vite + React + TypeScript.
- `apps/server` — Fastify + TypeScript.
- `packages/shared` — общие типы, схемы и DTO.

## Полный запуск локально

### 1) Установка зависимостей

```bash
pnpm install
```

### 2) Поднять PostgreSQL

```bash
docker compose up -d postgres
```

### 3) Подготовить переменные окружения сервера

```bash
cp apps/server/.env.example apps/server/.env
```

Проверьте в `apps/server/.env`:

- `CORS_ORIGIN` — URL клиента (например, `http://localhost:5173`).
- `PUBLIC_BASE_URL` — публичный URL сервера (например, `http://localhost:3000`).
- `ADMIN_TOKEN` — токен для защищённых endpoint'ов.
- `UPLOAD_DIR` — каталог для файлов (по умолчанию `uploads`).

### 4) Подготовить Prisma

```bash
pnpm --filter @my-play-game/server prisma:generate
pnpm --filter @my-play-game/server prisma:migrate
```

### 5) (Опционально) настроить URL API в клиенте

Клиент читает `VITE_API_BASE_URL`.

- Если пусто — используются относительные URL (`/api/...`).
- Если задано — запросы идут на указанный origin.

Пример (`apps/client/.env.local`):

```bash
VITE_API_BASE_URL=http://localhost:3000
```

### 6) Запустить dev-режим

```bash
pnpm dev
```

- Клиент: `http://localhost:5173`
- Сервер: `http://localhost:3000`

## Полезные команды

```bash
pnpm build
pnpm lint
pnpm typecheck
```

## API примеры

### Healthcheck

```bash
curl http://localhost:3000/api/health
```

### Создание демо-уровня (`POST /api/levels`)

```bash
curl -X POST http://localhost:3000/api/levels \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Level",
    "items": [
      {
        "id": "item-1",
        "type": "text",
        "text": "Welcome aboard!",
        "position": { "x": 0, "y": 10, "z": -20 },
        "rotation": { "x": 0, "y": 0, "z": 0 },
        "size": { "w": 8, "h": 4 },
        "title": "Greeting"
      }
    ]
  }'
```

### Upload изображения (`POST /api/uploads`)

```bash
curl -X POST http://localhost:3000/api/uploads \
  -H "Authorization: Bearer change-me" \
  -F "file=@./demo-image.png"
```

### Обновление уровня (`PUT /api/levels/:id`)

```bash
curl -X PUT http://localhost:3000/api/levels/<LEVEL_ID> \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Level Updated"
  }'
```

## Формат ошибок

Сервер возвращает единый JSON-формат:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message"
  }
}
```
