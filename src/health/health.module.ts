import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [TerminusModule, PrismaModule, FilesModule],
  controllers: [HealthController],
})
export class HealthModule {}
