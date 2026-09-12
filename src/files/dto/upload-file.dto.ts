import { IsOptional, IsString } from 'class-validator';

export class UploadFileDto {
  @IsOptional()
  @IsString()
  customName?: string;

  @IsOptional()
  @IsString()
  bucket?: string;
}
