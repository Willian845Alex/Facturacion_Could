import { IdentificationType } from '../enums';

export interface ClientDto {
  id: string;
  identificationType: IdentificationType;
  identification: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  isActive: boolean;
}
