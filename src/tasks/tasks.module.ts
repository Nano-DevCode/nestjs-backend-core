import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, FilesModule],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
