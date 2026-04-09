export enum UserRole {
  ADMIN = 'ADMIN',
  VENDEDOR = 'VENDEDOR',
}

export enum InvoiceStatus {
  BORRADOR = 'BORRADOR',
  PENDIENTE = 'PENDIENTE',
  AUTORIZADO = 'AUTORIZADO',
  RECHAZADO = 'RECHAZADO',
  ANULADO = 'ANULADO',
}

export enum DocumentType {
  FACTURA = '01',
  NOTA_CREDITO = '04',
  NOTA_DEBITO = '05',
  GUIA_REMISION = '06',
  RETENCION = '07',
  LIQUIDACION_COMPRA = '03',
}

export enum TaxType {
  IVA = 'IVA',
  ICE = 'ICE',
  IRBPNR = 'IRBPNR',
}

export enum IvaRate {
  CERO = 0,
  CINCO = 5,
  OCHO = 8,
  QUINCE = 15,
}

export enum SriAmbiente {
  PRUEBAS = '1',
  PRODUCCION = '2',
}

export enum IdentificationType {
  RUC = '04',
  CEDULA = '05',
  PASAPORTE = '06',
  CONSUMIDOR_FINAL = '07',
}
