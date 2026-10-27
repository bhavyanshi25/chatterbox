import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createUser, directConversation, startServer, testConfig } from './helpers.js';

test('conversations and messages survive a full server restart', async () => {
  const config = testConfig();
  let server = await startServer(config);
  const alice = await createUser(server, 'Pat');
  const bob = await createUser(server, 'Quinn');
  const dm = await directConversation(alice, bob);
  await alice.agent.post(`/api/conversations/${dm.id}/messages`).send({ clientId: 'keep-1', text: 'still here?' });
  await server.stop({ keepData: true });

  // New process-equivalent: fresh HTTP server, fresh DB connection, same
  // database. The old cookie still authenticates and history is intact.
  server = await startServer(config);
  try {
    const res = await request(server.httpServer)
      .get(`/api/conversations/${dm.id}/messages`)
      .set('Cookie', bob.cookie);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.messages.map((m) => m.text), ['still here?']);

    const list = await request(server.httpServer).get('/api/conversations').set('Cookie', bob.cookie);
    assert.equal(list.body.conversations[0].unreadCount, 1);
  } finally {
    await server.stop();
  }
});
