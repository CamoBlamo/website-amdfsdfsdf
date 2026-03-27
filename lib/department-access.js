import { prisma } from './db.js';

export const DEPARTMENT_VALUES = ['customer-support', 'public-relations', 'beta-tester'];

let ensurePromise = null;

function sanitizeDepartment(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'support' || normalized === 'customer support' || normalized === 'customer-support') {
    return 'customer-support';
  }
  if (normalized === 'pr' || normalized === 'public relations' || normalized === 'public-relations') {
    return 'public-relations';
  }
  if (normalized === 'beta' || normalized === 'beta tester' || normalized === 'beta-tester') {
    return 'beta-tester';
  }
  return DEPARTMENT_VALUES.includes(normalized) ? normalized : '';
}

function normalizeDepartments(input) {
  if (!input) return [];

  const values = Array.isArray(input)
    ? input
    : String(input)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  const result = [];
  const seen = new Set();

  values.forEach((value) => {
    const next = sanitizeDepartment(value);
    if (!next || seen.has(next)) return;
    seen.add(next);
    result.push(next);
  });

  return result;
}

async function ensureDepartmentTable() {
  if (!ensurePromise) {
    ensurePromise = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_department_assignments (
        user_id TEXT PRIMARY KEY,
        departments TEXT NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  await ensurePromise;
}

function parseDepartments(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(String(rawValue));
    return normalizeDepartments(parsed);
  } catch (_) {
    return normalizeDepartments(String(rawValue));
  }
}

export async function getUserDepartments(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return [];

  await ensureDepartmentTable();

  const rows = await prisma.$queryRawUnsafe(
    'SELECT departments FROM user_department_assignments WHERE user_id = $1 LIMIT 1',
    safeUserId,
  );

  if (!Array.isArray(rows) || !rows.length) return [];
  return parseDepartments(rows[0].departments);
}

export async function getDepartmentMapForUsers(userIds) {
  await ensureDepartmentTable();

  const normalizedIds = Array.from(new Set((Array.isArray(userIds) ? userIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)));

  if (!normalizedIds.length) {
    return new Map();
  }

  const placeholders = normalizedIds.map((_, index) => `$${index + 1}`).join(', ');
  const rows = await prisma.$queryRawUnsafe(
    `SELECT user_id, departments FROM user_department_assignments WHERE user_id IN (${placeholders})`,
    ...normalizedIds,
  );

  const map = new Map();
  normalizedIds.forEach((id) => map.set(id, []));

  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      const userId = String(row.user_id || '').trim();
      if (!userId) return;
      map.set(userId, parseDepartments(row.departments));
    });
  }

  return map;
}

export async function setUserDepartments(userId, departments) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) {
    throw new Error('Missing userId');
  }

  const normalized = normalizeDepartments(departments);
  await ensureDepartmentTable();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO user_department_assignments (user_id, departments, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET departments = EXCLUDED.departments, updated_at = NOW()
    `,
    safeUserId,
    JSON.stringify(normalized),
  );

  return normalized;
}

export function hasDepartment(departments, department) {
  const target = sanitizeDepartment(department);
  if (!target) return false;
  return normalizeDepartments(departments).includes(target);
}

export function normalizeDepartmentList(input) {
  return normalizeDepartments(input);
}
