# Weekly Goal Tracker — freshman.academy

A weekly goal tracking system for students. Each student signs in with Google and
sets **up to 5 goals per week**. Every goal is broken into **subtasks**; checking
subtasks off drives the goal's **completion %** and the overall **week progress**.
Hit **Start new week** to archive the current week and begin a fresh one.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Prisma 7** + **PostgreSQL** (via the `@prisma/adapter-pg` driver adapter)
- **Auth.js / NextAuth v5** with **Google OAuth** (JWT sessions, Prisma adapter)

## Data model

```
User ──< Week ──< Goal ──< Subtask
```

- A `Week` has `isCurrent` (one active week per user) and start/end dates.
- A `Goal` has a title and a position (1–5).
- A `Subtask` has a title and `isDone`. Goal % = done / total subtasks.
- Auth.js manages `User`, `Account`, `Session`, `VerificationToken`.

## Setup

### 1. Install

```bash
npm install
```

### 2. PostgreSQL

Create a database and set the connection string. Local example:

```bash
createdb freshman_weekly
```

### 3. Environment variables

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

- `DATABASE_URL` — your Postgres connection string.
- `AUTH_SECRET` — generate with `npx auth secret`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from a Google OAuth client (next step).

### 4. Google OAuth credentials

1. Go to the [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth client ID** of type **Web application**.
3. Add the **Authorized redirect URI**:
   `http://localhost:3000/api/auth/callback/google`
4. Copy the client ID and secret into `.env`.

### 5. Migrate the database

```bash
npm run db:migrate
```

### 6. Run

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to sign in with Google, then
land on your weekly dashboard.

## Scripts

| Script               | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start the dev server                     |
| `npm run build`      | Production build                         |
| `npm start`          | Run the production build                 |
| `npm run db:migrate` | Create/apply Prisma migrations           |
| `npm run db:studio`  | Open Prisma Studio to inspect the data   |

## Project structure

```
prisma/schema.prisma            Data model
prisma.config.ts                Prisma 7 CLI config (datasource URL, migrations)
src/
  auth.config.ts                Edge-safe Auth.js config (providers, callbacks)
  auth.ts                       Full Auth.js instance (Prisma adapter)
  proxy.ts                      Route protection (Next 16 "proxy", was middleware)
  lib/prisma.ts                 PrismaClient singleton (pg driver adapter)
  lib/weeks.ts                  getOrCreateCurrentWeek, week bounds
  lib/progress.ts               Pure %-calculation helpers
  app/
    signin/page.tsx             Google sign-in screen
    api/auth/[...nextauth]/     Auth.js route handler
    dashboard/
      page.tsx                  Main weekly tracker
      actions.ts                Server actions (goals/subtasks/new week)
      _components/              GoalCard, ProfileMenu, WeekProgress, etc.
```

## Notes

- The Prisma Client is generated into `src/generated/prisma` (git-ignored) and
  regenerated on `postinstall`.
- Goals do not carry over between weeks by default — "Start new week" begins a
  clean slate and archives the previous week.
