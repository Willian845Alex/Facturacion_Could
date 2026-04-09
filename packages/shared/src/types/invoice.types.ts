import { DocumentType, InvoiceStatus, IvaRate } from '../enums';

export interface InvoiceItemDto {
  productId?: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  ivaRate: IvaRate;
  subtotal: number;
  ivaAmount: number;
  total: number;
}

export interface InvoiceTotals {
  subtotalGravado: number;
  subtotal0: number;
  subtotalNoIva: number;
  discount: number;
  iva: number;
  total: number;
}

export interface InvoiceDto {
  id: string;
  secuencial: string;        // 9 dígitos
  claveAcceso: string;       // 49 dígitos
  fechaEmision: Date;
  status: InvoiceStatus;
  documentType: DocumentType;
  clientId: string;
  branchId: string;
  items: InvoiceItemDto[];
  totals: InvoiceTotals;
  xmlAutorizado?: string;
  numeroAutorizacion?: string;
  fechaAutorizacion?: Date;
}
