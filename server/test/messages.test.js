import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Message } from '../src/models/Message.js';
import { createUser, directConversation, startServer } from './helpers.js';

let server;
let alice;
let bob;
let conv;
let base;

const send = (who, body) => who.agent.post(`${base}/messages`).send(body);

before(async () => {
  server = await startServer();
  [alice, bob] = await Promise.all([createUser(server, 'Alice'), createUser(server, 'Bob')]);
  conv = await directConversation(alice, bob);
  base = `/api/conversations/${conv.id}`;
});
after(async () => {
  await server.stop();
});

describe('sending', () => {
  test('persists the message and returns it with a stable id', async () => {
    const res = await send(alice, { clientId: 'c-1', text: '  hello bob  ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.message.text, 'hello bob');
    assert.equal(res.body.message.senderId, alice.user.id);
    const stored = await Message.findById(res.body.message.id).lean();
    assert.equal(stored.text, 'hello bob');
  });

  test('is idempotent per clientId (retries do not duplicate)', async () => {
    const first = await send(alice, { clientId: 'c-dup', text: 'once' });
    const retry = await send(alice, { clientId: 'c-dup', text: 'once' });
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.duplicate, true);
    assert.equal(retry.body.message.id, first.body.message.id);
    assert.equal(await Message.countDocuments({ clientId: 'c-dup' }), 1);
  });

  test('rejects empty, oversized and malformed messages', async () => {
    assert.equal((await send(alice, { clientId: 'e-1', text: '   ' })).status, 400);
    assert.equal((await send(alice, { clientId: 'e-2', text: 'x'.repeat(4001) })).status, 400);
    assert.equal((await send(alice, { text: 'no client id' })).status, 400);
    assert.equal((await send(alice, { clientId: 'e-3', text: 'hi', replyToId: 'bad' })).status, 400);
  });

  test('stores a reply snapshot of the original message', async () => {
    const original = await send(bob, { clientId: 'r-orig', text: 'Are we still on for 3pm?' });
    const reply = await send(alice, { clientId: 'r-1', text: 'Yes!', replyToId: original.body.message.id });
    assert.equal(reply.status, 201);
    assert.deepEqual(reply.body.message.replyTo, {
      messageId: original.body.message.id,
      senderId: bob.user.id,
      senderName: 'Bob',
      text: 'Are we still on for 3pm?',
    });
  });
});

describe('editing, deleting, reactions, stars', () => {
  test('only the sender can edit; id, timestamp and reactions are preserved', async () => {
    const sent = (await send(alice, { clientId: 'ed-1', text: 'tpyo' })).body.message;
    await bob.agent.post(`/api/messages/${sent.id}/reactions`).send({ emoji: '👍' });

    assert.equal((await bob.agent.patch(`/api/messages/${sent.id}`).send({ text: 'not mine' })).status, 403);
    assert.equal((await alice.agent.patch(`/api/messages/${sent.id}`).send({ text: '   ' })).status, 400);

    const edited = await alice.agent.patch(`/api/messages/${sent.id}`).send({ text: 'typo' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.message.id, sent.id);
    assert.equal(edited.body.message.text, 'typo');
    assert.equal(edited.body.message.createdAt, sent.createdAt);
    assert.ok(edited.body.message.editedAt);
    assert.deepEqual(edited.body.message.reactions, [{ emoji: '👍', userId: bob.user.id }]);
  });

  test('only the sender can delete; deletion is a soft delete that clears content', async () => {
    const sent = (await send(alice, { clientId: 'del-1', text: 'oops' })).body.message;
    assert.equal((await bob.agent.delete(`/api/messages/${sent.id}`)).status, 403);
    const res = await alice.agent.delete(`/api/messages/${sent.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.message.deleted, true);
    assert.equal(res.body.message.text, '');
    assert.equal((await alice.agent.patch(`/api/messages/${sent.id}`).send({ text: 'undo' })).status, 400);
  });

  test('reactions toggle per user and only allow known emoji', async () => {
    const sent = (await send(bob, { clientId: 're-1', text: 'react to me' })).body.message;
    const url = `/api/messages/${sent.id}/reactions`;
    assert.equal((await alice.agent.post(url).send({ emoji: '<script>' })).status, 400);
    await alice.agent.post(url).send({ emoji: '❤️' });
    await bob.agent.post(url).send({ emoji: '❤️' });
    let res = await alice.agent.post(url).send({ emoji: '😂' });
    assert.equal(res.body.message.reactions.length, 3);
    res = await alice.agent.post(url).send({ emoji: '❤️' }); // toggle off
    assert.deepEqual(
      res.body.message.reactions.map((r) => `${r.emoji}:${r.userId === alice.user.id ? 'a' : 'b'}`).sort(),
      ['❤️:b', '😂:a']
    );
  });

  test('stars are private to the user who starred', async () => {
    const sent = (await send(bob, { clientId: 'st-1', text: 'remember this' })).body.message;
    const starred = await alice.agent.put(`/api/messages/${sent.id}/star`);
    assert.equal(starred.body.message.starred, true);

    const aliceList = await alice.agent.get('/api/messages/starred');
    assert.ok(aliceList.body.messages.some((m) => m.id === sent.id && m.senderName === 'Bob'));
    const bobList = await bob.agent.get('/api/messages/starred');
    assert.ok(bobList.body.messages.every((m) => m.id !== sent.id));

    const history = await bob.agent.get(`${base}/messages`);
    assert.equal(history.body.messages.find((m) => m.id === sent.id).starred, false);

    const unstarred = await alice.agent.delete(`/api/messages/${sent.id}/star`);
    assert.equal(unstarred.body.message.starred, false);
  });
});

describe('pins', () => {
  test('anyone can pin in a direct chat; only admins in a group', async () => {
    const sent = (await send(bob, { clientId: 'pin-1', text: 'pin me' })).body.message;
    const pinned = await alice.agent.post(`${base}/pins`).send({ messageId: sent.id });
    assert.equal(pinned.status, 200);
    assert.ok(pinned.body.pinnedMessageIds.includes(sent.id));
    const unpinned = await bob.agent.delete(`${base}/pins/${sent.id}`);
    assert.deepEqual(unpinned.body.pinnedMessageIds, []);

    const group = (
      await alice.agent.post('/api/conversations/group').send({ name: 'G', memberIds: [bob.user.id] })
    ).body.conversation;
    const gm = (
      await bob.agent.post(`/api/conversations/${group.id}/messages`).send({ clientId: 'gp-1', text: 'hi' })
    ).body.message;
    assert.equal((await bob.agent.post(`/api/conversations/${group.id}/pins`).send({ messageId: gm.id })).status, 403);
    assert.equal((await alice.agent.post(`/api/conversations/${group.id}/pins`).send({ messageId: gm.id })).status, 200);
  });

  test('cannot pin a message from another conversation', async () => {
    const carol = await createUser(server, 'Carol');
    const other = await directConversation(alice, carol);
    const foreign = (
      await alice.agent.post(`/api/conversations/${other.id}/messages`).send({ clientId: 'pf-1', text: 'x' })
    ).body.message;
    assert.equal((await alice.agent.post(`${base}/pins`).send({ messageId: foreign.id })).status, 404);
  });
});

describe('unread counts, receipts and history', () => {
  test('unread count tracks messages from others until read', async () => {
    const carol = await createUser(server, 'Carol2');
    const dm = await directConversation(carol, alice);
    const url = `/api/conversations/${dm.id}`;
    for (let i = 0; i < 3; i++) {
      await carol.agent.post(`${url}/messages`).send({ clientId: `u-${i}`, text: `msg ${i}` });
    }
    const unread = (c) => c.agent.get('/api/conversations').then((r) => r.body.conversations.find((x) => x.id === dm.id).unreadCount);
    assert.equal(await unread(alice), 3);
    assert.equal(await unread(carol), 0, "your own messages don't count");

    const read = await alice.agent.post(`${url}/read`);
    assert.equal(read.body.messageIds.length, 3);
    assert.equal(await unread(alice), 0);

    const history = await carol.agent.get(`${url}/messages`);
    assert.ok(history.body.messages.every((m) => m.readBy.includes(alice.user.id)));
    assert.ok(history.body.messages.every((m) => m.deliveredTo.includes(alice.user.id)));
  });

  test('fetching history marks messages delivered to the reader', async () => {
    const dana = await createUser(server, 'Dana');
    const dm = await directConversation(dana, alice);
    const sent = (
      await dana.agent.post(`/api/conversations/${dm.id}/messages`).send({ clientId: 'dl-1', text: 'hey' })
    ).body.message;
    assert.deepEqual(sent.deliveredTo, []);
    await alice.agent.get(`/api/conversations/${dm.id}/messages`);
    const stored = await Message.findById(sent.id).lean();
    assert.deepEqual(stored.deliveredTo.map(String), [alice.user.id]);
  });

  test('history is paginated oldest→newest with a hasMore cursor', async () => {
    const erin = await createUser(server, 'Erin');
    const dm = await directConversation(erin, alice);
    const url = `/api/conversations/${dm.id}/messages`;
    for (let i = 0; i < 5; i++) {
      await erin.agent.post(url).send({ clientId: `p-${i}`, text: `n${i}` });
    }
    const page1 = await alice.agent.get(`${url}?limit=3`);
    assert.deepEqual(page1.body.messages.map((m) => m.text), ['n2', 'n3', 'n4']);
    assert.equal(page1.body.hasMore, true);
    const page2 = await alice.agent.get(`${url}?limit=3&before=${encodeURIComponent(page1.body.messages[0].createdAt)}`);
    assert.deepEqual(page2.body.messages.map((m) => m.text), ['n0', 'n1']);
    assert.equal(page2.body.hasMore, false);
  });
});
