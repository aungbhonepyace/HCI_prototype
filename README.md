# GroupFinder Prototype

Responsive university team formation prototype built with React, Vite, TypeScript, React Router, and Tailwind CSS. The app is fully local-first and persists all demo state in `localStorage`.

## Setup

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

### Demo accounts

- Shared password for all seeded accounts: `GroupFinder123!`
- Use the matching login role toggle:
  - student emails with `Login as Student`
  - admin emails with `Login as Admin`

Students:

- `priya.nair@groupfinder.edu`
- `lucas.reed@groupfinder.edu`
- `zoe.martinez@groupfinder.edu`
- `marcus.chen@groupfinder.edu`
- `samira.ali@groupfinder.edu`
- `aisha.khan@groupfinder.edu`
- `daniel.wu@groupfinder.edu`
- `nora.patel@groupfinder.edu`
- `ethan.brooks@groupfinder.edu`
- `mei.lin@groupfinder.edu`

Admins:

- `mina.hart@groupfinder.edu`
- `elijah.park@groupfinder.edu`

The seeded demo join code is `GF-MOBIL-7X3A`.

## Debug hooks

For presentation shortcuts, open the browser devtools console and use `window.gfDebug`.

Quick overview:

```js
window.gfDebug.help()
```

Available hooks:

```js
window.gfDebug.demoAccounts()
```

- Returns all seeded student/admin emails and the shared password.

```js
window.gfDebug.inspectSession()
```

- Shows the current logged-in user, role, active project, active team, and volunteer state.

```js
window.gfDebug.inspectProject()
window.gfDebug.inspectProject("project_mobility")
```

- Shows project settings, overflow state, confirmed teams, unmatched members, and proposals.

```js
window.gfDebug.forceAiProposal()
window.gfDebug.forceAiProposal("project_mobility")
```

- Builds an AI suggestion from the current student’s saved matching profile and creates a proposal immediately.

```js
window.gfDebug.acceptAllPendingProposal()
window.gfDebug.acceptAllPendingProposal("proposal_xxx")
```

- Accepts every pending member on the active proposal and confirms the team if enough members are present.

```js
window.gfDebug.declinePendingProposal()
window.gfDebug.declinePendingProposal("proposal_xxx")
window.gfDebug.declinePendingProposal("proposal_xxx", "student_zoe")
```

- Forces one pending proposal member to decline so refill behavior can be demonstrated.

```js
window.gfDebug.inspectQueue()
window.gfDebug.forceQueueMatch()
window.gfDebug.forceQueueMatch("project_mobility")
```

- Inspects the current Lucky Draw queue session or forces it to resolve immediately.

```js
window.gfDebug.meetingVoteAllYes()
window.gfDebug.meetingVoteAllYes("team_xxx")
window.gfDebug.meetingVoteAllYes("team_xxx", "meeting_xxx")
window.gfDebug.meetingVoteAllNo()
window.gfDebug.meetingVoteAllNo("team_xxx")
```

- Forces all team members to support one meeting option, or clears all meeting votes to simulate a full rejection.

```js
window.gfDebug.setVolunteer(true)
window.gfDebug.setVolunteer(false)
```

- Toggles Flex volunteer for the current logged-in student.

```js
window.gfDebug.finalizeOverflow()
window.gfDebug.finalizeOverflow("project_mobility")
```

- Forces overflow placement/finalization immediately for the resolved project.

```js
window.gfDebug.resetDemoData()
```

- Clears local demo state and reseeds the prototype.

## What’s included

- Public login entry and mock email verification login
- Student dashboard, join, profile, match picker, AI chat flow, AI team proposals, queue flow, team workspace, notifications, and report form
- Admin dashboard, classes, project setup with join codes, overflow policy controls, report moderation console, and student roster
- Transparent profiles with verified badges
- Mutual-confirmation AI proposals with expiry, hold-and-refill behavior, and proposal notifications
- Flex volunteer overflow handling for uneven class sizes, with deadline finalization
- Local chat, editable to-do lists, meeting voting, and moderation actions that persist after refresh

