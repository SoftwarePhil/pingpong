AI Slop from grok code fast, minimal human changes! Match/player/stats/tourment tracker for ping pong games

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

This application uses Redis for data storage. Start Redis using one of these methods:

**Using npm scripts:**
```bash
npm run redis:start  # Start Redis
npm run redis:stop   # Stop Redis
```

**Or using Docker Compose directly:**
```bash
docker compose up -d redis  # Start Redis
docker compose down         # Stop Redis
```

#### Redis Configuration

Redis connection settings are configured via environment variables in `.env.local`. Copy `.env.example` to `.env.local` and update the values:

```bash
# Local Redis (no password)
REDIS_URL=redis://localhost:6379

# Local Redis with password
REDIS_URL=redis://:mypassword@localhost:6379

# Remote Redis instance
REDIS_URL=redis://username:password@redis.example.com:6379/0
```

**Environment Variables:**
- `REDIS_URL`: Full Redis connection URL
- `REDIS_PASSWORD`: Password for Docker Compose Redis instance

The Docker Compose setup uses the `REDIS_PASSWORD` environment variable (defaults to `mypassword`). Update the `REDIS_URL` in `.env.local` to match your Redis setup.

### Running the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
