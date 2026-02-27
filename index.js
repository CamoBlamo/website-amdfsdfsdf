import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files (HTML, CSS, JS, images, etc.)
app.use(express.static(__dirname));

// Explicitly handle HTML file requests with proper headers
app.get('/:file.html', (req, res) => {
  const filePath = path.join(__dirname, req.params.file + '.html');
  if (fs.existsSync(filePath)) {
    res.type('text/html').sendFile(filePath);
  } else {
    res.status(404).type('text/html').send('<h1>404 - Page Not Found</h1>');
  }
});

// Handle nested paths like /path/to/file.html
app.get('/:path*/:file.html', (req, res) => {
  const fullPath = req.path;
  const filePath = path.join(__dirname, fullPath);
  if (fs.existsSync(filePath)) {
    res.type('text/html').sendFile(filePath);
  } else {
    res.status(404).type('text/html').send('<h1>404 - Page Not Found</h1>');
  }
});

// Catch 404s
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default app;

