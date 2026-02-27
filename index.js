import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files (HTML, CSS, JS, images, etc.)
app.use(express.static(__dirname, { 
  extensions: ['html', 'htm'],
  maxAge: '1h'
}));

// API routes
app.use('/api/', (req, res, next) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// For direct file requests (.html files), serve them
app.get('*.html', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).sendFile(path.join(__dirname, 'opening-page.html'));
  }
});

// Catch-all: serve opening page only for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'opening-page.html'));
});

export default app;
