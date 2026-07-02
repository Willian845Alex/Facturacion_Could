import { IsString, IsNotEmpty, IsNumber, IsDateString, IsOptional, Min } from 'class-validator';

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  batchNumber: string;

  @IsDateString()
  expirationDate: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsDateString()
  @IsOptional()
  receivedAt?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitCost?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}