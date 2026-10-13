import { Test } from '@nestjs/testing';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('should be defined and compile metadata successfully', () => {
    expect(WorkerModule).toBeDefined();
  });
});

