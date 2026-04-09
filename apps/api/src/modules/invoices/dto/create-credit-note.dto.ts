import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCreditNoteDto {
  @IsString()
  motive: string;

  @IsIn(['TOTAL', 'PARCIAL'])
  type: 'TOTAL' | 'PARCIAL';

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount?: number; // requerido si type=PARCIAL
}
