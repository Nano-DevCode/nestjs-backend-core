import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '../common/scalar/scalar.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles, RequirePermissions } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserAuthContext } from '../auth/interfaces/auth.interface';
import { S3StorageService } from './services/s3-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeSafeFilename } from './utils/magic-bytes.util';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_BUCKET } from './files.constants';
import {
  CreatePresignedUrlDto,
  ConfirmUploadDto,
} from './dto/presigned-url.dto';

@ApiTags('Files Mobile')
@ApiBearerAuth('bearer-jwt')
@Controller('files/mobile')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MobileFilesController {
  constructor(
    private readonly s3StorageService: S3StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('presigned-url')
  @RequirePermissions('files.upload')
  @Roles('admin', 'user')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Genera una URL prefirmada S3 (PUT) para subida directa desde clientes móviles',
  })
  @ApiResponse({
    status: 200,
    description:
      'URL prefirmada generada exitosamente con expiración de 10 minutos',
  })
  async createPresignedUrl(@Body() dto: CreatePresignedUrlDto) {
    const bucket = dto.bucket || DEFAULT_BUCKET;
    const sanitizedName = sanitizeSafeFilename(dto.filename, '.bin');
    const safeKey = `${uuidv4()}-${sanitizedName}`;

    const presigned = await this.s3StorageService.generatePresignedUploadUrl(
      safeKey,
      bucket,
      dto.contentType,
      dto.fileSize,
      600,
    );

    return {
      uploadUrl: presigned.uploadUrl,
      fileKey: presigned.key,
      bucket: presigned.bucket,
      method: presigned.method,
      expiresIn: presigned.expiresIn,
      headers: {
        'Content-Type': dto.contentType,
      },
    };
  }

  @Post('confirm-upload')
  @RequirePermissions('files.upload')
  @Roles('admin', 'user')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Confirma la subida directa del archivo a SeaweedFS y registra sus metadatos',
  })
  @ApiResponse({
    status: 201,
    description: 'Archivo confirmado y registrado en la base de datos',
  })
  async confirmUpload(
    @CurrentUser() user: UserAuthContext,
    @Body() dto: ConfirmUploadDto,
  ) {
    const bucket = dto.bucket || DEFAULT_BUCKET;

    // Verificar que el archivo realmente exista en el almacenamiento S3/SeaweedFS
    const exists = await this.s3StorageService.objectExists(
      bucket,
      dto.fileKey,
    );
    if (!exists) {
      throw new BadRequestException(
        'El archivo no fue encontrado en el almacenamiento. Verifica que la subida HTTP PUT haya finalizado exitosamente.',
      );
    }

    // Persistir metadatos en la base de datos
    const record = await this.prisma.storedFile.upsert({
      where: { key: dto.fileKey },
      create: {
        key: dto.fileKey,
        bucket,
        originalName: dto.originalName,
        mimetype: dto.mimetype,
        size: dto.size,
        scanStatus: 'PENDING',
        uploadedBy: user.id,
      },
      update: {
        size: dto.size,
        mimetype: dto.mimetype,
      },
    });

    return {
      status: 'confirmed',
      file: record,
      message: 'Archivo confirmado y registrado exitosamente en el sistema.',
    };
  }
}
