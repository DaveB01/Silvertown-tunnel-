# Silvertown Tunnel - Railway Deployment Guide

## One-Click Deploy (Easiest)

### Step 1: Push to GitHub
If not already done, push this repo to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/silvertown-tunnel.git
git push -u origin main
```

### Step 2: Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `silvertown-tunnel` repository

### Step 3: Add Services

Railway will auto-detect the project. You need to add:

#### A. PostgreSQL Database
- Click **"+ New"** → **"Database"** → **"PostgreSQL"**
- Railway auto-creates `DATABASE_URL`

#### B. Redis
- Click **"+ New"** → **"Database"** → **"Redis"**
- Railway auto-creates `REDIS_URL`

#### C. Backend Service
- Click **"+ New"** → **"GitHub Repo"** → Select repo
- Set **Root Directory**: `backend`
- Add environment variables:
  ```
  JWT_SECRET=<click "Generate" for random value>
  JWT_EXPIRES_IN=15m
  JWT_REFRESH_EXPIRES_IN=7d
  NODE_ENV=production
  PORT=3000
  ```
- Link the DATABASE_URL and REDIS_URL from the databases
- Set **Start Command**: `npm run db:migrate:prod && npm run start`

#### D. Frontend Service
- Click **"+ New"** → **"GitHub Repo"** → Select repo
- Set **Root Directory**: `web`
- Add environment variable:
  ```
  NEXT_PUBLIC_API_URL=https://<backend-service-name>.railway.app/v1
  ```
  (Get the backend URL from the backend service's Settings → Domains)

### Step 4: Generate Domain

For each service, go to **Settings** → **Domains** → **Generate Domain**

You'll get URLs like:
- Backend: `silvertown-api-production.up.railway.app`
- Frontend: `silvertown-web-production.up.railway.app`

### Step 5: Seed the Database (First Time Only)

In the Railway dashboard, go to the Backend service and open the **Shell**:
```bash
npm run db:seed
```

This creates the admin user and sample data.

---

## Default Login Credentials

After seeding:
- **Email**: `admin@infratec.co.uk`
- **Password**: `admin123`

---

## Estimated Costs

| Service | Railway Estimate |
|---------|-----------------|
| Backend | ~$5/month |
| Frontend | ~$5/month |
| PostgreSQL | ~$5/month |
| Redis | ~$5/month |
| **Total** | **~$20/month** |

Railway offers $5 free credits monthly, so initial testing is essentially free.

---

## Troubleshooting

### Backend not starting
- Check logs in Railway dashboard
- Ensure DATABASE_URL and REDIS_URL are linked
- Run `npm run db:migrate:prod` in the shell

### Frontend can't connect to API
- Verify `NEXT_PUBLIC_API_URL` is set correctly
- Check backend is running and has a domain
- Ensure CORS_ORIGINS in backend includes frontend URL

### Database issues
- Use Railway's built-in database viewer
- Or run `npm run db:studio` in backend shell
