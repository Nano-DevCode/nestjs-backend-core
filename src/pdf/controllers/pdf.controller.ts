import {
  Controller,
  Post,
  Body,
  UseGuards,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '../../common/scalar/scalar.decorators';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserAuthContext } from '../../auth/interfaces/auth.interface';
import { PDF_QUEUE, PDF_JOBS } from '../pdf.constants';
import { GeneratePdfDto } from '../dto/generate-pdf.dto';
import { PdfGeneratorService } from '../services/pdf-generator.service';

@ApiTags('PDF Documents')
@ApiBearerAuth('bearer-jwt')
@Controller('pdf')
@UseGuards(JwtAuthGuard)
export class PdfController {
  constructor(
    @InjectQueue(PDF_QUEUE) private readonly pdfQueue: Queue,
    private readonly pdfGeneratorService: PdfGeneratorService,
  ) {}

  @Post('generate')
  @ApiOperation({
    summary:
      'Encola la generación asíncrona de un documento PDF con plantillas y subida a S3',
  })
  @ApiResponse({
    status: 202,
    description:
      'Trabajo encolado exitosamente para procesamiento en segundo plano',
  })
  async generateAsync(
    @CurrentUser() user: UserAuthContext,
    @Body() dto: GeneratePdfDto,
  ) {
    const job = await this.pdfQueue.add(
      PDF_JOBS.GENERATE,
      {
        templateName: dto.templateName,
        data: dto.data,
        filename: dto.filename,
        userId: user.id,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1500,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return {
      jobId: job.id,
      message: 'Generación de PDF en proceso',
      templateName: dto.templateName,
    };
  }

  @Post('preview-sync')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline; filename="preview.pdf"')
  @ApiOperation({
    summary:
      'Genera sincrónicamente un PDF para previsualización inmediata en el cliente',
  })
  @ApiResponse({
    status: 200,
    description: 'Buffer binario del documento PDF generado',
  })
  async previewSync(@Body() dto: GeneratePdfDto): Promise<StreamableFile> {
    const buffer = await this.pdfGeneratorService.generatePdf(
      dto.templateName,
      dto.data,
    );

    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'inline; filename="preview.pdf"',
    });
  }
}
