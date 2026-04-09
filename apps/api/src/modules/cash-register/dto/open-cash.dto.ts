import { IsNumber, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OpenCashDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  initialAmount: number;

  @IsUUID()
  branchId: string;
}
