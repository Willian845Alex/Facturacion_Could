import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Invoice } from './invoice.entity';

export enum CreditNoteStatus {
  PENDIENTE  = 'PENDIENTE',
  AUTORIZADO = 'AUTORIZADO',
  RECHAZADO  = 'RECHAZADO',
}

@Entity('credit_notes')
export class CreditNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  originalInvoiceId: string;

  @ManyToOne(() => Invoice, { eager: false })
  @JoinColumn({ name: 'originalInvoiceId' })
  originalInvoice: Invoice;

  @Column({ nullable: true })
  sequential: string; // 000000001

  @Index({ unique: true })
  @Column({ nullable: true, unique: true })
  claveAcceso: string;

  @Column({ type: 'text' })
  motive: string;

  @Column({ default: 'TOTAL' })
  type: string; // 'TOTAL' | 'PARCIAL'

  @Column({ type: 'enum', enum: CreditNoteStatus, default: CreditNoteStatus.PENDIENTE })
  status: CreditNoteStatus;

  @Column({ type: 'timestamptz' })
  issueDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

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

  @Column()
  branchId: string;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
