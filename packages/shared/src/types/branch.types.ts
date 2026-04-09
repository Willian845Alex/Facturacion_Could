export interface BranchDto {
  id: string;
  name: string;
  address: string;
  codigoEstablecimiento: string; // 3 dígitos SRI
  puntoEmision: string;          // 3 dígitos SRI
  isActive: boolean;
}
