import { IsEnum, IsString, IsOptional, IsEmail } from 'class-validator';
import { IdentificationType } from '@facturacion-ec/shared';

export class CreateClientDto {
  @IsEnum(IdentificationType)
  identificationType: IdentificationType;

  @IsString()
  identification: string;

  @IsString()
  name: string;

  @IsEmail()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
