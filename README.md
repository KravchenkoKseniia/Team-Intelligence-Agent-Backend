# Team-Intelligence-Agent-Backend

NestJS сервер, написаний на TypeScript, для керування бекенд-частиною Team Intelligence Agent.

## Попередні вимоги
- Node.js 18+
- npm 9+ або інший менеджер пакетів (yarn/pnpm)

## Встановлення залежностей
```bash
npm install
```

## Режими запуску
- Режим розробки із перезавантаженням:
  ```bash
  npm run start:dev
  ```
- Запуск збірки (production build) та старт програми:
  ```bash
  npm run build
  npm start
  ```
- Налагодження з інспектором Node.js:
  ```bash
  npm run start:debug
  ```

## REST-ендпоїнти
- `GET /api/health` — базова перевірка стану сервера. Повертає JSON:
  ```json
  {
    "service": "team-intelligence-agent-backend",
    "status": "ok",
    "timestamp": "2024-03-23T12:34:56.789Z"
  }
  ```
- `POST /api/mcp/jira/preview` — проксі до Jira через MCP. Приймає тіло:
  ```json
  {
    "jiraUrl": "https://your-team.atlassian.net",
    "apiKey": "MCP_JIRA_TOKEN",
    "jql": "project = DEMO ORDER BY created DESC",
    "limit": 2
  }
  ```
  Повертає `{ "ok": true, "source": "mcp:jira", "count": N, "items": [{ "id", "key", "summary", "status" }, ...] }`.
- `POST /api/jira/preview` — прямий виклик Jira REST API без MCP (використовує офіційний `/rest/api/3/search/jql`). Приймає:
  ```json
  {
    "jiraUrl": "https://your-team.atlassian.net",
    "email": "user@example.com",
    "apiKey": "JIRA_API_TOKEN",
    "jql": "project = DEMO ORDER BY created DESC",
    "limit": 3
  }
  ```
  Повертає `{ "ok": true, "source": "jira:api", "count": N, "items": [{ "id", "key", "summary", "status" }, ...] }`.
- `POST /api/jira/projects` — повертає список проєктів Jira (використовує `/rest/api/3/project/search`). Приймає:
  ```json
  {
    "jiraUrl": "https://your-team.atlassian.net",
    "email": "user@example.com",
    "apiKey": "JIRA_API_TOKEN",
    "startAt": 0,
    "limit": 50
  }
  ```
  Повертає `{ "ok": true, "source": "jira:api", "count": N, "total": M, "projects": [...] }`.

## Структура каталогу
```
.
├── src
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   └── main.ts
├── nest-cli.json
├── package.json
├── tsconfig.build.json
└── tsconfig.json
```

## Нотатки
- Порт сервера задається змінною середовища `PORT`, за замовчуванням `3000`.
- У `ValidationPipe` ввімкнено `whitelist` для автоматичного відкидання полів, яких немає у DTO, та `forbidNonWhitelisted` для запобігання неочікуваним даним.

## Конфігурація MCP
- `MCP_BASE_URL` — обовʼязковий. Базовий URL MCP-шлюзу, куди відправляються інвокації (наприклад, `https://mcp-gateway.local/invoke`).
- `MCP_API_KEY` — опційно. Токен/ключ доступу до шлюзу (якщо потрібний). За замовчуванням відправляється в заголовку `Authorization: Bearer <token>`.
- `MCP_API_KEY_HEADER` — опційно. Змінює назву заголовка для `MCP_API_KEY` (наприклад, `x-api-key`).
- `MCP_HTTP_TIMEOUT` — опційно. Таймаут HTTP-запиту до MCP у мс (за замовчуванням `30000`).
- `MCP_INVOKE_PATH_TEMPLATE` — опційно. Якщо шлюз очікує різні URL для різних інструментів, задайте шаблон з плейсхолдером `{toolName}`, наприклад `/tools/{toolName}/invoke`.

Приклад запуску з MCP:

```bash
MCP_BASE_URL="https://mcp-gateway.local/invoke" \
MCP_API_KEY="super-secret" \
npm run start:dev
```

Зразок `.env` з плейсхолдерами для змінних середовища знаходиться у `.env.example`.
