import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma Client to avoid creating multiple instances
const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient({
  errorFormat: 'pretty',
});
globalForPrisma.prisma = prisma;

const WORKSPACE_STATE_PREFIX = '__WORKSPACE_STATE_V1__:';
const SHORT_WORKSPACE_ID_PATTERN = /^WS-[A-Za-z0-9]{6}$/;

function generateShortWorkspaceId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'WS-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function defaultWorkspaceState(shortId = generateShortWorkspaceId()) {
  return {
    members: [],
    tasks: [],
    announcements: [],
    settings: {
      visibility: 'private',
      allowMemberTaskCreate: true,
      defaultTaskStatus: 'todo',
    },
    shortId,
  };
}

function isValidShortWorkspaceId(value) {
  return SHORT_WORKSPACE_ID_PATTERN.test(String(value || '').trim());
}

async function workspaceShortIdExists(shortId, excludeWorkspaceId = null) {
  const normalized = String(shortId || '').trim();
  if (!isValidShortWorkspaceId(normalized)) return false;

  const allWorkspaces = await prisma.workspace.findMany({
    select: { id: true, description: true },
  });

  return allWorkspaces.some((workspace) => {
    if (excludeWorkspaceId && workspace.id === excludeWorkspaceId) {
      return false;
    }

    const unpacked = unpackWorkspaceDescription(workspace.description || '');
    return unpacked.state?.shortId === normalized;
  });
}

async function allocateUniqueShortWorkspaceId(excludeWorkspaceId = null) {
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateShortWorkspaceId();
    // eslint-disable-next-line no-await-in-loop
    const exists = await workspaceShortIdExists(candidate, excludeWorkspaceId);
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Unable to allocate a unique workspace short ID');
}

export async function ensureWorkspaceShortId(workspaceRecord) {
  if (!workspaceRecord || !workspaceRecord.id) {
    return null;
  }

  const unpacked = unpackWorkspaceDescription(workspaceRecord.description || '');
  const currentShortId = String(unpacked.state?.shortId || '').trim();

  if (isValidShortWorkspaceId(currentShortId)) {
    const existsElsewhere = await workspaceShortIdExists(currentShortId, workspaceRecord.id);
    if (!existsElsewhere) {
      return {
        shortId: currentShortId,
        workspace: workspaceRecord,
      };
    }
  }

  const nextShortId = await allocateUniqueShortWorkspaceId(workspaceRecord.id);
  const nextState = {
    ...defaultWorkspaceState(nextShortId),
    ...(unpacked.state || {}),
    shortId: nextShortId,
  };

  const nextDescription = packWorkspaceDescription(unpacked.description, nextState);
  const updated = await prisma.workspace.update({
    where: { id: workspaceRecord.id },
    data: { description: nextDescription },
  });

  return {
    shortId: nextShortId,
    workspace: updated,
  };
}

export function unpackWorkspaceDescription(rawDescription) {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return {
      description: '',
      state: defaultWorkspaceState(),
      isPacked: false,
    };
  }

  if (!rawDescription.startsWith(WORKSPACE_STATE_PREFIX)) {
    return {
      description: rawDescription,
      state: defaultWorkspaceState(),
      isPacked: false,
    };
  }

  const encoded = rawDescription.slice(WORKSPACE_STATE_PREFIX.length);
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    return {
      description: parsed?.description || '',
      state: {
        ...defaultWorkspaceState(),
        ...(parsed?.state || {}),
      },
      isPacked: true,
    };
  } catch (error) {
    return {
      description: '',
      state: defaultWorkspaceState(),
      isPacked: false,
    };
  }
}

export function packWorkspaceDescription(description = '', state = defaultWorkspaceState()) {
  const payload = {
    description: description || '',
    state: {
      ...defaultWorkspaceState(),
      ...(state || {}),
    },
  };

  return `${WORKSPACE_STATE_PREFIX}${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`;
}

