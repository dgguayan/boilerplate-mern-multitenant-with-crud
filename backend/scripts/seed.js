/**
 * Seed Script
 * Usage: npm run seed
 *
 * Creates:
 *   Tenant:  Acme Corp (slug: acme)
 *   Users:   superadmin@acme.com / admin@acme.com / manager@acme.com / user@acme.com
 *   Password for all: Password123!
 *   Projects: 3 sample projects
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Tenant from '../models/Tenant.model.js';
import User from '../models/User.model.js';
import Project from '../models/Project.model.js';

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = 'Password123!';

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Clean existing seed data
  await Tenant.deleteMany({ slug: 'acme' });

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
    { name: 'Regular User', email: 'user@acme.com', role: 'user' },
  ];

  const users = await User.insertMany(
    usersData.map((u) => ({ ...u, passwordHash, tenantId: tenant._id }))
  );
  console.log(`✓ Users created: ${users.map((u) => u.email).join(', ')}`);

  const manager = users.find((u) => u.role === 'manager');

  // 3. Create projects
  await Project.insertMany([
    { title: 'Website Redesign', description: 'Revamp the company website', status: 'active', tenantId: tenant._id, createdBy: manager._id },
    { title: 'Mobile App MVP', description: 'Build first version of the mobile app', status: 'active', tenantId: tenant._id, createdBy: manager._id },
    { title: 'Legacy Migration', description: 'Migrate legacy system to MERN stack', status: 'inactive', tenantId: tenant._id, createdBy: manager._id },
  ]);
  console.log('✓ Projects created');

  console.log('\n─────────────────────────────────────────────');
  console.log('Seed complete. Test credentials:');
  usersData.forEach((u) => console.log(`  ${u.role.padEnd(12)} → ${u.email}  /  ${DEFAULT_PASSWORD}  (tenantSlug: acme)`));
  console.log('─────────────────────────────────────────────');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
