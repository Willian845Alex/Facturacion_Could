import { IvaRate, TaxType } from '../enums';

export interface ProductDto {
  id: string;
  code: string;
  name: string;
  description?: string;
  price: number;
  taxType: TaxType;
  ivaRate: IvaRate;
  stock?: number;
  trackInventory: boolean;
  isActive: boolean;
}
