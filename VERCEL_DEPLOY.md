# Vercel Deployment Guide

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial Next.js setup with OAuth"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## 2. Deploy to Vercel

1. Go to https://vercel.com
2. Click **Add New → Project**
3. Import your GitHub repository
4. Vercel will auto-detect Next.js settings
5. Click **Deploy**

## 3. Add Vercel Postgres

1. In your Vercel project dashboard, go to **Storage** tab
2. Click **Create Database** → **Postgres**
3. Follow prompts to create database
4. Vercel automatically adds these env vars:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`
   - `POSTGRES_HOST`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DATABASE`

## 4. Set Environment Variables

Go to **Settings → Environment Variables** and add:

```
AUTH_SECRET=<generate with: openssl rand -base64 32>
GOOGLE_CLIENT_ID=777017239084-c8guejgpv0chkeotv1jfv08r3ukl2909.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-secret>
DISCORD_CLIENT_ID=1476424252403089468
DISCORD_CLIENT_SECRET=<your-NEW-secret>
NEXTAUTH_URL=https://devdock.cc
```

**IMPORTANT**: Generate a NEW Discord secret (revoke the old one you posted).

## 5. Update OAuth Redirect URLs

### Google Console
- Add: `https://devdock.cc/api/auth/callback/google`

### Discord Developer Portal
- Add: `https://devdock.cc/api/auth/callback/discord`

## 6. Initialize Database

After deployment, visit:
```
https://devdock.cc/api/init
```

This creates the database tables.

## 7. Add Custom Domain

1. In Vercel project → **Settings → Domains**
2. Add `devdock.cc`
3. Update your DNS:
   - Type: `CNAME`
   - Name: `@` (or `www`)
   - Value: `cname.vercel-dns.com`

## Local Development

1. Copy `.env.local.example` to `.env.local`
2. Fill in all values
3. For local OAuth, add to OAuth providers:
   - Google: `http://localhost:3000/api/auth/callback/google`
   - Discord: `http://localhost:3000/api/auth/callback/discord`
4. Run:
```bash
npm install
npm run dev
```

## Files to Upload

Upload these to Vercel (via GitHub):
- `package.json`
- `next.config.js`
- `tsconfig.json`
- `.env.local.example` (template only)
- `middleware.ts`
- `lib/` folder
- `app/` folder
- `components/` folder
- `public/AssetImages/` (your existing images)
- All CSS files (move to `public/` or `app/`)
