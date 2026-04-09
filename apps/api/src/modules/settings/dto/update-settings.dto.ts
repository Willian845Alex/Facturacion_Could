import { IsString, IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator';

export class UpdateSettingsDto {
  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  razonSocial?: string;

  @IsString()
  @IsOptional()
  nombreComercial?: string;

  @IsString()
  @IsOptional()
  dirMatriz?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsInt()
  @Min(1)
  @Max(2)
  @IsOptional()
  ambiente?: number;

  @IsString()
  @IsOptional()
  logoBase64?: string;

  @IsBoolean()
  @IsOptional()
  sendInvoiceEmail?: boolean;
}
