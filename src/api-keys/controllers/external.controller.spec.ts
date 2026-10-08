import { Test, TestingModule } from '@nestjs/testing';
import { ExternalController } from './external.controller';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '../services/api-keys.service';
import type { ApiKeyRecord } from '../interfaces/api-key.interface';

describe('ExternalController', () => {
  let controller: ExternalController;

  const mockApiKey: ApiKeyRecord = {
    id: 'api-key-1',
    name: 'Partner Integrator',
    keyPrefix: 'live_prefix',
    keyHash: 'hash',
    scopes: ['students:read', 'grades:verify'],
    rateLimit: 100,
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExternalController],
      providers: [
        { provide: Reflector, useValue: {} },
        { provide: ApiKeysService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ExternalController>(ExternalController);
  });

  describe('getStatus', () => {
    it('debe retornar estado y metadatos de la API Key autenticada', () => {
      const status = controller.getStatus(mockApiKey);

      expect(status.status).toBe('authenticated');
      expect(status.partner).toBe('Partner Integrator');
      expect(status.scopes).toEqual(['students:read', 'grades:verify']);
    });
  });

  describe('getStudents', () => {
    it('debe listar alumnos autorizados por la API Key', () => {
      const result = controller.getStudents(mockApiKey);

      expect(result.authorizedBy).toBe('Partner Integrator');
      expect(result.students).toHaveLength(3);
    });
  });

  describe('verifyGrades', () => {
    it('debe retornar certificación válida para la matrícula provista', () => {
      const result = controller.verifyGrades(mockApiKey, {
        matricula: '2026-CS-99',
      });

      expect(result.verified).toBe(true);
      expect(result.matricula).toBe('2026-CS-99');
      expect(result.validationStatus).toBe('CERTIFICADO_OFICIAL_VALIDO');
    });
  });
});
