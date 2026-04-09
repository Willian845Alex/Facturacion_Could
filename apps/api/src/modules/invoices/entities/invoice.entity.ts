import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { DocumentType, InvoiceStatus } from '@facturacion-ec/shared';
import { Client } from '../../clients/entities/client.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { User } from '../../users/entities/user.entity';
import { InvoiceItem } from './invoice-item.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 49, nullable: true })
  claveAcceso: string | null;

  @Column({ type: 'varchar', length: 9, nullable: true })
  secuencial: string | null;

  @Column({ type: 'enum', enum: DocumentType, default: DocumentType.FACTURA })
  documentType: DocumentType;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.BORRADOR })
  status: InvoiceStatus;

  @Column({ type: 'timestamptz' })
  fechaEmision: Date;

  @Column()
  clientId: string;

  @ManyToOne(() => Client, { eager: false })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column()
  branchId: string;

  @ManyToOne(() => Branch, { eager: false })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @Column()
  userId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => InvoiceItem, item => item.invoice, { cascade: true, eager: true })
  items: InvoiceItem[];

  // Totales
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal12: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal0: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDescuento: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalIva: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  importeTotal: number;

  // SRI
  @Column({ nullable: true, type: 'text' })
  xmlSinFirma: string;

  @Column({ nullable: true, type: 'text' })
  xmlFirmado: string;

  @Column({ nullable: true, type: 'text' })
  xmlAutorizado: string;

  @Column({ nullable: true })
  numeroAutorizacion: string;

  @Column({ nullable: true, type: 'timestamptz' })
  fechaAutorizacion: Date;

  @Column({ nullable: true, type: 'text' })
  mensajesRespuesta: string;

  // Pago
  @Column({ default: '01' })
  formaPago: string; // 01=SIN UTILIZACION DEL SISTEMA FINANCIERO (efectivo)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
