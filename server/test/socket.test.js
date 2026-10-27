import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Message } from '../src/models/Message.js';
import { User } from '../src/models/User.js';
import { chatReducer, initialChatState } from '../../src/context/chatReducer.js';
import {
  collectEvents,
  connectSocket,
  createUser,
  directConversation,
  emitWithAck,
  startServer,
  waitForEvent,
} from './helpers.js';

let server;
let alice;
let bob;
let mallory;
let conv;

before(async () => {
  server = await startServer();
  [alice, bob, mallory] = await Promise.all(['Alice', 'Bob', 'Mallory'].map((n) => createUser(server, n)));
  conv = await directConversation(alice, bob);
});
after(async () => {
  await server.stop();
});

describe('authentication', () => {
  test('connections without a valid session cookie are refused', async () => {
    await assert.rejects(connectSocket(server, null), /unauthorized/);
    await assert.rejects(connectSocket(server, 'cb_token=forged.token.value'), /unauthorized/);
  });
});

describe('messaging', () => {
  test('a fast receipt is preserved when the send acknowledgement arrives afterward', () => {
    const conversation = {
      id: 'receipt-race',
      members: [{ user: { id: 'sender' } }, { user: { id: 'recipient' } }],
      lastMessage: null,
    };
    const message = {
      id: 'message-1',
      clientId: 'client-1',
      conversationId: conversation.id,
      senderId: 'sender',
      createdAt: new Date().toISOString(),
      text: 'Hello',
      deliveredTo: [],
      readBy: [],
      reactions: [],
    };

    let state = chatReducer(initialChatState, { type: 'CONVERSATION_UPSERT', conversation });
    state = chatReducer(state, { type: 'MESSAGE_UPSERT', message });
    state = chatReducer(state, {
      type: 'RECEIPT',
      field: 'readBy',
      conversationId: conversation.id,
      messageIds: [message.id],
      userId: 'recipient',
    });
    state = chatReducer(state, { type: 'MESSAGE_UPSERT', message });

    const lastMessage = state.conversations[0].lastMessage;
    assert.deepEqual(lastMessage.deliveredTo, ['recipient']);
    assert.deepEqual(lastMessage.readBy, ['recipient']);
  });

  test('message is persisted before the ack and delivered live to the recipient', async () => {
    const a = await connectSocket(server, alice.cookie);
    const b = await connectSocket(server, bob.cookie);

    const incoming = waitForEvent(b, 'message:new', (p) => p.message.clientId === 'live-1');
    const ack = await emitWithAck(a, 'message:send', { conversationId: conv.id, clientId: 'live-1', text: 'hi Bob' });

    assert.equal(ack.ok, true);
    assert.equal(ack.message.text, 'hi Bob');
    // Already in MongoDB at the time the sender is told it succeeded.
    assert.ok(await Message.exists({ _id: ack.message.id }));

    const { message } = await incoming;
    assert.equal(message.id, ack.message.id);
    assert.equal(message.senderId, alice.user.id);
    a.disconnect();
    b.disconnect();
  });

  test('seeded demo contacts reply with “Got it 👍” and quote the message', async () => {
    const demo = await createUser(server, 'Demo');
    await User.updateOne({ _id: demo.user.id }, { $set: { email: 'demo@demo.chatterbox.test' } });
    const demoConversation = await directConversation(alice, demo);
    const a = await connectSocket(server, alice.cookie);
    const demoSocket = await connectSocket(server, demo.cookie);

    const initiallyOffline = (await alice.agent.get('/api/users')).body.users.find(
      (user) => user.id === demo.user.id
    );
    assert.equal(initiallyOffline.online, false, 'a connected demo account stays offline outside a reply');

    const incoming = waitForEvent(a, 'message:new', (p) => p.message.text === 'Got it 👍', 7000);
    const presence = waitForEvent(a, 'presence', (p) => p.userId === demo.user.id && p.online);
    const eventOrder = [];
    const recordPresence = (payload) => {
      if (payload.userId === demo.user.id) eventOrder.push(payload.online ? 'online' : 'offline');
    };
    const recordReply = ({ message }) => {
      if (message.text === 'Got it 👍') eventOrder.push('reply');
    };
    a.on('presence', recordPresence);
    a.on('message:new', recordReply);
    let messageId;
    const read = waitForEvent(a, 'messages:read', (p) => p.messageIds.includes(messageId), 7000);
    const offline = waitForEvent(a, 'presence', (p) => p.userId === demo.user.id && !p.online, 7000);
    const earlyMessages = collectEvents(a, 'message:new', 500);
    const startedAt = Date.now();
    const sent = await emitWithAck(a, 'message:send', {
      conversationId: demoConversation.id,
      clientId: 'demo-contact-1',
      text: 'Are you there?',
    });
    messageId = sent.message.id;

    assert.equal(sent.ok, true);
    assert.deepEqual(sent.message.deliveredTo, [demo.user.id]);
    assert.deepEqual(sent.message.readBy, []);
    assert.ok(Date.now() - startedAt < 5000, 'sending should not wait for the demo reply');
    assert.equal((await presence).online, true, 'the demo contact comes online before replying');
    const replyingOnline = (await alice.agent.get('/api/users')).body.users.find(
      (user) => user.id === demo.user.id
    );
    assert.equal(replyingOnline.online, true);
    assert.equal(
      (await earlyMessages).some((event) => event.message.text === 'Got it 👍'),
      false,
      'the demo should not reply immediately'
    );
    const readEvent = await read;
    assert.equal(readEvent.userId, demo.user.id);
    const { message } = await incoming;
    assert.ok(Date.now() - startedAt >= 5000, 'the demo reply should wait five seconds');
    assert.equal(message.senderId, demo.user.id);
    assert.equal(message.replyTo.messageId, sent.message.id);
    assert.equal(message.replyTo.text, 'Are you there?');
    assert.ok(await Message.exists({ _id: message.id }));
    assert.deepEqual((await Message.findById(sent.message.id).lean()).readBy.map(String), [demo.user.id]);
    assert.equal((await offline).online, false, 'the demo contact returns offline after replying');
    const repliedOffline = (await alice.agent.get('/api/users')).body.users.find(
      (user) => user.id === demo.user.id
    );
    assert.equal(repliedOffline.online, false);
    assert.ok(eventOrder.indexOf('online') < eventOrder.indexOf('reply'));
    assert.ok(eventOrder.indexOf('reply') < eventOrder.indexOf('offline'));
    a.off('presence', recordPresence);
    a.off('message:new', recordReply);
    a.disconnect();
    demoSocket.disconnect();
  });

  test('demo accounts can message an offline demo contact and receive delivery and read receipts', async () => {
    const demoSender = await createUser(server, 'Demo Sender');
    await User.updateOne(
      { _id: demoSender.user.id },
      { $set: { email: 'demo-sender@demo.chatterbox.test' } }
    );
    const demoRecipient = await createUser(server, 'Demo Recipient');
    await User.updateOne(
      { _id: demoRecipient.user.id },
      { $set: { email: 'demo-recipient@demo.chatterbox.test' } }
    );
    const demoConversation = await directConversation(demoSender, demoRecipient);
    const senderSocket = await connectSocket(server, demoSender.cookie);
    const incoming = waitForEvent(
      senderSocket,
      'message:new',
      (p) => p.message.text === 'Got it 👍' && p.message.conversationId === demoConversation.id,
      7000
    );
    const presence = waitForEvent(
      senderSocket,
      'presence',
      (p) => p.userId === demoRecipient.user.id && p.online
    );
    let messageId;
    const read = waitForEvent(
      senderSocket,
      'messages:read',
      (p) => p.messageIds.includes(messageId),
      7000
    );

    const sent = await emitWithAck(senderSocket, 'message:send', {
      conversationId: demoConversation.id,
      clientId: 'demo-to-demo-1',
      text: 'Are you there?',
    });
    messageId = sent.message.id;

    assert.equal(sent.ok, true);
    assert.deepEqual(sent.message.deliveredTo, [demoRecipient.user.id]);
    assert.deepEqual(sent.message.readBy, []);
    assert.equal((await presence).online, true);

    const readReceipt = await read;
    assert.equal(readReceipt.userId, demoRecipient.user.id);
    const { message } = await incoming;
    assert.equal(message.senderId, demoRecipient.user.id);
    assert.equal(message.replyTo.messageId, sent.message.id);
    assert.deepEqual((await Message.findById(sent.message.id).lean()).readBy.map(String), [
      demoRecipient.user.id,
    ]);

    senderSocket.disconnect();
  });

  test('re-sending the same clientId (e.g. after reconnect) does not duplicate', async () => {
    const a = await connectSocket(server, alice.cookie);
    const b = await connectSocket(server, bob.cookie);
    const seen = collectEvents(b, 'message:new', 500);

    const payload = { conversationId: conv.id, clientId: 'retry-1', text: 'only once' };
    const first = await emitWithAck(a, 'message:send', payload);
    const second = await emitWithAck(a, 'message:send', payload);
    assert.equal(second.duplicate, true);
    assert.equal(second.message.id, first.message.id);

    const events = (await seen).filter((p) => p.message.clientId === 'retry-1');
    assert.equal(events.length, 1, 'recipient sees the message exactly once');
    assert.equal(await Message.countDocuments({ clientId: 'retry-1' }), 1);
    a.disconnect();
    b.disconnect();
  });

  test('invalid sends are refused via the ack, not by crashing', async () => {
    const m = await connectSocket(server, mallory.cookie);
    const intruder = await emitWithAck(m, 'message:send', { conversationId: conv.id, clientId: 'x', text: 'hi' });
    assert.deepEqual([intruder.ok, intruder.status], [false, 404]);

    const empty = await emitWithAck(m, 'message:send', { conversationId: conv.id, clientId: 'y', text: '' });
    assert.equal(empty.ok, false);

    const garbage = await emitWithAck(m, 'message:send', null);
    assert.equal(garbage.ok, false);
    assert.equal(garbage.status, 400);
    m.disconnect();
  });

  test('group messages reach every member, and outsiders hear nothing', async () => {
    const carol = await createUser(server, 'Carol');
    const group = (
      await alice.agent.post('/api/conversations/group').send({ name: 'Trio', memberIds: [bob.user.id, carol.user.id] })
    ).body.conversation;

    const [a, b, c, m] = await Promise.all([alice, bob, carol, mallory].map((u) => connectSocket(server, u.cookie)));
    const outsider = collectEvents(m, 'message:new', 600);
    const atBob = waitForEvent(b, 'message:new', (p) => p.message.conversationId === group.id);
    const atCarol = waitForEvent(c, 'message:new', (p) => p.message.conversationId === group.id);

    await emitWithAck(a, 'message:send', { conversationId: group.id, clientId: 'grp-1', text: 'hello all' });
    assert.equal((await atBob).message.text, 'hello all');
    assert.equal((await atCarol).message.text, 'hello all');
    assert.equal((await outsider).length, 0);
    [a, b, c, m].forEach((s) => s.disconnect());
  });

  test('members added to a group join its room immediately', async () => {
    const dave = await createUser(server, 'Dave');
    const group = (
      await alice.agent.post('/api/conversations/group').send({ name: 'Later', memberIds: [bob.user.id] })
    ).body.conversation;
    const a = await connectSocket(server, alice.cookie);
    const d = await connectSocket(server, dave.cookie);

    const added = waitForEvent(d, 'conversation:new', (p) => p.id === group.id);
    await alice.agent.post(`/api/conversations/${group.id}/members`).send({ userIds: [dave.user.id] });
    await added;

    const incoming = waitForEvent(d, 'message:new', (p) => p.message.conversationId === group.id);
    await emitWithAck(a, 'message:send', { conversationId: group.id, clientId: 'late-1', text: 'welcome Dave' });
    assert.equal((await incoming).message.text, 'welcome Dave');
    a.disconnect();
    d.disconnect();
  });

  test('edits, deletes and reactions made over REST are broadcast', async () => {
    const a = await connectSocket(server, alice.cookie);
    const b = await connectSocket(server, bob.cookie);
    const { message } = await emitWithAck(a, 'message:send', { conversationId: conv.id, clientId: 'bc-1', text: 'v1' });

    let update = waitForEvent(b, 'message:updated', (p) => p.message.id === message.id);
    await alice.agent.patch(`/api/messages/${message.id}`).send({ text: 'v2' });
    assert.equal((await update).message.text, 'v2');

    update = waitForEvent(b, 'message:updated', (p) => p.message.id === message.id);
    await bob.agent.post(`/api/messages/${message.id}/reactions`).send({ emoji: '🔥' });
    assert.deepEqual((await update).message.reactions, [{ emoji: '🔥', userId: bob.user.id }]);

    update = waitForEvent(b, 'message:updated', (p) => p.message.id === message.id);
    await alice.agent.delete(`/api/messages/${message.id}`);
    assert.equal((await update).message.deleted, true);
    a.disconnect();
    b.disconnect();
  });
});

