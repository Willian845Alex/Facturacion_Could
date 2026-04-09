import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CloseCashDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualAmount: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
