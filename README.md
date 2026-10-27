# ChatterBox

ChatterBox is a real-time chat app: a React frontend backed by a Node.js/Express API, MongoDB for storage, and Socket.IO for live updates. It supports one-to-one and group chats, read receipts, typing indicators, presence, image sharing, replies, reactions, editing, pinned and starred messages, and the playful extras from the original app: moods, wallpapers, message effects, sound effects and a "Wrapped" recap.

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Setup](#setup)
- [Running](#running)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Socket.IO events](#socketio-events)
- [Security notes](#security-notes)
- [Limitations](#limitations)

---

## Features

### Accounts
- Register, log in and log out against the real API. Passwords are hashed with bcrypt (12 rounds) and are never stored or returned in plain text.
- The session is a signed JWT in an **httpOnly, SameSite=Lax cookie**, so frontend code never sees the token.
- Profile: name, bio, avatar URL and mood. Changes are broadcast live to other users.

### Messaging (real time)
- One-to-one and **group** conversations, each with its own URL: `/chat/:conversationId`.
- Messages are **saved to MongoDB before the sender is told they were sent**. Each message has a stable server ID.
- **Sent → delivered → read** ticks. In groups, "delivered" and "read" mean *every* other member has received or read the message.
- **Typing indicators.** Groups show who is typing.
- **Presence.** Online status and "last seen". Several tabs count as one presence.
- **Offline and reconnect handling.** Messages sent while disconnected show as *sending* (clock icon) and go out automatically on reconnect. Every message carries a client-generated `clientId`, and the server enforces one message per `(sender, clientId)`, so retries never create duplicates. On reconnect the client also re-syncs conversations and open chats.
- Messages sent while the recipient is offline are marked *delivered* when they next connect or load the chat.
- Reply, edit (your own messages; shows an "edited" label), delete (your own; soft delete with a placeholder), and reactions (one toggle per user per emoji).
- **Unread counts** per conversation, stored on the server and cleared when you open the chat.
- **Pinned messages.** Anyone can pin in a one-to-one chat; only admins can pin in a group. A pinned bar at the top cycles through pins and jumps to them.
- **Starred messages.** Private to you, listed on a Starred page (`/starred`) that links back to each message.
- Paginated history with a "Load older messages" button. Jumping to a message (from Starred, pins or a reply quote) loads older pages until it finds it.

### Images
- Attach an image with the paperclip or by pasting, and add an optional caption. You see a preview you can remove before sending.
- Accepted: JPG, PNG, GIF and WebP, up to 5 MB (configurable). The server checks the file's actual bytes, not just its declared type.
- Images are stored on disk and served only to members of the conversation, through an authenticated endpoint. Uploads that are never sent are deleted after an hour, and deleting a message deletes its image file.

### Groups
- Create a group (the creator becomes admin), rename it, add and remove members, and make or remove admins.
- Any member can leave. A group is never left without an admin: if the last admin leaves, the longest-standing member is promoted automatically.
- Removed members immediately lose access to the group's history and live events.

### UI (kept from the original app)
- Light and dark themes, per-chat wallpapers, moods, avatar rings, sound effects (Web Audio), full-screen message effects (🎉 / "congrats", ❤️, 🔥, 🎂).
- Date dividers, a jump-to-bottom button, in-chat search over loaded messages, and a responsive layout (one pane at a time on mobile).
- Loading, empty, error, offline ("You're offline…") and session-expired states.
- **ChatterBox Wrapped**: a recap built from your real message history.

---

## Architecture

```
Browser (React 19 + Vite)
  │  fetch /api/*  (cookie)          socket.io (same cookie)
  ▼                                   ▼
Vite dev server :5173 ── proxy ──► Express + Socket.IO :4000 ──► MongoDB
                                        │
                                        └──► server/uploads/ (private image files)
```

- **One origin.** In development, Vite proxies `/api` and `/socket.io` to the API, so the browser only talks to `localhost:5173` and the cookie needs no CORS workarounds. In production, either put both behind one reverse proxy, or set `SERVE_CLIENT=true` so the API serves the built `dist/`.
- **REST for state changes, sockets for live updates.** Sending a message goes over the socket with an acknowledgement (a REST equivalent exists too). Edit, delete, react, star, pin and group admin actions are REST calls; the server then broadcasts the change to the conversation's room.
- **Rooms.** Each socket joins `user:<id>` and one `conv:<id>` room per conversation. When membership changes, the server adds or removes every open socket of that user, so access changes take effect live.
- **Frontend state.** `ChatContext` holds a reducer (`src/context/chatReducer.js`) that merges REST responses, socket events and optimistic local messages. Messages are matched by server `id` or by `clientId`, and a stale response can't overwrite a newer live update.

---

## Requirements

- **Node.js 20.19+ or 22.12+** (Vite 8 requires it; the server uses only stable Node APIs).
- **MongoDB 6+**. Any of these works:
  - A local install (Windows service, `brew services start mongodb-community`, etc.)
  - Docker: `docker run -d -p 27017:27017 --name chatterbox-mongo mongo:7`
  - A free MongoDB Atlas cluster (use its `mongodb+srv://…` connection string)

---

## Setup

```bash
# 1. Frontend dependencies (repository root)
npm install

# 2. Backend dependencies
cd server
npm install

# 3. Backend configuration
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Edit `server/.env` and set at least:

```ini
MONGODB_URI=mongodb://127.0.0.1:27017/chatterbox
JWT_SECRET=<at least 32 random characters>
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The server refuses to start if `JWT_SECRET` or `MONGODB_URI` is missing, or if the secret is shorter than 32 characters. Indexes are created automatically on startup.

---

## Running

Open two terminals:

```bash
# Terminal 1 — API + Socket.IO on http://localhost:4000
cd server
npm run dev        # restarts on file changes (node --watch)

# Terminal 2 — frontend on http://localhost:5173
npm run dev
```

Open http://localhost:5173 and create an account. On a fresh database, run `npm run seed` first so the Chats list has people in it. In development, the landing page also has an **Explore demo people** button that signs in as the Alice demo account and opens the chat list with the seeded contacts. Seeded demo contacts (emails `firstname@demo.chatterbox.test`) come online when messaged, reply “Got it 👍” after five seconds, and stay online briefly after replying. To try real-time person-to-person replies, register a second account in another browser or a private window, then start a chat from **People** or the sidebar search.

| Command | Where | What it does |
|---|---|---|
| `npm run dev` | root | Vite dev server (proxies `/api` and `/socket.io` to `:4000`) |
| `npm run build` | root | Production build into `dist/` |
| `npm run preview` | root | Serve `dist/`, with the same proxy |
| `npm run lint` | root | ESLint for the frontend and the server |
| `npm run dev:server` | root | Shortcut for `server/`'s `npm run dev` |
| `npm test` | root | Shortcut for `server/`'s `npm test` |
| `npm run dev` | server | API with auto-restart |
| `npm start` | server | API (production style) |
| `npm test` | server | Backend test suite (needs MongoDB, see below) |
| `npm run seed` | server or root | Create the 9 original demo contacts (Alice Johnson, Brian Kim, …) as real accounts, password `demo-password` (or `SEED_PASSWORD`). `npm run seed -- --remove` deletes them. Refuses to run in production. |

**Single-process production run:** `npm run build` at the root, then in `server/` set `NODE_ENV=production`, `SERVE_CLIENT=true` and `CLIENT_ORIGIN=<your public URL>`, and run `npm start`. Serve it over HTTPS: in production the cookie is marked `Secure`.

If the API runs somewhere other than `http://localhost:4000` during development, start Vite with `VITE_API_TARGET=http://host:port npm run dev`.

---

## Environment variables

All variables live in `server/.env`; see `server/.env.example`. The frontend has no secrets and needs no configuration.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB connection string, including the database name |
| `JWT_SECRET` | ✅ | — | Signs session tokens; at least 32 characters |
| `JWT_EXPIRES_IN` | | `7d` | Session length |
| `PORT` | | `4000` | API port |
| `CLIENT_ORIGIN` | | `http://localhost:5173` | Comma-separated origins allowed to call the API with cookies (used for CORS and the CSRF Origin check) |
| `UPLOAD_DIR` | | `uploads` | Image storage directory, relative to `server/` |
| `MAX_UPLOAD_MB` | | `5` | Maximum image size |
| `SERVE_CLIENT` | | `false` | Also serve `../dist` from the API |
| `NODE_ENV` | | `development` | `production` turns on secure cookies and `trust proxy` |
| `TEST_MONGODB_URI` | tests only | `mongodb://127.0.0.1:27017` | MongoDB server used by `npm test` (no database name) |

> On Windows, use `127.0.0.1` rather than `localhost` in MongoDB URIs. MongoDB often listens on IPv4 only, while `localhost` may resolve to IPv6 first.

---

## Testing

```bash
cd server
npm test
```

The backend suite uses Node's built-in test runner (`node:test`) with `supertest` for HTTP and `socket.io-client` for socket events. It runs against a **real MongoDB**: each test file creates a uniquely named throwaway database (`chatterbox_test_*`) and drops it afterwards, and uploads go to a temporary folder. To point it at a different server, set `TEST_MONGODB_URI`.

| File | Covers |
|---|---|
| `auth.test.js` | Validation; bcrypt hashing (no plain-text passwords stored); httpOnly cookie; duplicate email; identical 401 for wrong password and unknown email; `/me`; logout; forged tokens; foreign-Origin rejection; profile validation; directory never exposes emails or hashes |
| `conversations.test.js` | Find-or-create direct chats; outsiders get 404 on every conversation and message endpoint; group roles; admin-only rename, add and role changes; last-admin protection and auto-promotion; removed members lose access |
| `messages.test.js` | Saving messages; clientId idempotency; input limits; reply snapshots; edit and delete (sender only; ID, timestamp and reactions kept); reaction toggles; private stars; pin permissions; unread counts; delivered and read receipts; pagination |
| `uploads.test.js` | Type, size and content sniffing (a disguised `.exe` is rejected); member-only access; unsent uploads private to the uploader; attachments can't be reused or stolen; revalidation headers; deleting a message deletes its file; orphan cleanup |
| `socket.test.js` | Rejects unauthenticated sockets; message saved before ack; live delivery; no duplicates on resend; group fan-out without leaking to outsiders; live room join when added to a group; REST changes broadcast; typing (members only); presence across several tabs and last seen; sent → delivered (including offline recipients) → read |
| `persistence.test.js` | History and unread counts survive a full server restart |

The frontend has no unit-test suite. It is checked by `npm run lint` and `npm run build`.

---

## Project structure

```
├── index.html, vite.config.js, eslint.config.js, package.json   # frontend
├── src/
│   ├── api/client.js            # fetch wrapper (cookies, errors, session-expired event)
│   ├── context/
│   │   ├── AuthContext.jsx      # session via /api/auth/*
│   │   ├── ChatContext.jsx      # socket lifecycle, actions, send queue
│   │   ├── chatReducer.js       # pure state merging (dedupe, receipts, unread)
│   │   ├── SettingsContext.jsx  # sound / effects toggles (localStorage)
│   │   └── ThemeContext.jsx     # light / dark (localStorage)
│   ├── hooks/                   # useClickOutside, useLocalStorage
│   ├── components/              # ChatLayout, Sidebar, ChatWindow, MessageBubble,
│   │                            # MessageInput, GroupInfoModal, NewGroupModal, Modal,
│   │                            # StarredPage, ContactsPage, ProfilePage, WrappedPage, …
│   ├── utils/                   # messages (status/view mapping), formatTime, avatar,
│   │                            # messageEffects, soundEffects
│   ├── data/                    # moods, wallpapers
│   └── styles/                  # theme, base, layout, messages, …, realtime, responsive
└── server/
    ├── .env.example
    ├── src/
    │   ├── index.js             # entry: config, listen, orphan-upload cleanup, shutdown
    │   ├── server.js            # builds HTTP + Socket.IO (used by tests too)
    │   ├── app.js               # Express app, middleware, error handler
    │   ├── socket.js            # authenticated sockets, send/typing/receipts/presence
    │   ├── realtime.js          # rooms + in-memory presence counter
    │   ├── config.js            # environment variable loading and validation
    │   ├── models/              # User, Conversation, Message, Attachment
    │   ├── routes/              # auth, users, conversations, messages, attachments
    │   ├── services/            # conversation/message logic, serializers
    │   ├── middleware/          # requireAuth, Origin check, zod validation
    │   ├── storage/localDisk.js # file storage (swap for S3/GCS)
    │   └── utils/               # errors, image signature detection
    └── test/                    # node:test suites (see Testing)
```

---

## API reference

All routes are under `/api`. Every route except `/auth/register`, `/auth/login`, `/auth/logout` and `/health` requires the session cookie. Errors are returned as `{ "error": "message" }`. A conversation or message you can't access returns **404**, so IDs can't be probed.

| Method & path | Description |
|---|---|
| `POST /auth/register` `{name,email,password}` | Create an account (password ≥ 8 characters) and start a session |
| `POST /auth/login` `{email,password}` | Start a session |
| `POST /auth/logout` | Clear the session cookie |
| `GET /auth/me` | Current user |
| `GET /users?q=` | Directory of other users (with online status and last seen) |
| `PATCH /users/me` `{name?,bio?,avatar?,mood?}` | Update your profile |
| `GET /users/me/stats` | Numbers for Wrapped |
| `GET /conversations` | Your conversations, with unread counts and last message |
| `POST /conversations/direct` `{userId}` | Find or create a one-to-one chat |
| `POST /conversations/group` `{name,memberIds}` | Create a group |
| `GET /conversations/:id` | One conversation |
| `PATCH /conversations/:id` `{name}` | Rename a group (admin) |
| `POST /conversations/:id/members` `{userIds}` | Add members (admin) |
| `DELETE /conversations/:id/members/:userId` | Remove a member (admin), or leave (yourself) |
| `PATCH /conversations/:id/members/:userId` `{role}` | Make or remove an admin (admin) |
| `GET /conversations/:id/messages?before=&limit=` | History, oldest → newest, with `hasMore` |
| `POST /conversations/:id/messages` `{clientId,text?,replyToId?,attachmentId?}` | Send (idempotent per `clientId`) |
| `POST /conversations/:id/read` | Mark the conversation read |
| `POST /conversations/:id/pins` `{messageId}` · `DELETE /conversations/:id/pins/:messageId` | Pin / unpin |
| `POST /conversations/:id/attachments` (multipart field `image`) | Upload an image to send |
| `GET /attachments/:id` | Download an image (members only) |
| `PATCH /messages/:id` `{text}` · `DELETE /messages/:id` | Edit / delete your own message |
| `POST /messages/:id/reactions` `{emoji}` | Toggle a reaction (👍 ❤️ 😂 😮 😢 🎉 🔥 🙏) |
| `PUT /messages/:id/star` · `DELETE /messages/:id/star` | Star / unstar (private) |
| `GET /messages/starred` | Your starred messages |

## Socket.IO events

The socket is authenticated with the same cookie; a connection without a valid session is refused with `unauthorized`.

| Direction | Event | Payload |
|---|---|---|
| client → server | `message:send` (with ack) | `{conversationId, clientId, text?, replyToId?, attachmentId?}` → ack `{ok, message, duplicate}` or `{ok:false, status, error}` |
| client → server | `typing` | `{conversationId, isTyping}` |
| client → server | `messages:delivered` (ack optional) | `{conversationId, messageIds}` |
| client → server | `conversation:read` (ack optional) | `{conversationId}` |
| server → client | `ready` | sent once per connection, after rooms are joined |
| server → client | `message:new` / `message:updated` | `{message}` |
| server → client | `message:starred` | `{conversationId, messageId, starred}` (your own sessions only) |
| server → client | `messages:delivered` / `messages:read` | `{conversationId, userId, messageIds}` |
| server → client | `conversation:new` / `conversation:updated` | conversation (your own view, including unread count) |
| server → client | `conversation:removed` / `conversation:read` | `{conversationId}` |
| server → client | `typing` | `{conversationId, userId, isTyping}` |
| server → client | `presence` | `{userId, online, lastSeen}` |
| server → client | `user:updated` | `{user}` |

---

## Security notes

- Passwords: bcrypt with 12 rounds. Login takes the same time and returns the same error whether or not the email exists.
- Sessions: HS256 JWT in an httpOnly, SameSite=Lax cookie (also `Secure` in production). Login and register are rate-limited to 20 attempts per 15 minutes per IP.
- CSRF: the SameSite=Lax cookie, plus a server-side check that rejects state-changing requests from a foreign `Origin`.
- Authorization: every conversation, message and attachment query is scoped to conversations you belong to. Validation errors return 400 and access failures return 404, never 500.
- Input: every body is validated with zod (unknown profile fields are rejected). JSON bodies are capped at 32 KB, socket payloads at 64 KB.
- Uploads: allow-listed MIME types, plus checks of the file's actual bytes and its size. Files are stored under random names outside any static folder, and served with `nosniff`, a restrictive CSP and `Cache-Control: private, no-cache`, so revoked access takes effect immediately.
- Secrets live only in `server/.env`, which is git-ignored.

---

## Limitations

- **Single server instance.** Presence counts and Socket.IO rooms live in memory. Running several API instances would need the Socket.IO Redis adapter and a shared presence store, and image storage would need a shared backend such as S3 instead of local disk (`storage/localDisk.js` is the place to swap it).
- **Logout clears only the cookie on that device.** JWTs are stateless, so a stolen token stays valid until it expires (7 days by default). There is no "log out everywhere" yet.
- **No email verification or password reset.**
- **Audio/video calls** are placeholders: the buttons only explain that WebRTC isn't implemented.
- **Profile photos** are set by URL; image upload applies to chat messages only.
- **In-chat search** covers loaded messages only; there is no server-side search.
- If a client reconnects after missing more than one page (50) of new messages in an open chat, it shows the latest page. Older messages in between remain reachable with "Load older messages", but may appear after a gap until the chat is reopened.
- Wallpapers, theme and the sound/effects settings are per-browser preferences (`localStorage`) and don't sync between devices.
- The frontend has no committed automated tests. Its behaviour was verified with lint, a production build, and a browser-automation run against the real stack that is not part of this repository.
