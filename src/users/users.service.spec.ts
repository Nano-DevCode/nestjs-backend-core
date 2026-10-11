import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';
import { PasswordService } from '../auth/password.service';
import { UsersHierarchyService } from './users-hierarchy.service';
import { UsersQueryService } from './users-query.service';

describe('UsersService', () => {
  let service: UsersService;

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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
