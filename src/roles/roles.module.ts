import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesQueryService } from './roles-query.service';
import { RolesController } from './roles.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, UsersModule, AuditModule, AuthModule],
  providers: [RolesService, RolesQueryService],
  controllers: [RolesController],
  exports: [RolesService, RolesQueryService],
})
export class RolesModule {}

