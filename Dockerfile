# syntax=docker/dockerfile:1
#
# ОБРАЗ БЭКЕНДА AIRENA.
#
# ── ПОЧЕМУ node:24, А НЕ 20 И НЕ 22 ──────────────────────────────────────────
#
# Хранилище — `node:sqlite` из стандартной библиотеки (`src/server/db.js`), и
# это решение, а не заглушка: бэкенд, который считает деньги и рейтинг, не
# берёт лишнюю зависимость с нативной сборкой. Цена решения — версия рантайма:
# на 24 модуль есть и работает без флага, ниже — либо флаг, либо нет вовсе.
#
# ── ПОЧЕМУ slim, А НЕ alpine ─────────────────────────────────────────────────
#
# `esbuild` (печёт тела существ, `src/server/forge/body.js`) ставит бинарник
# под платформу. На musl нужен отдельный пакет, и промах виден не на сборке
# образа, а в первой генерации на проде. Debian-slim стоит десяток мегабайт и
# снимает вопрос целиком.
#
# ── ЧТО ЗДЕСЬ НЕ ПРОИСХОДИТ ──────────────────────────────────────────────────
#
# Клиент не собирается. `dist/` — это то, что уезжает на раздатчик статики
# (GENEX), а не то, что отдаёт бэкенд; собирается он на машине разработчика
# командой `npm run build`. Образ отдаёт `src/client` напрямую тем же маунтом,
# что и локально, — это запасной путь на собственном домене, не основной.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci`, а не `install`: на сервере ставится ровно то, что замерено. И
# внутри контейнера, а не копированием с макбука — у esbuild бинарник платформы.
RUN npm ci --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY tools ./tools
COPY bodies ./bodies
# Популяции эталонных мозгов: из них `tools/seed.mjs` стелет лестницу на
# свежем сервере. Без них первый гость видит пустой пол вместо витрины.
COPY brains ./brains

# `reports/` читает `tools/seed.mjs` — он ищет там `brains-*`. Архива в образе
# нет (см. .dockerignore), но каталог должен существовать, иначе посев падает
# на `readdirSync` ещё до первого мозга.
RUN mkdir -p reports /data && chown -R node:node /app /data

USER node
ENV AIRENA_DB=/data/airena.db
ENV PORT=8787
EXPOSE 8787
VOLUME ["/data"]

# Проверка здоровья — та же ручка, что и у людей: `/api/health` отдаёт `ok` и
# версию констант. Сумм и статистики цикла там нет без `AIRENA_OPS=1` (D63).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server/app.js"]
