# DevDock - Prisma Postgres Setup Guide

## Prerequisites
- GitHub account
- Vercel account
- PostgreSQL database (Vercel Postgres or any provider)

## Step 1: Set up PostgreSQL Database

### Option A: Vercel Postgres (Recommended)
1. Go to your Vercel dashboard
2. Create a new Postgres database
3. Copy the `DATABASE_URL` connection string

### Option B: Any PostgreSQL Provider
Use any PostgreSQL provider (Supabase, Railway, Neon, etc.) and get the connection string.

## Step 2: Configure Environment Variables in Vercel

Go to your Vercel project settings → Environment Variables and add:

```
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public&sslmode=require

GOOGLE_CLIENT_ID=777017239084-c8guejgpv0chkeotv1jfv08r3ukl2909.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

DISCORD_CLIENT_ID=1476424252403089468
DISCORD_CLIENT_SECRET=your-discord-client-secret

SITE_URL=https://devdock.cc
```

## Step 3: Update OAuth Redirect URLs

### Google OAuth Console
1. Go to https://console.cloud.google.com/apis/credentials
2. Edit your OAuth 2.0 Client ID
3. Add authorized redirect URI:
   ```
   https://devdock.cc/api/auth/google/callback
   ```

### Discord Developer Portal
1. Go to https://discord.com/developers/applications
2. Select your application
3. Go to OAuth2 → Redirects
4. Add redirect:
   ```
   https://devdock.cc/api/auth/discord/callback
   ```

## Step 4: Deploy to Vercel

### Via GitHub (Recommended)
1. Push your code to GitHub
2. Import project in Vercel
3. Vercel will automatically:
   - Install dependencies
   - Run `prisma generate`
   - Run `prisma migrate deploy` (creates database tables)
   - Deploy your site

### Manual Deployment
```bash
npm install -g vercel
vercel --prod
```

## Step 5: Initialize Database (First Time Only)

After first deployment, Prisma will automatically create the tables based on your schema.

## Testing OAuth Login

1. Visit https://devdock.cc/login.html
2. Click "Sign in with Google" or "Sign in with Discord"
3. Complete OAuth flow
4. You'll be redirected to developerspaces.html
5. Check browser console for auth token

## Prisma Commands

### Generate Prisma Client (auto-runs on install)
```bash
npx prisma generate
```

### Create a migration (for schema changes)
```bash
npx prisma migrate dev --name your_migration_name
```

### Deploy migrations to production
```bash
npx prisma migrate deploy
```

### View your database in Prisma Studio
```bash
npx prisma studio
```

## Architecture Overview

### Authentication Flow
1. User clicks OAuth button → `/api/auth/{provider}.js`
2. Redirects to Google/Discord → User authorizes
3. Callback → `/api/auth/{provider}-callback.js`
4. Creates/finds user in database using Prisma
5. Sets session cookie and redirects to developerspaces.html

### API Endpoints
- `GET /api/workspaces.js` - List user's workspaces
- `POST /api/workspaces.js` - Create new workspace

### Database (Prisma + PostgreSQL)
- **Users table**: OAuth user data (Google/Discord)
- **Workspaces table**: User workspaces with cascade delete

### Client-Side Auth
- `/auth-client.js` - Helper functions for authenticated API calls
- Session stored in httpOnly cookie + localStorage

## Troubleshooting

### "Prisma Client not initialized"
Run: `npx prisma generate`

### Database connection errors
1. Check `DATABASE_URL` is correct in Vercel env vars
2. Ensure `?schema=public&sslmode=require` is in connection string
3. Verify database is accessible from Vercel's network

### OAuth errors
1. Check redirect URLs match exactly (including https://)
2. Verify client IDs and secrets are correct
3. Check browser console for detailed error messages

### Migrations not running
Vercel runs `prisma migrate deploy` automatically. If it fails:
1. Check Vercel build logs
2. Manually run migrations locally with production DATABASE_URL

## File Structure

```
api/
  db.js                    # Prisma database functions
  auth.js                  # OAuth helper functions
  auth-google.js           # Google OAuth initiation
  auth-google-callback.js  # Google OAuth callback
  auth-discord.js          # Discord OAuth initiation
  auth-discord-callback.js # Discord OAuth callback
  workspaces.js           # Workspace API (protected)

prisma/
  schema.prisma           # Database schema

auth-client.js            # Client-side auth utilities
login.html                # OAuth login page
```

## Next Steps

1. Update developerspaces.html to fetch workspaces from API
2. Update workspacecreate.html to use createWorkspace() API
3. Add logout functionality
4. Add profile page with user info