/**
 * Find existing user or create new one
 * @param {string} provider - "google"
 * @param {object} oauthData - { oauth_id, email, name, avatar }
 */
export async function findOrCreateUser(provider, oauthData) {
  try {
    const { oauth_id, email, name, avatar } = oauthData;
    const username = name || (email ? email.split('@')[0] : 'user');

    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: {
        provider_providerId: {
          provider: provider,
          providerId: oauth_id,
        },
      },
    });

    // Determine role based on email
    const role = email === 'camolid93@gmail.com' ? 'owner' : 'user';

    if (user) {
      // If user exists and email matches special owner email, update their role
      if (email === 'camolid93@gmail.com' && user.role !== 'owner') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'owner' },
        });
      }
      return user;
    }

    // Create new user
    user = await prisma.user.create({
      data: {
        provider: provider,
        providerId: oauth_id,
        email: email,
        name: name,
        username: username,
        avatar: avatar,
        role: role,
      },
    });

    return user;
  } catch (error) {
    console.error('findOrCreateUser error:', error);
    throw error;
  }
}

/**
 * Get all workspaces for a user
 * @param {string} userId - User ID
 */
export async function getUserWorkspaces(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const owned = await prisma.workspace.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const others = await prisma.workspace.findMany({
      where: {
        userId: {
          not: userId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const shared = others.filter((workspace) => {
      const unpacked = unpackWorkspaceDescription(workspace.description || '');
      const members = Array.isArray(unpacked.state?.members) ? unpacked.state.members : [];
      return members.some((member) =>
        member.id === userId ||
        (user?.email && member.email && String(member.email).toLowerCase() === String(user.email).toLowerCase())
      );
    });

    const seen = new Set();
    const combined = [...owned, ...shared].filter((workspace) => {
      if (seen.has(workspace.id)) return false;
      seen.add(workspace.id);
      return true;
    });

    const normalized = await Promise.all(combined.map(async (workspace) => {
      const ensured = await ensureWorkspaceShortId(workspace);
      const withShortId = (ensured && ensured.workspace) ? ensured.workspace : workspace;
      const unpacked = unpackWorkspaceDescription(withShortId.description || '');
      return {
        ...withShortId,
        description: unpacked.description,
        shortId: unpacked.state?.shortId || 'WS-UNKNOWN',
      };
    }));

    return normalized;
  } catch (error) {
    console.error('getUserWorkspaces error:', error);
    throw error;
  }
}

/**
 * Find workspace by short ID or UUID
 * @param {string} identifier - Either full UUID or short ID (WS-XXXXXX)
 */
export async function findWorkspaceByIdentifier(identifier) {
  try {
    // First try as direct UUID
    const byId = await prisma.workspace.findUnique({
      where: { id: identifier },
    });
    if (byId) return byId;

    // Try to find by short ID in packed description
    if (identifier.startsWith('WS-')) {
      const allWorkspaces = await prisma.workspace.findMany();
      for (const workspace of allWorkspaces) {
        const unpacked = unpackWorkspaceDescription(workspace.description || '');
        if (unpacked.state?.shortId === identifier) {
          return workspace;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('findWorkspaceByIdentifier error:', error);
    throw error;
  }
}

/**
 * Create a new workspace
 * @param {string} userId - User ID
 * @param {string} name - Workspace name
 * @param {string} description - Workspace description (optional)
 */
export async function createWorkspace(userId, name, description = '') {
  try {
    const shortId = await allocateUniqueShortWorkspaceId();
    const initialState = defaultWorkspaceState(shortId);

    const workspace = await prisma.workspace.create({
      data: {
        userId: userId,
        name: name,
        description: packWorkspaceDescription(description, initialState),
      },
    });

    return {
      ...workspace,
      description,
      shortId,
    };
  } catch (error) {
    console.error('createWorkspace error:', error);
    throw error;
  }
}

export { prisma };

