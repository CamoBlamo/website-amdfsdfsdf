import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma Client to avoid creating multiple instances
const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
globalForPrisma.prisma = prisma;

const WORKSPACE_STATE_PREFIX = '__WORKSPACE_STATE_V1__:';

function defaultWorkspaceState() {
  return {
    members: [],
    tasks: [],
    announcements: [],
    settings: {
      visibility: 'private',
      allowMemberTaskCreate: true,
      defaultTaskStatus: 'todo',
    },
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
 * @param {string} provider - "google" or "discord"
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

    return combined.map((workspace) => {
      const unpacked = unpackWorkspaceDescription(workspace.description || '');
      return {
        ...workspace,
        description: unpacked.description,
      };
    });
  } catch (error) {
    console.error('getUserWorkspaces error:', error);
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
    const workspace = await prisma.workspace.create({
      data: {
        userId: userId,
        name: name,
        description: packWorkspaceDescription(description, defaultWorkspaceState()),
      },
    });

    return {
      ...workspace,
      description,
    };
  } catch (error) {
    console.error('createWorkspace error:', error);
    throw error;
  }
}

export { prisma };

