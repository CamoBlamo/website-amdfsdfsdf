import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files (HTML, CSS, JS, images, etc.)
app.use(express.static(__dirname));

// 404 handler for non-existent routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

export default app;

