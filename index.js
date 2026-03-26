import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApplicationSubmission } from './application-handler.js';
import updateProfileHandler from './api/update-profile.js';

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

app.post('/api/applications', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload?.applicationType || !payload?.discordUsername || !payload?.devdockUsername || !payload?.email) {
      return res.status(400).json({ error: 'applicationType, discordUsername, devdockUsername, and email are required' });
    }

    const appRecord = await handleApplicationSubmission(payload);
    return res.status(201).json({ success: true, applicationId: appRecord.id });
  } catch (error) {
    console.error('Application route error:', error);
    return res.status(500).json({ error: 'Internal Server error' });
  }
});

app.post('/api/update-profile', (req, res) => updateProfileHandler(req, res));

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

