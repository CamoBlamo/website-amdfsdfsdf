import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma Client to avoid creating multiple instances
const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
globalForPrisma.prisma = prisma;

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

    if (user) {
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
    const workspaces = await prisma.workspace.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return workspaces;
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
        description: description,
      },
    });
    return workspace;
  } catch (error) {
    console.error('createWorkspace error:', error);
    throw error;
  }
}

export { prisma };
