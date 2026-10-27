import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { User } from '../src/models/User.js';
import { createUser, startServer } from './helpers.js';

let server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
});

describe('registration', () => {
  test('rejects invalid input with a 400 and a useful message', async () => {
    const api = request(server.httpServer);
    const badEmail = await api.post('/api/auth/register').send({ name: 'A', email: 'nope', password: 'longenough1' });
    assert.equal(badEmail.status, 400);
    assert.match(badEmail.body.error, /valid email/i);

    const shortPw = await api.post('/api/auth/register').send({ name: 'A', email: 'a@x.com', password: 'short' });
    assert.equal(shortPw.status, 400);
    assert.match(shortPw.body.error, /at least 8/);

    const noName = await api.post('/api/auth/register').send({ email: 'b@x.com', password: 'longenough1' });
    assert.equal(noName.status, 400);
  });

  test('creates the user, hashes the password and sets an httpOnly session cookie', async () => {
    const res = await request(server.httpServer)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'Ada@Example.com', password: 'super-secret-1' });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'ada@example.com');
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.body.user.password, undefined);

    const cookie = res.headers['set-cookie'].join(';');
    assert.match(cookie, /cb_token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);

    const stored = await User.findOne({ email: 'ada@example.com' }).select('+passwordHash').lean();
    assert.notEqual(stored.passwordHash, 'super-secret-1');
    assert.ok(stored.passwordHash.startsWith('$2'));
    assert.ok(await bcrypt.compare('super-secret-1', stored.passwordHash));
  });

  test('rejects a duplicate email (case-insensitive) with 409', async () => {
    const res = await request(server.httpServer)
      .post('/api/auth/register')
      .send({ name: 'Ada 2', email: 'ADA@example.com', password: 'another-secret-1' });
    assert.equal(res.status, 409);
  });
});

describe('login / session / logout', () => {
  test('wrong password and unknown email both return the same 401', async () => {
    const { email } = await createUser(server, 'Bob');
    const api = request(server.httpServer);
    const wrong = await api.post('/api/auth/login').send({ email, password: 'not-the-password' });
    const unknown = await api.post('/api/auth/login').send({ email: 'ghost@example.com', password: 'whatever-123' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error);
    assert.equal(wrong.headers['set-cookie'], undefined);
  });

  test('login → /me works, logout → /me is 401', async () => {
    const { email, password } = await createUser(server, 'Cara');
    const agent = request.agent(server.httpServer);

    assert.equal((await agent.get('/api/auth/me')).status, 401);
    const login = await agent.post('/api/auth/login').send({ email, password });
    assert.equal(login.status, 200);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);

    assert.equal((await agent.post('/api/auth/logout')).status, 204);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  test('protected APIs reject missing and forged tokens', async () => {
    const api = request(server.httpServer);
    assert.equal((await api.get('/api/conversations')).status, 401);
    assert.equal((await api.get('/api/users')).status, 401);

    const forged = await api.get('/api/conversations').set('Cookie', 'cb_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.bad');
    assert.equal(forged.status, 401);
  });

  test('state-changing requests from a foreign Origin are refused', async () => {
    const { agent } = await createUser(server, 'Dan');
    const res = await agent
      .patch('/api/users/me')
      .set('Origin', 'https://evil.example')
      .send({ bio: 'pwned' });
    assert.equal(res.status, 403);

    const ok = await agent.patch('/api/users/me').set('Origin', 'http://localhost:5173').send({ bio: 'hello' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.bio, 'hello');
  });
});

describe('profile', () => {
  test('validates profile updates and rejects unknown fields', async () => {
    const { agent } = await createUser(server, 'Eve');
    assert.equal((await agent.patch('/api/users/me').send({ mood: 'grumpy' })).status, 400);
    assert.equal((await agent.patch('/api/users/me').send({ avatar: 'javascript:alert(1)' })).status, 400);
    assert.equal((await agent.patch('/api/users/me').send({ email: 'hijack@example.com' })).status, 400);

    const res = await agent.patch('/api/users/me').send({ mood: 'happy', name: 'Eve Updated' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.mood, 'happy');
    assert.equal(res.body.user.name, 'Eve Updated');
  });

  test('user directory excludes the caller and never exposes emails or hashes', async () => {
    const { agent, user } = await createUser(server, 'Finn');
    const res = await agent.get('/api/users');
    assert.equal(res.status, 200);
    assert.ok(res.body.users.length > 0);
    assert.ok(res.body.users.every((u) => u.id !== user.id));
    assert.ok(res.body.users.every((u) => u.email === undefined && u.passwordHash === undefined));
  });

  test('content security policy allows configured remote avatar images', async () => {
    const { agent } = await createUser(server, 'Gwen');
    const res = await agent.get('/api/users');
    assert.match(res.headers['content-security-policy'], /img-src 'self' data: https: http:/);
  });
});
