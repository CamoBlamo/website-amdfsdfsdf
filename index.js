import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApplicationSubmission } from './application-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '1mb' }));

// Serve all static files
app.use(express.static(__dirname));

import { handleApplicationSubmission } from './application-handler.js';

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