describe('typing, presence and receipts', () => {
  test('typing is relayed to other members only', async () => {
    const a = await connectSocket(server, alice.cookie);
    const b = await connectSocket(server, bob.cookie);
    const m = await connectSocket(server, mallory.cookie);
    const outsider = collectEvents(m, 'typing', 400);
    const echo = collectEvents(a, 'typing', 400);

    const atBob = waitForEvent(b, 'typing');
    a.emit('typing', { conversationId: conv.id, isTyping: true });
    assert.deepEqual(await atBob, { conversationId: conv.id, userId: alice.user.id, isTyping: true });
    assert.equal((await outsider).length, 0);
    assert.equal((await echo).length, 0);

    // A non-member can't inject typing into someone else's conversation.
    const spoof = collectEvents(b, 'typing', 400);
    m.emit('typing', { conversationId: conv.id, isTyping: true });
    assert.equal((await spoof).length, 0);
    [a, b, m].forEach((s) => s.disconnect());
  });

  test('presence: online on first connection, offline with lastSeen after the last one closes', async () => {
    const watcher = await connectSocket(server, alice.cookie);
    const online = waitForEvent(watcher, 'presence', (p) => p.userId === bob.user.id && p.online);
    const tab1 = await connectSocket(server, bob.cookie);
    await online;

    const tab2 = await connectSocket(server, bob.cookie);
    const early = collectEvents(watcher, 'presence', 400);
    tab1.disconnect(); // one tab still open → still online
    assert.equal((await early).filter((p) => p.userId === bob.user.id).length, 0);

    const offline = waitForEvent(watcher, 'presence', (p) => p.userId === bob.user.id && !p.online);
    tab2.disconnect();
    const event = await offline;
    assert.ok(event.lastSeen);
    const stored = await User.findById(bob.user.id).lean();
    assert.ok(stored.lastSeen);

    const users = await alice.agent.get('/api/users');
    assert.equal(users.body.users.find((u) => u.id === bob.user.id).online, false);
    watcher.disconnect();
  });

  test('sent → delivered → read, including a recipient who was offline', async () => {
    const a = await connectSocket(server, alice.cookie);
    const { message } = await emitWithAck(a, 'message:send', { conversationId: conv.id, clientId: 'rcpt-1', text: 'you there?' });
    assert.deepEqual(message.deliveredTo, [], 'Bob is offline: only "sent"');

    // Bob comes online → server marks his pending messages delivered.
    const delivered = waitForEvent(a, 'messages:delivered', (p) => p.messageIds.includes(message.id));
    const b = await connectSocket(server, bob.cookie);
    assert.equal((await delivered).userId, bob.user.id);

    const read = waitForEvent(a, 'messages:read', (p) => p.messageIds.includes(message.id));
    const ack = await emitWithAck(b, 'conversation:read', { conversationId: conv.id });
    assert.equal(ack.ok, true);
    assert.equal((await read).userId, bob.user.id);

    const stored = await Message.findById(message.id).lean();
    assert.deepEqual(stored.readBy.map(String), [bob.user.id]);
    a.disconnect();
    b.disconnect();
  });

  test('live delivery receipt via messages:delivered ack', async () => {
    const a = await connectSocket(server, alice.cookie);
    const b = await connectSocket(server, bob.cookie);
    const incoming = waitForEvent(b, 'message:new', (p) => p.message.clientId === 'live-rcpt');
    const { message } = await emitWithAck(a, 'message:send', { conversationId: conv.id, clientId: 'live-rcpt', text: 'ping' });
    await incoming;

    const delivered = waitForEvent(a, 'messages:delivered', (p) => p.messageIds.includes(message.id));
    const ack = await emitWithAck(b, 'messages:delivered', { conversationId: conv.id, messageIds: [message.id] });
    assert.equal(ack.ok, true);
    await delivered;

    const forbidden = await emitWithAck(
      await connectSocket(server, mallory.cookie),
      'messages:delivered',
      { conversationId: conv.id, messageIds: [message.id] }
    );
    assert.equal(forbidden.ok, false);
    a.disconnect();
    b.disconnect();
  });
});
