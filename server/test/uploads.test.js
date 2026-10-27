import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { Attachment } from '../src/models/Attachment.js';
import { cleanupOrphanAttachments } from '../src/routes/attachments.js';
import { createUser, directConversation, PNG_1x1, startServer } from './helpers.js';

let server;
let alice;
let bob;
let mallory;
let conv;
let base;

const upload = (who, buffer, filename = 'pic.png', contentType = 'image/png', convId = conv.id) =>
  who.agent.post(`/api/conversations/${convId}/attachments`).attach('image', buffer, { filename, contentType });

before(async () => {
  server = await startServer();
  [alice, bob, mallory] = await Promise.all(['Alice', 'Bob', 'Mallory'].map((n) => createUser(server, n)));
  conv = await directConversation(alice, bob);
  base = `/api/conversations/${conv.id}`;
});
after(async () => {
  await server.stop();
});

describe('upload validation', () => {
  test('accepts a real PNG and stores it outside any public directory', async () => {
    const res = await upload(alice, PNG_1x1);
    assert.equal(res.status, 201);
    assert.equal(res.body.attachment.type, 'image/png');
    assert.equal(res.body.attachment.size, PNG_1x1.length);
    assert.match(res.body.attachment.url, /^\/api\/attachments\/[a-f0-9]{24}$/);
    const doc = await Attachment.findById(res.body.attachment.id);
    assert.ok(fs.existsSync(path.join(server.config.uploadDir, doc.storageKey)));
  });

  test('rejects disallowed types, spoofed content and oversized files', async () => {
    const txt = await upload(alice, Buffer.from('hello'), 'notes.txt', 'text/plain');
    assert.equal(txt.status, 415);

    const spoofed = await upload(alice, Buffer.from('MZ this is really an exe file....'), 'evil.png', 'image/png');
    assert.equal(spoofed.status, 415);
    assert.match(spoofed.body.error, /valid/);

    const big = Buffer.concat([PNG_1x1, Buffer.alloc(server.config.maxUploadBytes + 10)]);
    const tooBig = await upload(alice, big);
    assert.equal(tooBig.status, 413);

    const none = await alice.agent.post(`${base}/attachments`);
    assert.equal(none.status, 400);
  });

  test('outsiders and logged-out users cannot upload', async () => {
    assert.equal((await upload(mallory, PNG_1x1)).status, 404);
    const anon = await request(server.httpServer)
      .post(`${base}/attachments`)
      .attach('image', PNG_1x1, { filename: 'p.png', contentType: 'image/png' });
    assert.equal(anon.status, 401);
  });
});

describe('image messages and access control', () => {
  test('image + caption message is viewable by members only', async () => {
    const att = (await upload(alice, PNG_1x1)).body.attachment;
    const sent = await alice.agent
      .post(`${base}/messages`)
      .send({ clientId: 'img-1', text: 'look', attachmentId: att.id });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.message.image.id, att.id);
    assert.equal(sent.body.message.text, 'look');

    const asBob = await bob.agent.get(att.url).buffer(true);
    assert.equal(asBob.status, 200);
    assert.equal(asBob.headers['content-type'], 'image/png');
    assert.equal(asBob.headers['x-content-type-options'], 'nosniff');
    assert.ok(Buffer.compare(asBob.body, PNG_1x1) === 0);

    assert.equal((await mallory.agent.get(att.url)).status, 404);
    assert.equal((await request(server.httpServer).get(att.url)).status, 401);

    // Must revalidate (so revoked access/deletes take effect), with cheap 304s.
    assert.equal(asBob.headers['cache-control'], 'private, no-cache');
    const revalidated = await bob.agent.get(att.url).set('If-None-Match', asBob.headers.etag);
    assert.equal(revalidated.status, 304);
  });

  test('an image-only message (no caption) is allowed', async () => {
    const att = (await upload(alice, PNG_1x1)).body.attachment;
    const sent = await alice.agent.post(`${base}/messages`).send({ clientId: 'img-2', attachmentId: att.id });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.message.text, '');
  });

  test('unsent uploads are private to the uploader; attachments cannot be reused or stolen', async () => {
    const att = (await upload(alice, PNG_1x1)).body.attachment;
    assert.equal((await bob.agent.get(att.url)).status, 404);

    // Bob can't send Alice's upload as his own.
    assert.equal(
      (await bob.agent.post(`${base}/messages`).send({ clientId: 'steal', attachmentId: att.id })).status,
      400
    );
    await alice.agent.post(`${base}/messages`).send({ clientId: 'use-1', attachmentId: att.id });
    assert.equal(
      (await alice.agent.post(`${base}/messages`).send({ clientId: 'use-2', attachmentId: att.id })).status,
      400
    );

    // An upload made in one conversation can't be sent into another.
    const other = await directConversation(alice, mallory);
    const att2 = (await upload(alice, PNG_1x1)).body.attachment;
    assert.equal(
      (await alice.agent.post(`/api/conversations/${other.id}/messages`).send({ clientId: 'x-conv', attachmentId: att2.id })).status,
      400
    );
  });

  test('deleting the message deletes the stored file', async () => {
    const att = (await upload(alice, PNG_1x1)).body.attachment;
    const msg = (await alice.agent.post(`${base}/messages`).send({ clientId: 'del-img', attachmentId: att.id })).body.message;
    const { storageKey } = await Attachment.findById(att.id).lean();
    const filePath = path.join(server.config.uploadDir, storageKey);
    assert.ok(fs.existsSync(filePath));

    const cached = await bob.agent.get(att.url);
    await alice.agent.delete(`/api/messages/${msg.id}`);
    assert.equal(fs.existsSync(filePath), false);
    // A browser revalidating its cached copy is told it's gone.
    assert.equal((await bob.agent.get(att.url).set('If-None-Match', cached.headers.etag)).status, 404);
    assert.equal(await Attachment.countDocuments({ _id: att.id }), 0);
    assert.equal((await bob.agent.get(att.url)).status, 404);
  });

  test('orphaned uploads are cleaned up', async () => {
    const att = (await upload(alice, PNG_1x1)).body.attachment;
    const removed = await cleanupOrphanAttachments(server.storage, -1000);
    assert.ok(removed >= 1);
    assert.equal(await Attachment.countDocuments({ _id: att.id }), 0);
  });
});
