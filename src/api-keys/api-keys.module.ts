import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeysService } from './services/api-keys.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { ApiKeysController } from './controllers/api-keys.controller';
import { ExternalController } from './controllers/external.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ApiKeysController, ExternalController],
  providers: [ApiKeysService, ApiKeyAuthGuard],
  exports: [ApiKeysService, ApiKeyAuthGuard],
})
export class ApiKeysModule {}
