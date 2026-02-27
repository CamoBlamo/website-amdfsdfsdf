import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve all static files
app.use(express.static(__dirname));

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

