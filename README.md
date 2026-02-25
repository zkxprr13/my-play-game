# My Play Game Monorepo

Monorepo на `pnpm workspaces` с тремя пакетами:

- `apps/client` — Vite + React + TypeScript.
- `apps/server` — Fastify + TypeScript.
- `packages/shared` — общие типы и константы.

## Установка

```bash
pnpm install
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
