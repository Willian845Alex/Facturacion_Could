import { IsString, Length, IsOptional } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsString()
  @Length(3, 3, { message: 'Debe tener exactamente 3 dígitos' })
  codigoEstablecimiento: string;

  @IsString()
  @Length(3, 3, { message: 'Debe tener exactamente 3 dígitos' })
  puntoEmision: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
