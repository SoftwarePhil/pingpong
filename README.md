# 🏓 Ping Pong Tracker

Match, player, tournament, and stats tracker for office ping pong. Built with Next.js, Redis, and MongoDB.

## Features

- **Players** — add players, manage optional profiles, and view per-player stats and match history
- **Tournaments** — create round-robin + bracket tournaments, advance rounds, track results
- **Stats** — leaderboard with win rate, games played, points per game
- **Live bracket** — bracket view with fireworks celebration on completion

## Getting Started

### Prerequisites

Both Redis and MongoDB are required. Start them with Docker Compose:

```bash
npm run db:start    # Start both Redis and MongoDB
npm run db:stop     # Stop both

# Or individually:
npm run redis:start
npm run mongodb:start
```

### Configuration

Copy `.env.example` to `.env.local` and set your connection URLs:

```bash
# Redis (tournament state)
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@localhost:6379

# MongoDB (players + game history)
MONGODB_URL=mongodb://YOUR_MONGO_USER:YOUR_MONGO_PASSWORD@localhost:27017

# Secret used to sign admin sessions (required in production)
AUTH_SECRET=choose-a-long-random-secret

# Sign-in emails (optional locally: without a key the link is logged to the console)
RESEND_API_KEY=
EMAIL_FROM="Ping Pong <signin@pingpong.beer>"

# Base URL for sign-in links (optional: Vercel's URL is used when unset)
APP_URL=
```

The Docker Compose setup uses `REDIS_PASSWORD` (default `mypassword`) and `MONGO_USERNAME` / `MONGO_PASSWORD` (defaults `admin` / `mypassword`). Make sure the URLs in `.env.local` match.

### Authentication

- Visitors are `player` users by default and can view tournaments, results, brackets, history, and stats.
- Admins belong to one club and can record games, manage rosters and brackets, edit players, and run tournaments. **Owners** can also add and remove admins in **Settings → Admins**.
- Admins sign in with an emailed link: **Settings → Sign in as admin**, enter your email, and open the link. It works once, for 15 minutes. Links are sent with [Resend](https://resend.com) and requests are rate-limited.
- Signing in starts a signed, HTTP-only session cookie that lasts 90 days. The admin's account is checked on every request, so removing an admin signs them out everywhere.

Set `AUTH_SECRET` to a long, random value in deployed environments; changing it signs everyone out. Never commit `.env.local`.

Add the first owner, and get a sign-in link without email if it ever breaks, with `scripts/admins.mjs`:

```bash
npm run admins -- add --env development --email you@example.com --name "You" --role owner
npm run admins -- link --env development --email you@example.com --url http://localhost:3000
npm run admins -- list --env development
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data Architecture — Hybrid Redis + MongoDB

The application uses **two stores in parallel**, each optimised for its access pattern:

| Store | Holds | Why |
|---|---|---|
| **Redis** | Active tournaments (with embedded matches/games), match index | Sub-millisecond reads/writes for live tournament state |
| **MongoDB** | Player profiles, complete game history | Durable, disk-backed; survives Redis restarts; powers historical stats |

### How it works

- **Tournaments** live entirely in Redis. Every bracket mutation — recording a game, advancing a round — is a single atomic `SET` on the tournament JSON document.
- **Players** are stored in MongoDB. Their `tournamentIds` list is updated whenever they join a new tournament, but doesn't need Redis speed.
- **Games** are written to both: embedded inside the tournament document in Redis (for live match state) and as individual documents in MongoDB's `games` collection (for permanent history). `getAllGames()` and the stats API read from MongoDB.
- **Match index** lives in Redis as a hash (`matchId → tournamentId`), rebuilt automatically on startup, giving O(1) match lookups without scanning all tournaments.

See [docs/hybrid-storage-architecture.md](docs/hybrid-storage-architecture.md) for full schema details.

## Clubs migration

Every player, tournament and game belongs to a club. Records created before clubs existed are moved into the first club, `dallas`, by a one-off script. It is a dry run unless you pass `--apply`, and running it again is safe.

1. Deploy the code first. It treats records without a `clubId` as part of `dallas`, so the site works before and after the migration.
2. Export a backup: **Settings → Export all data**.
3. Dry run, then apply, naming the environment explicitly:

```bash
npm run migrate:clubs -- --env production
npm run migrate:clubs -- --env production --apply
```

The script creates the club, deletes games left behind by deleted tournaments or matches, sets `clubId` everywhere, and adds the indexes.

## Switching production to sign-in links

Admin sign-in moved from a shared `ADMIN_PASSWORD` to emailed links. Once this code is deployed the password stops working, so do these steps **before** deploying, or nobody will be able to sign in:

1. **Resend:** verify the sending domain (`pingpong.beer`) by adding the DNS records Resend lists. Then add `RESEND_API_KEY` in Vercel, using separate keys for Production and Preview. Set `EMAIL_FROM` if you don't want `Ping Pong <signin@pingpong.beer>`.
2. **`AUTH_SECRET`:** make sure it is set in Vercel to a long random value. Production refuses admin sign-in without it (the old code fell back to `ADMIN_PASSWORD`).
3. **First owner:** add yourself. This is safe to do before deploying, because the current code ignores the admins list.

   ```bash
   npm run admins -- add --env production --email you@example.com --name "Your Name" --role owner
   ```

4. **Deploy.** Existing admin sessions end, so everyone signs in once with a link. Then delete `ADMIN_PASSWORD` from Vercel.

If email isn't working, print a single-use sign-in link instead:

```bash
npm run admins -- link --env production --email you@example.com --url https://pingpong.beer
```

## Docs

| File | Description |
|------|-------------|
| [docs/hybrid-storage-architecture.md](docs/hybrid-storage-architecture.md) | Hybrid Redis + MongoDB architecture and data flow |
| [docs/hybrid-schema-clarification.md](docs/hybrid-schema-clarification.md) | Embedded vs. separate match storage trade-offs |
| [docs/bracket-requirements.md](docs/bracket-requirements.md) | Bracket tournament rules and format |
| [docs/player-stats-clarification.md](docs/player-stats-clarification.md) | How player stats are calculated |
| [docs/player-page-stats-solution.md](docs/player-page-stats-solution.md) | Player page stats implementation notes |
