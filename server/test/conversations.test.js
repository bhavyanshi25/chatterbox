import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createUser, directConversation, startServer } from './helpers.js';

let server;
let alice;
let bob;
let carol;
let mallory;

before(async () => {
  server = await startServer();
  [alice, bob, carol, mallory] = await Promise.all(
    ['Alice', 'Bob', 'Carol', 'Mallory'].map((n) => createUser(server, n))
  );
});
after(async () => {
  await server.stop();
});

describe('direct conversations', () => {
  test('find-or-create returns the same conversation for both users', async () => {
    const first = await alice.agent.post('/api/conversations/direct').send({ userId: bob.user.id });
    assert.equal(first.status, 201);
    assert.equal(first.body.conversation.type, 'direct');
    assert.equal(first.body.conversation.participantId, bob.user.id);

    const again = await bob.agent.post('/api/conversations/direct').send({ userId: alice.user.id });
    assert.equal(again.status, 200);
    assert.equal(again.body.conversation.id, first.body.conversation.id);
    assert.equal(again.body.conversation.participantId, alice.user.id);
  });

  test('rejects talking to yourself, unknown users and malformed ids', async () => {
    assert.equal((await alice.agent.post('/api/conversations/direct').send({ userId: alice.user.id })).status, 400);
    assert.equal(
      (await alice.agent.post('/api/conversations/direct').send({ userId: '64b000000000000000000000' })).status,
      404
    );
    assert.equal((await alice.agent.post('/api/conversations/direct').send({ userId: 'nope' })).status, 400);
  });
});

describe('authorization', () => {
  test('outsiders cannot see, read, post to, or upload into a conversation', async () => {
    const conv = await directConversation(alice, bob);
    const base = `/api/conversations/${conv.id}`;
    assert.equal((await mallory.agent.get(base)).status, 404);
    assert.equal((await mallory.agent.get(`${base}/messages`)).status, 404);
    assert.equal((await mallory.agent.post(`${base}/read`)).status, 404);
    assert.equal(
      (await mallory.agent.post(`${base}/messages`).send({ clientId: 'x1', text: 'let me in' })).status,
      404
    );
    assert.equal((await mallory.agent.post(`${base}/attachments`)).status, 404);

    const list = await mallory.agent.get('/api/conversations');
    assert.ok(list.body.conversations.every((c) => c.id !== conv.id));
  });

  test('outsiders cannot edit, delete, react to or star messages they cannot see', async () => {
    const conv = await directConversation(alice, bob);
    const sent = await alice.agent
      .post(`/api/conversations/${conv.id}/messages`)
      .send({ clientId: 'auth-1', text: 'private' });
    const id = sent.body.message.id;

    assert.equal((await mallory.agent.patch(`/api/messages/${id}`).send({ text: 'hacked' })).status, 404);
    assert.equal((await mallory.agent.delete(`/api/messages/${id}`)).status, 404);
    assert.equal((await mallory.agent.post(`/api/messages/${id}/reactions`).send({ emoji: '👍' })).status, 404);
    assert.equal((await mallory.agent.put(`/api/messages/${id}/star`)).status, 404);
    const starred = await mallory.agent.get('/api/messages/starred');
    assert.ok(starred.body.messages.every((m) => m.id !== id));
  });

  test('invalid ids return 404 rather than 500', async () => {
    assert.equal((await alice.agent.get('/api/conversations/not-an-id')).status, 404);
    assert.equal((await alice.agent.patch('/api/messages/not-an-id').send({ text: 'x' })).status, 404);
  });
});

describe('groups and administration', () => {
  let group;

  test('creator becomes admin; members are listed', async () => {
    const res = await alice.agent
      .post('/api/conversations/group')
      .send({ name: 'Weekend plans', memberIds: [bob.user.id] });
    assert.equal(res.status, 201);
    group = res.body.conversation;
    assert.equal(group.type, 'group');
    assert.equal(group.name, 'Weekend plans');
    const roles = Object.fromEntries(group.members.map((m) => [m.user.id, m.role]));
    assert.equal(roles[alice.user.id], 'admin');
    assert.equal(roles[bob.user.id], 'member');
  });

  test('validates group input', async () => {
    assert.equal((await alice.agent.post('/api/conversations/group').send({ name: '', memberIds: [bob.user.id] })).status, 400);
    assert.equal((await alice.agent.post('/api/conversations/group').send({ name: 'Solo', memberIds: [alice.user.id] })).status, 400);
  });

  test('only admins can rename, add members, and change roles', async () => {
    const base = `/api/conversations/${group.id}`;
    assert.equal((await bob.agent.patch(base).send({ name: 'Bob rules' })).status, 403);
    assert.equal((await bob.agent.post(`${base}/members`).send({ userIds: [carol.user.id] })).status, 403);
    assert.equal((await bob.agent.patch(`${base}/members/${alice.user.id}`).send({ role: 'member' })).status, 403);

    assert.equal((await alice.agent.patch(base).send({ name: 'Weekend!' })).body.conversation.name, 'Weekend!');
    const added = await alice.agent.post(`${base}/members`).send({ userIds: [carol.user.id] });
    assert.equal(added.status, 200);
    assert.ok(added.body.conversation.members.some((m) => m.user.id === carol.user.id));
    assert.equal((await carol.agent.get(base)).status, 200);
  });

  test('cannot demote the last admin; members cannot remove others but can leave', async () => {
    const base = `/api/conversations/${group.id}`;
    assert.equal((await alice.agent.patch(`${base}/members/${alice.user.id}`).send({ role: 'member' })).status, 400);
    assert.equal((await bob.agent.delete(`${base}/members/${carol.user.id}`)).status, 403);

    assert.equal((await carol.agent.delete(`${base}/members/${carol.user.id}`)).status, 204);
    assert.equal((await carol.agent.get(base)).status, 404);
  });

  test('when the last admin leaves, the longest-standing member is promoted', async () => {
    const base = `/api/conversations/${group.id}`;
    assert.equal((await alice.agent.delete(`${base}/members/${alice.user.id}`)).status, 204);
    const res = await bob.agent.get(base);
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.conversation.members.map((m) => [m.user.id, m.role]),
      [[bob.user.id, 'admin']]
    );
  });

  test('admins can remove members, who then lose access to history', async () => {
    const res = await alice.agent
      .post('/api/conversations/group')
      .send({ name: 'Temp', memberIds: [bob.user.id, carol.user.id] });
    const base = `/api/conversations/${res.body.conversation.id}`;
    await alice.agent.post(`${base}/messages`).send({ clientId: 'g-1', text: 'secret plan' });
    assert.equal((await carol.agent.get(`${base}/messages`)).body.messages.length, 1);

    assert.equal((await alice.agent.delete(`${base}/members/${carol.user.id}`)).status, 204);
    assert.equal((await carol.agent.get(`${base}/messages`)).status, 404);
  });

  test("direct conversations can't be left", async () => {
    const conv = await directConversation(alice, carol);
    assert.equal((await alice.agent.delete(`/api/conversations/${conv.id}/members/${alice.user.id}`)).status, 400);
  });
});
