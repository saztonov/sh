# Деплой ClassHub на VPS

## Архитектура

```
Интернет
    |
Host Nginx (185.200.179.0:443/80, SSL)
    |
    | proxy_pass http://127.0.0.1:8180
    |
Docker web-контейнер (127.0.0.1:8180 -> 80)
    |-- Nginx: отдает SPA (React)
    |-- Nginx: проксирует /api/ -> http://api:3000
    |
    +-- Docker api-контейнер (порт 3000, только Docker-сеть)
    |       Fastify, подключается к Supabase и S3
    |
    +-- Docker scraper-контейнер (только Docker-сеть)
    |       Playwright, работает по cron
    |
    +-- Docker bot-контейнер (только Docker-сеть)
            grammY, Telegram-бот
```

### Контейнеры

| Контейнер | Образ | Порт | Назначение |
|-----------|-------|------|------------|
| sh-web-1 | nginx:alpine | 127.0.0.1:8180->80 | SPA + reverse proxy для API |
| sh-api-1 | node:20-alpine | 3000 (Docker-сеть) | REST API (Fastify) |
| sh-scraper-1 | playwright:v1.50.0 | -- | Парсер Google Classroom |
| sh-bot-1 | node:20-alpine | -- | Telegram-бот |

### Зависимости между контейнерами

- **scraper** и **bot** запускаются только после того, как **api** пройдет healthcheck
- **web** зависит от **api** (проксирует /api/ запросы)

## Структура на сервере

```
Пользователь: classhub (группа docker)

/home/classhub/www/sh/              -- проект (git clone)
/home/classhub/www/sh/.env          -- секреты (chmod 600)
/home/classhub/www/sh/docker-compose.yml

/etc/nginx/vhosts/classhub/classhub.fvds.ru.conf  -- конфиг хостового Nginx
/etc/letsencrypt/live/classhub.fvds.ru/            -- SSL-сертификат (certbot)
```

### Переменные окружения (.env)

Ключевые переменные для production:

| Переменная | Значение | Примечание |
|------------|----------|------------|
| CORS_ORIGIN | https://classhub.fvds.ru | Домен фронтенда |
| API_PORT | 3000 | Внутренний порт, наружу не выставлен |
| BROWSER_CHANNEL | (пустое) | Playwright использует встроенный Chromium |
| PLAYWRIGHT_HEADLESS | true | На сервере нет GUI |
| VITE_SUPABASE_URL | https://xxx.supabase.co | Вкомпилируется в SPA при сборке |
| VITE_SUPABASE_ANON_KEY | eyJ... | Вкомпилируется в SPA при сборке |

**Важно:** переменные `VITE_*` вкомпилируются в фронтенд на этапе сборки Docker-образа web. После их изменения необходима пересборка: `docker compose up -d --build web`.

## Конфигурация Nginx

### Host Nginx

Файл: `/etc/nginx/vhosts/classhub/classhub.fvds.ru.conf`

- Слушает на `185.200.179.0:80` и `185.200.179.0:443`
- SSL-сертификат Let's Encrypt (автопродление через certbot)
- HTTP -> HTTPS редирект
- Проксирует все запросы на `http://127.0.0.1:8180`
- Отдает ACME-challenge из `/var/www/html` (для обновления сертификата)

### Docker Nginx (внутри web-контейнера)

Файл в проекте: `nginx.conf`

- Отдает SPA из `/usr/share/nginx/html`
- Проксирует `/api/` на `http://api:3000` (Docker-сеть)
- Кэширование статики (1 год)
- Gzip-сжатие

## Обновление портала

Все команды выполняются от пользователя **classhub**, если не указано иное.

### Обновление кода (общий случай)

```bash
# classhub:
cd ~/www/sh
git pull
docker compose up -d --build
```

Это пересоберёт все контейнеры, у которых изменился код, и перезапустит их.

### Обновление только фронтенда

```bash
# classhub:
cd ~/www/sh
git pull
docker compose up -d --build web
```

### Обновление только API

```bash
# classhub:
cd ~/www/sh
git pull
docker compose up -d --build api
```

После пересборки API автоматически перезапустятся scraper и bot (зависят от healthcheck API).

### Обновление только бота

```bash
# classhub:
cd ~/www/sh
git pull
docker compose up -d --build bot
```

### Обновление только скрейпера

```bash
# classhub:
cd ~/www/sh
git pull
docker compose up -d --build scraper
```

### Обновление .env (секретов)

```bash
# classhub:
cd ~/www/sh
nano .env
```

Затем, в зависимости от того, какие переменные изменились:

| Что изменилось | Команда |
|----------------|---------|
| VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY | `docker compose up -d --build web` |
| SUPABASE_*, S3_*, API_PORT, CORS_ORIGIN | `docker compose up -d api` (без --build) |
| TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID | `docker compose up -d bot` (без --build) |
| SCRAPE_CRON, GOOGLE_*, ELJUR_*, PLAYWRIGHT_* | `docker compose up -d scraper` (без --build) |

**Примечание:** для runtime-переменных (не VITE_*) пересборка не нужна -- достаточно перезапустить контейнер. Для VITE_* нужна пересборка, так как они вкомпилируются в JS-бандл.

### Полная пересборка с нуля

```bash
# classhub:
cd ~/www/sh
docker compose down
docker compose up -d --build
```

### Обновление SSL-сертификата

Certbot обновляет сертификат автоматически. Проверить таймер:

```bash
# root:
systemctl status certbot.timer
certbot renew --dry-run
```

## Диагностика

### Статус контейнеров

```bash
# classhub:
cd ~/www/sh
docker compose ps
```

### Логи

```bash
# classhub:
cd ~/www/sh
docker compose logs -f              # все контейнеры
docker compose logs -f api           # только API
docker compose logs -f web           # только web
docker compose logs -f scraper       # только scraper
docker compose logs -f bot           # только bot
docker compose logs --tail 100 api   # последние 100 строк API
```

### Проверка здоровья API

```bash
# classhub:
curl http://localhost:8180/api/health
```

### Проверка healthcheck контейнера

```bash
# classhub:
docker inspect --format='{{json .State.Health}}' sh-api-1
```

### Перезапуск контейнера без пересборки

```bash
# classhub:
cd ~/www/sh
docker compose restart api
docker compose restart bot
```

### Вход внутрь контейнера

```bash
# classhub:
docker exec -it sh-api-1 sh
docker exec -it sh-web-1 sh
```

### Очистка неиспользуемых образов

```bash
# classhub:
docker image prune -f
```
