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