## Architecture note

### Routes

- Public: `/`, `/login`
- Student: `/student/dashboard`, `/student/join`, `/student/profile`, `/student/match`, `/student/match/ai`, `/student/match/ai/result`, `/student/proposals`, `/student/proposals/:id`, `/student/match/queue/roles`, `/student/match/queue/constraints`, `/student/match/queue/status`, `/student/match/queue/match`, `/student/team`, `/student/notifications`, `/student/report`
- Admin: `/admin`, `/admin/classes`, `/admin/classes/:id/projects`, `/admin/reports`, `/admin/students`

### State and storage

The app seeds demo data on first load and writes each collection to a dedicated `localStorage` key:

- `gf_auth`: current session user id and role
- `gf_users`: admin and student accounts, verification, profile, moderation flags
- `gf_classes`: class records
- `gf_projects`: project records with role templates, team size, deadlines, join code
- `gf_project_settings`: per-project team size and proposal expiry settings
- `gf_overflow_state`: per-project overflow slots, placed overflow members, forced placements, and deadline finalization
- `gf_memberships`: user to class/project membership, matching state, and confirmed team assignment
- `gf_ai_sessions`: AI questionnaire answers, last result, rematch history
- `gf_queue_sessions`: role queue choices, constraints, elapsed queue time, queue state, requeue count
- `gf_team_proposals`: AI proposal records, member statuses, locked accepted members, and refill state
- `gf_teams`: confirmed team rosters, roles, creation mode/source, meeting vote options, and overflow metadata
- `gf_team_chat`: team chat buckets
- `gf_team_tasks`: per-team to-do list buckets
- `gf_notifications`: per-user notifications with typed proposal and team events
- `gf_reports`: submitted reports, context, status, and audit log

The main state container lives in [`src/lib/app-context.tsx`](/Users/aungbhonepyae/lab/hci/prototype/src/lib/app-context.tsx). Storage seeding and persistence live in [`src/lib/storage.ts`](/Users/aungbhonepyae/lab/hci/prototype/src/lib/storage.ts).

### Matching logic

AI Chat Matcher:

- Runs a finite-state scripted questionnaire for role preference, skills, availability, goal level, and working style
- Builds a deterministic roster from active project members in `localStorage`
- Scores candidates using skill overlap, schedule overlap, goal alignment, working style, and role fit
- Rematch rotates through the ranked candidate pool and stores history in `gf_ai_sessions`
- Propose Team creates a `gf_team_proposals` record instead of creating a team immediately
- The initiator is auto-accepted, invited members get proposal notifications, and the roster confirms only after mutual acceptance
- If anyone declines, accepted members stay locked together while the app refills open slots from eligible classmates until the proposal confirms or expires
- Once an AI proposal confirms at the normal team size, the overflow engine can append one volunteer as the `+1` member if the project still has allowed overflow capacity

Lucky Draw Role Queue:

- Saves primary role, optional secondary role, and constraints
- Simulates queue wait time with a local elapsed timer that stops when a match is found
- Builds a deterministic roster weighted by requested role coverage and constraint fit
- Re-queue increments the session and produces a different draw
- After a queue team confirms, the same overflow engine can attach a volunteer as the extra member when overflow is allowed

Overflow policy:

- Each project can allow `overflowTeamsAllowed` teams to grow from `teamSize` to `teamSize + 1`
- Students can opt in as `Flex volunteer` from the profile page
- Volunteers are considered first for overflow placement, ordered by the time they enabled volunteering
- Availability overlap is treated as the hard constraint for overflow placement; goal/style are softened
- On app load and every minute, the frontend checks `formationDeadline`
- If the deadline has passed and `forceOverflowAtDeadline` is enabled, remaining unmatched students can be force-placed into the remaining allowed overflow slots and notified

Lucky Draw still creates a team immediately. Confirmed AI proposals create the final team, a seeded to-do list, a seeded system chat message, notifications, and a persistent workspace. Overflow placements happen only after those teams are confirmed.

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
