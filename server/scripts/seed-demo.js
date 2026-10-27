// Creates the original ChatterBox demo contacts as real accounts, so a fresh
// install has people to chat with. They automatically reply “Got it 👍” to
// direct messages; log in as one (in another browser) to talk back in real time.
//
//   npm run seed            create the demo accounts (skips ones that exist)
//   npm run seed -- --remove   delete them and their messages/conversations
//
// Password for every demo account: SEED_PASSWORD from .env, or "demo-password".
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { loadConfig } from '../src/config.js';
import { User } from '../src/models/User.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';

const DEMO_DOMAIN = 'demo.chatterbox.test';
const DEMO_USERS = [
  { name: 'Alice Johnson', img: 1, mood: 'focused', bio: 'Product designer. Coffee first.' },
  { name: 'Brian Kim', img: 12, mood: 'sleepy', bio: 'Backend dev, night owl.' },
  { name: 'Priya Nair', img: 47, mood: 'chilling', bio: 'Travelling this month ✈️' },
  { name: 'Marcus Webb', img: 15, mood: 'busy', bio: 'Shipping things.' },
  { name: 'Sofia Reyes', img: 25, mood: 'love', bio: '' },
  { name: 'James Okafor', img: 53, mood: 'happy', bio: 'Ask me about football.' },
  { name: 'Elena Popescu', img: 44, mood: 'sleepy', bio: '' },
  { name: 'Tariq Hassan', img: 33, mood: 'celebrating', bio: 'New job! 🎉' },
  { name: 'Grace Lindqvist', img: 48, mood: 'chilling', bio: '' },
];

const emailFor = (name) => `${name.split(' ')[0].toLowerCase()}@${DEMO_DOMAIN}`;

const config = loadConfig();
if (config.isProduction) {
  console.error('Refusing to seed demo accounts with NODE_ENV=production.');
  process.exit(1);
}

await mongoose.connect(config.mongoUri);
const emails = DEMO_USERS.map((u) => emailFor(u.name));

if (process.argv.includes('--remove')) {
  const users = await User.find({ email: { $in: emails } }).select('_id');
  const ids = users.map((u) => u._id);
  await Message.deleteMany({ sender: { $in: ids } });
  await Conversation.updateMany({}, { $pull: { members: { user: { $in: ids } } } });
  await Conversation.deleteMany({ $or: [{ members: { $size: 0 } }, { type: 'direct', members: { $size: 1 } }] });
  await User.deleteMany({ _id: { $in: ids } });
  console.log(`Removed ${ids.length} demo accounts.`);
} else {
  const password = process.env.SEED_PASSWORD || 'demo-password';
  const passwordHash = await bcrypt.hash(password, 12);
  let created = 0;
  for (const u of DEMO_USERS) {
    const email = emailFor(u.name);
    if (await User.exists({ email })) continue;
    await User.create({
      name: u.name,
      email,
      passwordHash,
      avatar: `https://i.pravatar.cc/150?img=${u.img}`,
      mood: u.mood,
      bio: u.bio,
    });
    created += 1;
  }
  console.log(`Created ${created} demo account(s) (${DEMO_USERS.length - created} already existed).`);
  console.log(`Log in as any of them with password "${password}":`);
  for (const email of emails) console.log(`  ${email}`);
}

await mongoose.disconnect();
