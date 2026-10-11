import type { Prisma } from '../../../prisma/generated/prisma/client';

export const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: {
        select: {
          name: true,
          priority: true,
        },
      },
    },
  },
  twoFactor: {
    select: {
      isEnabled: true,
    },
  },
} satisfies Prisma.UserSelect;

export const USER_DETAIL_SELECT = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: {
        select: {
          name: true,
          priority: true,
          permissions: {
            select: {
              permission: {
                select: { slug: true },
              },
            },
          },
        },
      },
    },
  },
  profile: {
    select: {
      firstName: true,
      firstLastName: true,
      secondLastName: true,
      lastName: true,
      avatarUrl: true,
      bio: true,
    },
  },
} satisfies Prisma.UserSelect;

