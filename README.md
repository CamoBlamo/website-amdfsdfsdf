# Local development server

This project now includes a minimal Express backend for local testing.

Features
- Signup and login with password hashing (bcrypt)
- SQLite-backed user store (`users.db`)
- Migration from legacy `users.json` if present (moved to `users.json.bak`)
- Session-based authentication (in-memory session store for demo)
- Protected `mainpage.html` (requires login)

Run locally

1. Install dependencies

```powershell
npm install
```

2. Start server

```powershell
npm start
# or run on a specific port:
$env:PORT=3010; node server.js
```

3. Open pages
- Signup: http://localhost:3000/signup.html
- Login: http://localhost:3000/login.html

Notes
- This setup is for local development/demo only. For production, use a persistent session store and a managed database.
- If you want me to add sessions stored in SQLite, or switch to a different DB, I can update it.
 
Production checklist
- Set `SESSION_SECRET` in environment (strong random value).
- Run behind a reverse proxy (nginx) and enable `TRUST_PROXY=true`.
- Use managed DB for scalability (Postgres recommended) and update `server.js` accordingly.
- Use HTTPS termination at the proxy or provide SSL cert paths to enable HTTPS in Node (not recommended for scale).
- Use a persistent session store (Redis) for multi-instance deployments.

Docker
1. Build image:
```bash
docker build -t dev-mgmt-page:latest .
```
2. Run container:
```bash
docker run -p 3000:3000 -e SESSION_SECRET=supersecret dev-mgmt-page:latest
```
