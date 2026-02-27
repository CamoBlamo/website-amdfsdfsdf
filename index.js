// Minimal entrypoint for Vercel
// All actual request handling is done through /api routes

export default function handler(req, res) {
  res.status(404).json({ error: 'Not Found' });
}
