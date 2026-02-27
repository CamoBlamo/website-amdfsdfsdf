import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve all static files
app.use(express.static(__dirname));

// Serve any HTML file explicitly
app.get('/:page.html', (req, res) => {
  res.sendFile(path.join(__dirname, `${req.params.page}.html`));
});

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve favicon silently
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

export default app;

