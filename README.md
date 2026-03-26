# GroupFinder Prototype

Responsive university team formation prototype built with React, Vite, TypeScript, React Router, and Tailwind CSS. The app is fully local-first and persists all demo state in `localStorage`.

## Setup

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

### Demo accounts

- Student: `priya.nair@groupfinder.edu`
- Student: `lucas.reed@groupfinder.edu`
- Student: `zoe.martinez@groupfinder.edu`
- Admin: `mina.hart@groupfinder.edu`

The seeded demo join code is `GF-MOBIL-7X3A`.

## What’s included

- Public landing and mock email verification login
- Student dashboard, join, profile, match picker, AI chat flow, queue flow, team workspace, notifications, and report form
- Admin dashboard, classes, project setup with join codes, report moderation console, and student roster
- Transparent profiles with verified badges
- Local chat, starter tasks, meeting selection, and moderation actions that persist after refresh

## Architecture note

### Routes

- Public: `/`, `/login`
- Student: `/student/dashboard`, `/student/join`, `/student/profile`, `/student/match`, `/student/match/ai`, `/student/match/ai/result`, `/student/match/queue/roles`, `/student/match/queue/constraints`, `/student/match/queue/status`, `/student/match/queue/match`, `/student/team`, `/student/notifications`, `/student/report`
- Admin: `/admin`, `/admin/classes`, `/admin/classes/:id/projects`, `/admin/reports`, `/admin/students`

### State and storage

The app seeds demo data on first load and writes each collection to a dedicated `localStorage` key:

- `gf_auth`: current session user id and role
- `gf_users`: admin and student accounts, verification, profile, moderation flags
- `gf_classes`: class records
- `gf_projects`: project records with role templates, team size, deadlines, join code
- `gf_memberships`: user to class/project membership and team assignment
- `gf_ai_sessions`: AI questionnaire answers, last result, rematch history
- `gf_queue_sessions`: role queue choices, constraints, ETA, queue state, requeue count
- `gf_teams`: accepted team rosters, roles, creation mode, meeting time
- `gf_team_chat`: team chat buckets
- `gf_team_tasks`: starter task buckets
- `gf_notifications`: per-user notifications
- `gf_reports`: submitted reports, context, status, and audit log

The main state container lives in [`src/lib/app-context.tsx`](/Users/aungbhonepyae/lab/hci/prototype/src/lib/app-context.tsx). Storage seeding and persistence live in [`src/lib/storage.ts`](/Users/aungbhonepyae/lab/hci/prototype/src/lib/storage.ts).

### Matching logic

AI Chat Matcher:

- Runs a finite-state scripted questionnaire for role preference, skills, availability, goal level, and working style
- Builds a deterministic roster from active project members in `localStorage`
- Scores candidates using skill overlap, schedule overlap, goal alignment, working style, and role fit
- Rematch rotates through the ranked candidate pool and stores history in `gf_ai_sessions`

Lucky Draw Role Queue:

- Saves primary role, optional secondary role, and constraints
- Simulates queue wait time with a local ETA countdown
- Builds a deterministic roster weighted by requested role coverage and constraint fit
- Re-queue increments the session and produces a different draw

Accepting either flow creates a team, starter tasks, notifications, and a persistent workspace.

## Project structure

- [`src/App.tsx`](/Users/aungbhonepyae/lab/hci/prototype/src/App.tsx): route tree
- [`src/components/layouts.tsx`](/Users/aungbhonepyae/lab/hci/prototype/src/components/layouts.tsx): student/admin shells and guards
- [`src/components/ui.tsx`](/Users/aungbhonepyae/lab/hci/prototype/src/components/ui.tsx): shared UI building blocks
- [`src/pages/student/pages.tsx`](/Users/aungbhonepyae/lab/hci/prototype/src/pages/student/pages.tsx): student flows
- [`src/pages/admin/pages.tsx`](/Users/aungbhonepyae/lab/hci/prototype/src/pages/admin/pages.tsx): admin flows
- [`src/lib/matching.ts`](/Users/aungbhonepyae/lab/hci/prototype/src/lib/matching.ts): deterministic matching and team creation helpers

## Notes

- No backend is used. Refresh-safe persistence is entirely local to the browser.
- Reports are non-anonymous in this prototype.
- If your local npm cache has permission issues, you can install with a temporary cache:

```bash
npm install --cache /tmp/npm-cache-groupfinder
```
