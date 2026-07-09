---
name: verify
description: Build, run, and drive this app (Next.js 16 + Prisma 7 + Auth.js v5) to verify changes at the real surface.
---

# Verifying changes in this app

## Launch

```bash
npm run dev -- --port 3210            # dev server (background)
curl -s http://localhost:3210/signin  # poll until 200
```

Local Postgres `freshman_weekly` on localhost:5432; `DATABASE_URL` in `.env`
(strip the `?schema=public` suffix before passing to `psql` — it rejects it).

## Sign in without a browser

`ALLOW_DEV_LOGIN=true` in `.env` enables a Credentials provider with id `dev`
(signs in as `dev@freshman.academy`, auto-created). Cookie-jar flow:

```bash
CSRF=$(curl -s -c jar http://localhost:3210/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b jar -c jar -X POST http://localhost:3210/api/auth/callback/dev -d "csrfToken=$CSRF"
curl -s -b jar http://localhost:3210/dashboard   # authenticated SSR HTML
```

## Fire a server action over HTTP

Action IDs live in `.next/dev/server/server-reference-manifest.js`
(`self.__RSC_SERVER_MANIFEST="<escaped json>"`; decode, look in `.node`,
match the entry mentioning your function name). Then POST to any page the
action is registered for:

```bash
curl -s -b jar -X POST http://localhost:3210/dashboard \
  -H "Next-Action: <id>" -H "Content-Type: text/plain;charset=UTF-8" --data '[]'
```

`--data` is the JSON-encoded argument array. Unauthenticated calls get a 307.

## Gotchas

- Playwright MCP wants the `chrome` channel; Chrome isn't installed and
  `npx playwright install chrome` needs sudo — browser driving is unavailable,
  so verify via SSR HTML + action POSTs + `psql` state checks.
- Client-only UI (dropdowns behind `useState`) does not appear in SSR HTML;
  assert on what SSR renders (badges, aria-labels) and on DB effects.
- Multi-statement `psql -c "INSERT ...; SELECT ..."` is one transaction — a
  failing SELECT silently rolls back the INSERT. Use separate `-c` flags.
- Seed test rows with a recognizable id prefix and delete them after.
