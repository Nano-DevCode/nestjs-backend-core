import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import { PasswordService } from '../auth/password.service';
import { UsersHierarchyService } from './users-hierarchy.service';
import { UsersQueryService } from './users-query.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            user: {
              findFirst: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
          },
        },
        {
          provide: SessionService,
          useValue: {
            revokeAllUserSessions: jest.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            hash: jest.fn(),
            validatePasswordStrength: jest.fn(),
          },
        },
        {
          provide: UsersHierarchyService,
          useValue: {
            assertNotSelf: jest.fn(),
            assertCanManageTarget: jest.fn(),
            assertCanAssignRoles: jest.fn(),
          },
        },
        {
          provide: UsersQueryService,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    passwordService = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should combine firstName, firstLastName, and secondLastName into user.name upon creation', async () => {
    (passwordService.hash as jest.Mock).mockResolvedValue('hashed-pass');

    const createdUserData = {
      id: 'user-1',
      email: 'test@sistema.com',
      name: 'Juan Carlos Pérez Gómez',
      profile: {
        firstName: 'Juan Carlos',
        firstLastName: 'Pérez',
        secondLastName: 'Gómez',
        lastName: 'Pérez Gómez',
      },
    };

    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        role: {
          findFirst: jest.fn().mockResolvedValue({ id: 'role-user-id', name: 'user' }),
        },
        user: {
          create: jest.fn().mockResolvedValue(createdUserData),
        },
      };
      return callback(tx);
    });

    const result = await service.create({
      email: 'test@sistema.com',
      password: 'Password123!',
      profile: {
        firstName: 'Juan Carlos',
        firstLastName: 'Pérez',
        secondLastName: 'Gómez',
      },
    });

    expect(result.message).toBe('Usuario creado exitosamente');
    expect(result.user.name).toBe('Juan Carlos Pérez Gómez');
  });
});
