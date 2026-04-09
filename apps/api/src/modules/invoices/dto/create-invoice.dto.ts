import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsNumber, IsOptional, IsString, IsUUID,
  Min, ValidateNested,
} from 'class-validator';

export class CreateInvoiceItemDto {
  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsString()
  code: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  discount?: number;

  @IsNumber()
  @IsOptional()
  ivaRate?: number; // 0, 5, 8, 12, 15
}

export class CreateInvoiceDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  branchId: string;

  @IsString()
  @IsOptional()
  fechaEmision?: string; // ISO date, default: now

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsString()
  @IsOptional()
  formaPago?: string; // default: '01'

  @IsOptional()
  infoAdicional?: { nombre: string; valor: string }[];

  @IsBoolean()
  @IsOptional()
  draft?: boolean;
}
