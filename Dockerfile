# 1. Вибираємо базовий Node образ
FROM node:20-alpine

# 2. Створюємо робочу директорію
WORKDIR /app

# 3. Копіюємо package.json і встановлюємо залежності
COPY package*.json ./
RUN npm install --production

# 4. Копіюємо весь код
COPY . .

# 5. Компілюємо TypeScript (якщо треба)
RUN npm run build

# 6. Вказуємо команду запуску
CMD ["node", "dist/main.js"]
