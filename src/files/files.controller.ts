import 'multer';
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  BadRequestException,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '../common/scalar/scalar.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  Roles,
  RequirePermissions,
  Public,
} from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { MAX_FILE_SIZE } from './files.constants';

@ApiTags('Files')
@ApiBearerAuth('bearer-jwt')
@ApiCookieAuth('cookie-jwt')
@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @RequirePermissions('files.upload')
  @Roles('admin', 'user')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Sube y procesa un archivo (optimización WebP y escaneo ClamAV en caliente)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo a subir (máx 5 MB)',
        },
        customName: {
          type: 'string',
          description: 'Nombre personalizado opcional para el archivo',
        },
        bucket: {
          type: 'string',
          description: 'Bucket de destino en S3 (opcional)',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  @ApiResponse({
    status: 201,
    description: 'Archivo subido y procesado exitosamente',
    type: FileResponseDto,
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ): Promise<FileResponseDto> {
    if (!file) {
      throw new BadRequestException('El campo "file" es obligatorio');
    }

    return this.filesService.uploadFile({
      file,
      customName: dto.customName,
      bucket: dto.bucket,
    });
  }

  @Post('process-image')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('files.upload')
  @Roles('admin', 'user')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Encola una imagen para optimización asíncrona WebP (variantes Estándar y Miniatura) en BullMQ',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Imagen a procesar (JPEG, PNG, WebP, etc. máx 5 MB)',
        },
        bucket: {
          type: 'string',
          description: 'Bucket de destino en S3 (opcional)',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  @ApiResponse({
    status: 202,
    description:
      'Imagen encolada exitosamente para procesamiento asíncrono en segundo plano',
  })
  async processImage(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Body('bucket') bucket?: string,
  ) {
    if (!file) {
      throw new BadRequestException('El campo "file" es obligatorio');
    }

    return this.filesService.enqueueImageOptimization({
      file,
      userId: userId || 'anonymous',
      bucket,
    });
  }

  @Post('upload-multiple')
  @RequirePermissions('files.upload')
  @Roles('admin', 'user')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Sube y procesa múltiples archivos (hasta 10 archivos de máx 5 MB c/u)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Lista de archivos a subir',
        },
        customName: {
          type: 'string',
          description: 'Prefijo o nombre base opcional',
        },
        bucket: {
          type: 'string',
          description: 'Bucket de destino en S3 (opcional)',
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  @ApiResponse({
    status: 201,
    description: 'Lista de archivos subidos y procesados exitosamente',
    type: [FileResponseDto],
  })
  async uploadMultipleFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadFileDto,
  ): Promise<FileResponseDto[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'Debes subir al menos un archivo en "files"',
      );
    }

    return Promise.all(
      files.map((file) =>
        this.filesService.uploadFile({
          file,
          customName: dto.customName,
          bucket: dto.bucket,
        }),
      ),
    );
  }

  @Get('public/:key')
  @Public()
  @ApiOperation({
    summary:
      'Transmite y visualiza un archivo público sin requerir autenticación',
  })
  async getPublicFile(
    @Param('key') key: string,
    @Query('bucket') bucket: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, contentType } = await this.filesService.getFileStream(
      key,
      bucket,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${key}"`);

    stream.pipe(res);
  }

  @Get('view/:key')
  @RequirePermissions('files.read')
  @Roles('admin', 'user')
  @ApiOperation({
    summary:
      'Transmite y visualiza un archivo privado en streaming (requiere permiso files.read)',
  })
  async viewFile(
    @Param('key') key: string,
    @Query('bucket') bucket: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, contentType } = await this.filesService.getFileStream(
      key,
      bucket,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${key}"`);

    stream.pipe(res);
  }

  @Get(':key/url')
  @RequirePermissions('files.read')
  @Roles('admin', 'user')
  @ApiOperation({
    summary: 'Obtiene la URL relativa autenticada de un archivo privado',
  })
  getFileUrl(
    @Param('key') key: string,
    @Query('bucket') bucket?: string,
  ): { key: string; url: string } {
    const url = this.filesService.getFileUrl(key, bucket);
    return { key, url };
  }

  @Get(':key')
  @RequirePermissions('files.read')
  @Roles('admin', 'user')
  @ApiOperation({
    summary:
      'Consulta o descarga un archivo privado por su clave vía streaming',
  })
  async getFile(
    @Param('key') key: string,
    @Query('bucket') bucket: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, contentType } = await this.filesService.getFileStream(
      key,
      bucket,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${key}"`);

    stream.pipe(res);
  }

  @Delete(':key')
  @RequirePermissions('files.delete')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Elimina un archivo de SeaweedFS/S3 (requiere permiso files.delete o rol admin)',
  })
  async deleteFile(
    @Param('key') key: string,
    @Query('bucket') bucket?: string,
  ): Promise<{ message: string }> {
    return this.filesService.deleteFileByName(key, bucket);
  }
}
