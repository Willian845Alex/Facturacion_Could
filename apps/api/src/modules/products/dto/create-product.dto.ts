import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { IvaRate, TaxType } from '@facturacion-ec/shared';

export class CreateProductDto {
  @IsString()
  code: string;

  @IsString()
  @IsOptional()
  auxiliaryCode?: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  cost?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsBoolean()
  @IsOptional()
  isService?: boolean;

  @IsEnum(TaxType)
  @IsOptional()
  taxType?: TaxType;

  @IsEnum(IvaRate)
  @IsOptional()
  ivaRate?: IvaRate;

  @IsBoolean()
  @IsOptional()
  trackInventory?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minStock?: number;
}
