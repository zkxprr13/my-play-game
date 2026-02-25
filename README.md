# My Play Game Monorepo

Monorepo на `pnpm workspaces` с тремя пакетами:

- `apps/client` — Vite + React + TypeScript.
- `apps/server` — Fastify + TypeScript.
- `packages/shared` — общие типы и константы.

## Установка

```bash
pnpm install
```

## База данных (PostgreSQL + Prisma)

1. Поднять PostgreSQL из `docker-compose.yml`:

```bash
docker compose up -d postgres
```

2. Скопировать переменные окружения для сервера:

```bash
cp apps/server/.env.example apps/server/.env
```

3. Сгенерировать Prisma Client:

```bash
pnpm --filter @my-play-game/server prisma:generate
```

4. Применить миграции:

```bash
pnpm --filter @my-play-game/server prisma:migrate
```

## Запуск в режиме разработки

```bash
pnpm dev
```

## Сборка

```bash
pnpm build
```

## Линтинг

```bash
pnpm lint
```

## Проверка типов

```bash
pnpm typecheck
```

## Эндпоинты сервера

- `GET /api/health` -> `{ "ok": true }`
