jest.mock('uuid', () => ({ v4: () => 'mocked-uuid' }));
jest.mock('@nestjs/swagger', () => ({
  ApiTags: () => () => {},
  ApiBearerAuth: () => () => {},
  ApiCookieAuth: () => () => {},
  ApiOperation: () => () => {},
  ApiConsumes: () => () => {},
  ApiBody: () => () => {},
  ApiProperty: () => () => {},
  ApiResponse: () => () => {},
}));
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    return class MockAuthGuard {
      canActivate() {
        return true;
      }
    };
  },
  PassportStrategy: () => {
    return class MockPassportStrategy {};
  },
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { RolesGuard, PermissionsGuard, JwtAuthGuard } from '../auth/guards';
import {
  ROLES_KEY,
  PERMISSIONS_KEY,
  IS_PUBLIC_KEY,
} from '../auth/decorators/auth.decorator';

describe('FilesController RBAC & Guards', () => {
  let controller: FilesController;
  let filesService: Partial<FilesService>;
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let permissionsGuard: PermissionsGuard;

  beforeEach(() => {
    filesService = {
      uploadFile: jest.fn(),
      deleteFileByName: jest.fn(),
      getFileUrl: jest.fn().mockReturnValue('/api/files/view/test.webp'),
      getFileStream: jest.fn().mockResolvedValue({
        stream: { pipe: jest.fn() },
        contentType: 'image/webp',
      }),
    };
    controller = new FilesController(filesService as FilesService);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    permissionsGuard = new PermissionsGuard(reflector);
  });

  function createMockContext(
    handler: (...args: unknown[]) => unknown,
    user?: { roles?: string[]; permissions?: string[] },
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => FilesController,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('Controller Guards & Metadata', () => {
    it('should have guards applied at class level: JwtAuthGuard, RolesGuard, PermissionsGuard', () => {
      const guards = Reflect.getMetadata('__guards__', FilesController);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
      expect(guards).toContain(PermissionsGuard);
    });

    it('uploadFile should have @RequirePermissions("files.upload") and @Roles("admin", "user")', () => {
      const perms = reflector.get(PERMISSIONS_KEY, controller.uploadFile);
      const roles = reflector.get(ROLES_KEY, controller.uploadFile);
      expect(perms).toEqual(['files.upload']);
      expect(roles).toEqual(['admin', 'user']);
    });

    it('uploadMultipleFiles should have @RequirePermissions("files.upload") and @Roles("admin", "user")', () => {
      const perms = reflector.get(
        PERMISSIONS_KEY,
        controller.uploadMultipleFiles,
      );
      const roles = reflector.get(ROLES_KEY, controller.uploadMultipleFiles);
      expect(perms).toEqual(['files.upload']);
      expect(roles).toEqual(['admin', 'user']);
    });

    it('getPublicFile should have @Public()', () => {
      const isPublic = reflector.get(IS_PUBLIC_KEY, controller.getPublicFile);
      expect(isPublic).toBe(true);
    });

    it('viewFile should have @RequirePermissions("files.read") and @Roles("admin", "user")', () => {
      const perms = reflector.get(PERMISSIONS_KEY, controller.viewFile);
      const roles = reflector.get(ROLES_KEY, controller.viewFile);
      expect(perms).toEqual(['files.read']);
      expect(roles).toEqual(['admin', 'user']);
    });

    it('getFileUrl should have @RequirePermissions("files.read") and @Roles("admin", "user")', () => {
      const perms = reflector.get(PERMISSIONS_KEY, controller.getFileUrl);
      const roles = reflector.get(ROLES_KEY, controller.getFileUrl);
      expect(perms).toEqual(['files.read']);
      expect(roles).toEqual(['admin', 'user']);
    });

    it('getFile should have @RequirePermissions("files.read") and @Roles("admin", "user")', () => {
      const perms = reflector.get(PERMISSIONS_KEY, controller.getFile);
      const roles = reflector.get(ROLES_KEY, controller.getFile);
      expect(perms).toEqual(['files.read']);
      expect(roles).toEqual(['admin', 'user']);
    });

    it('deleteFile should have @RequirePermissions("files.delete") and @Roles("admin")', () => {
      const perms = reflector.get(PERMISSIONS_KEY, controller.deleteFile);
      const roles = reflector.get(ROLES_KEY, controller.deleteFile);
      expect(perms).toEqual(['files.delete']);
      expect(roles).toEqual(['admin']);
    });
  });

  describe('RBAC Guards Execution', () => {
    it('public endpoint should bypass RolesGuard and PermissionsGuard', () => {
      const ctx = createMockContext(controller.getPublicFile, undefined);
      expect(rolesGuard.canActivate(ctx)).toBe(true);
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('upload endpoint: allows user with "user" role and "files.upload" permission', () => {
      const ctx = createMockContext(controller.uploadFile, {
        roles: ['user'],
        permissions: ['files.upload'],
      });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('upload endpoint: allows user with colon format "files:upload"', () => {
      const ctx = createMockContext(controller.uploadFile, {
        roles: ['user'],
        permissions: ['files:upload'],
      });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('upload endpoint: allows admin role even with empty permissions array', () => {
      const ctx = createMockContext(controller.uploadFile, {
        roles: ['admin'],
        permissions: [],
      });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('upload endpoint: rejects user with empty permissions array with 403 Forbidden', () => {
      const ctx = createMockContext(controller.uploadFile, {
        roles: ['user'],
        permissions: [],
      });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(
        ForbiddenException,
      );
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(
        'No tienes los permisos necesarios para acceder a este recurso',
      );
    });

    it('upload endpoint: rejects user with missing user/roles with 403 Forbidden', () => {
      const ctx = createMockContext(controller.uploadFile, {
        roles: [],
        permissions: [],
      });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(
        'No tienes los permisos necesarios para acceder a este recurso',
      );
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(
        ForbiddenException,
      );
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(
        'No tienes los permisos necesarios para acceder a este recurso',
      );
    });

    it('delete endpoint: allows admin role', () => {
      const ctx = createMockContext(controller.deleteFile, {
        roles: ['admin'],
        permissions: [],
      });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('delete endpoint: allows user with "files.delete" permission', () => {
      const ctx = createMockContext(controller.deleteFile, {
        roles: ['user'],
        permissions: ['files.delete'],
      });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('delete endpoint: rejects regular user without "files.delete" with 403', () => {
      const ctx = createMockContext(controller.deleteFile, {
        roles: ['user'],
        permissions: ['files.read'],
      });
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(
        'No tienes los permisos necesarios para acceder a este recurso',
      );
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(
        ForbiddenException,
      );
    });

    it('view endpoint: allows user with "files.read" permission', () => {
      const ctx = createMockContext(controller.getFile, {
        roles: ['user'],
        permissions: ['files.read'],
      });
      expect(rolesGuard.canActivate(ctx)).toBe(true);
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('view endpoint: rejects user without "files.read" permission with 403', () => {
      const ctx = createMockContext(controller.getFile, {
        roles: ['user'],
        permissions: ['files.upload'],
      });
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(
        ForbiddenException,
      );
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(
        'No tienes los permisos necesarios para acceder a este recurso',
      );
    });
  });
});
