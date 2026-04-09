import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Datos de la empresa
  @Column()
  ruc: string;

  @Column()
  razonSocial: string;

  @Column()
  nombreComercial: string;

  @Column()
  dirMatriz: string;

  @Column({ nullable: true })
  telefono: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'int', default: 1 })
  ambiente: number; // 1=pruebas, 2=produccion

  @Column({ type: 'int', default: 1 })
  tipoEmision: number; // 1=normal

  // Certificado .p12 cifrado con AES-256
  @Column({ nullable: true, type: 'text' })
  certificadoP12Encrypted: string; // base64(AES-256-GCM(p12 bytes))

  @Column({ nullable: true })
  certificadoPassword: string; // cifrado también

  @Column({ nullable: true })
  certificadoVencimiento: Date;

  // Logo para RIDE
  @Column({ nullable: true, type: 'text' })
  logoBase64: string;

  // Email automático al cliente tras autorización
  @Column({ type: 'boolean', default: true })
  sendInvoiceEmail: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
