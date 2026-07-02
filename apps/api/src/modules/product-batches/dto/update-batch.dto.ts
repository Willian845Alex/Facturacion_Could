import { IsString, IsNumber, IsDateString, IsOptional, IsBoolean, Min } from 'class-validator';

export class UpdateBatchDto {
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  expirationDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  remainingQuantity?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}