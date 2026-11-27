/**
 * Seed Script
 * Usage: npm run seed
 *
 * Creates:
 *   Tenant:   Acme Corp (slug: acme)
 *   Users:    superadmin@acme.com / admin@acme.com / manager@acme.com /
 *             manager2@acme.com / user@acme.com / user2@acme.com
 *   Password for all: Password123!
 *   Projects: 60 generated projects across 2026 (deterministic, same data every run)
 *
 * Safe to re-run: removes the previous acme tenant together with its users and projects.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Tenant from '../models/Tenant.model.js';
import User from '../models/User.model.js';
import Project from '../models/Project.model.js';

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = 'Password123!';
const PROJECT_COUNT = 60;
const YEAR = 2026;

// ── Deterministic PRNG (mulberry32) so every seed run produces identical data ──
function createRandom(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(20260101);
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + Math.floor(random() * (max - min + 1));
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);

const VERBS = ['Redesign', 'Migrate', 'Launch', 'Automate', 'Upgrade', 'Audit', 'Build', 'Optimize', 'Integrate', 'Modernize'];
const SUBJECTS = [
  'Customer Portal', 'Billing System', 'Mobile App', 'Data Warehouse', 'Marketing Site',
  'HR Onboarding', 'Inventory Tracker', 'Support Desk', 'Payment Gateway', 'Analytics Dashboard',
  'Email Campaigns', 'Network Backbone', 'Identity Service', 'Reporting Suite', 'Partner API',
];
const CLIENTS = [
  'Northwind Traders', 'Globex Corp', 'Initech', 'Umbrella Health', 'Stark Logistics',
  'Wayne Retail', 'Soylent Foods', 'Hooli Media', 'Vandelay Imports', 'Cyberdyne Labs',
];
const CATEGORIES = ['development', 'design', 'marketing', 'infrastructure', 'research'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
// Weighted: mostly active, some inactive, a few archived
const STATUSES = ['active', 'active', 'active', 'inactive', 'inactive', 'archived'];

function buildProjects({ tenantId, users }) {
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  // ~1/3 by user@acme.com so the 'user' role still sees a full table
  const creators = [
    byEmail['user@acme.com'], byEmail['user@acme.com'],
    byEmail['manager@acme.com'], byEmail['manager2@acme.com'],
    byEmail['admin@acme.com'], byEmail['user2@acme.com'],
  ];
  const updaters = [byEmail['admin@acme.com'], byEmail['manager@acme.com'], byEmail['manager2@acme.com']];

  return Array.from({ length: PROJECT_COUNT }, (_, i) => {
    const month = i % 12; // spread evenly across Jan–Dec
    const createdAt = new Date(Date.UTC(YEAR, month, between(1, 28), between(8, 17), between(0, 59)));
    const startDate = addDays(createdAt, between(0, 14));
    const dueDate = addDays(startDate, between(30, 240));
    const budget = between(50, 2500) * 1000;
    const spent = Math.round(budget * between(0, 110) / 100); // some projects run over budget
    const verb = pick(VERBS);
    const subject = pick(SUBJECTS);
    const client = pick(CLIENTS);
    const creator = creators[i % creators.length];
    const touched = random() < 0.6;

    return {
      code: `PRJ-${YEAR}-${String(i + 1).padStart(4, '0')}`,
      title: `${verb} ${subject}`,
      description: `${verb} the ${subject.toLowerCase()} for ${client}.`,
      client,
      category: CATEGORIES[i % CATEGORIES.length],
      priority: pick(PRIORITIES),
      status: pick(STATUSES),
      budget,
      spent,
      startDate,
      dueDate,
      tenantId,
      createdBy: creator._id,
      ...(touched && { updatedBy: pick(updaters)._id }),
      createdAt,
      updatedAt: touched ? addDays(createdAt, between(1, 30)) : createdAt,
    };
  });
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Clean existing seed data (tenant + everything scoped to it)
  const existing = await Tenant.findOne({ slug: 'acme' });
  if (existing) {
    await Project.deleteMany({ tenantId: existing._id });
    await User.deleteMany({ tenantId: existing._id });
    await Tenant.deleteOne({ _id: existing._id });
  }

  // 1. Create tenant
  const tenant = await Tenant.create({
    name: 'Acme Corp',
    slug: 'acme',
    plan: 'pro',
  });
  console.log(`✓ Tenant created: ${tenant.name} (${tenant.slug})`);

  // 2. Create users
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
  const usersData = [
    { name: 'Super Admin', email: 'superadmin@acme.com', role: 'superadmin' },
    { name: 'Admin User', email: 'admin@acme.com', role: 'admin' },
    { name: 'Manager User', email: 'manager@acme.com', role: 'manager' },
    { name: 'Maria Santos', email: 'manager2@acme.com', role: 'manager' },
    { name: 'Regular User', email: 'user@acme.com', role: 'user' },
    { name: 'Juan Dela Cruz', email: 'user2@acme.com', role: 'user' },
  ];

  const users = await User.insertMany(
    usersData.map((u) => ({ ...u, passwordHash, tenantId: tenant._id }))
  );
  console.log(`✓ Users created: ${users.map((u) => u.email).join(', ')}`);

  // 3. Create projects (timestamps set explicitly so they spread across the year)
  // Build real documents (schema defaults + validation), then insert raw so the
  // explicit createdAt/updatedAt values are not overwritten by Mongoose timestamps.
  const projects = buildProjects({ tenantId: tenant._id, users }).map((p) => new Project(p));
  await Promise.all(projects.map((p) => p.validate()));
  await Project.collection.insertMany(projects.map((p) => p.toObject()));
  console.log(`✓ Projects created: ${projects.length}`);

  console.log('\n─────────────────────────────────────────────');
  console.log('Seed complete. Test credentials:');
  usersData.forEach((u) => console.log(`  ${u.role.padEnd(12)} → ${u.email}  /  ${DEFAULT_PASSWORD}`));
  console.log('─────────────────────────────────────────────');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
