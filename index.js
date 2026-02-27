import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files
app.use(express.static(__dirname));

// All actual request handling is done through /api routes
// This app just serves static files and API routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'opening-page.html'));
});

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else {
    res.status(404).sendFile(path.join(__dirname, 'opening-page.html'));
  }
});

export default app;
