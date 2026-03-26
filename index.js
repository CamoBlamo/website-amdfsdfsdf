import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import adminHandler from './api/admin.js';
import announcementsHandler from './api/announcements.js';
import applicationsHandler from './api/applications.js';
import healthHandler from './api/health.js';
import meHandler from './api/me.js';
import oauthHandler from './api/oauth.js';
import ticketsHandler from './api/tickets.js';
import updateProfileHandler from './api/update-profile.js';
import workspaceStateHandler from './api/workspace-state.js';
import workspacesHandler from './api/workspaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Serve all static files
app.use(express.static(__dirname));

// Local equivalents of Vercel rewrites used by the frontend auth and announcements flow.
app.all('/api/auth-google', (req, res) => {
  req.query = { ...(req.query || {}), provider: 'google' };
  return oauthHandler(req, res);
});

app.all('/api/auth-google-callback', (req, res) => {
  req.query = { ...(req.query || {}), provider: 'google', phase: 'callback' };
  return oauthHandler(req, res);
});

app.all('/api/announcements/latest', (req, res) => {
  req.query = { ...(req.query || {}), mode: 'latest' };
  return announcementsHandler(req, res);
});

app.all('/api/announcements/:id/seen', (req, res) => {
  req.query = { ...(req.query || {}), mode: 'seen', id: req.params.id };
  return announcementsHandler(req, res);
});

app.all('/api/admin', (req, res) => adminHandler(req, res));
app.all('/api/announcements', (req, res) => announcementsHandler(req, res));
app.all('/api/applications', (req, res) => applicationsHandler(req, res));
app.all('/api/health', (req, res) => healthHandler(req, res));
app.all('/api/me', (req, res) => meHandler(req, res));
app.all('/api/oauth', (req, res) => oauthHandler(req, res));
app.all('/api/tickets', (req, res) => ticketsHandler(req, res));
app.all('/api/update-profile', (req, res) => updateProfileHandler(req, res));
app.all('/api/workspace-state', (req, res) => workspaceStateHandler(req, res));
app.all('/api/workspaces', (req, res) => workspacesHandler(req, res));

// Explicitly serve HTML files by name
app.get('/:file.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, `${req.params.file}.html`));
});

// Explicitly serve JS files by name
app.get('/:file.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, `${req.params.file}.js`));
});

// Explicitly serve CSS files by name
app.get('/:file.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(path.join(__dirname, `${req.params.file}.css`));
});

// Serve index.html at root
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve favicon silently
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

export default app;

