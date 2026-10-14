import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditQueryService } from './audit-query.service';
import { AuditController } from './audit.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [AuditService, AuditQueryService],
  controllers: [AuditController],
  exports: [AuditService, AuditQueryService],
})
export class AuditModule {}
