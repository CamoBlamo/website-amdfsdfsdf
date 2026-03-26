import 'dotenv/config';
import app from './index.js';

const port = Number(process.env.PORT || 3000);

const server = app.listen(port, () => {
  console.log(`DevDock server listening on port ${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
