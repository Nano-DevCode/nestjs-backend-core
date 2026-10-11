import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersQueryService } from './users-query.service';
import { UsersHierarchyService } from './users-hierarchy.service';
import { UsersController } from './users.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [UsersService, UsersQueryService, UsersHierarchyService],
  controllers: [UsersController],
  exports: [UsersService, UsersQueryService, UsersHierarchyService],
})
export class UsersModule {}

