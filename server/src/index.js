import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { cleanupOrphanAttachments } from './routes/attachments.js';

const config = loadConfig();
const server = await createServer(config);

server.httpServer.listen(config.port, () => {
  console.log(`ChatterBox API listening on http://localhost:${config.port}`);
});

const cleanupTimer = setInterval(() => {
  cleanupOrphanAttachments(server.storage).catch((err) => console.error('Attachment cleanup failed', err));
}, 15 * 60 * 1000);
cleanupTimer.unref();

async function shutdown(signal) {
  console.log(`${signal} received, shutting down…`);
  clearInterval(cleanupTimer);
  await server.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
