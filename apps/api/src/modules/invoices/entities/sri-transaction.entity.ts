import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';

export enum SriTransactionStatus {
  PENDIENTE = 'PENDIENTE',
  ENVIADO = 'ENVIADO',
  AUTORIZADO = 'AUTORIZADO',
  RECHAZADO = 'RECHAZADO',
  ERROR = 'ERROR',
}

@Entity('sri_transactions')
export class SriTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoiceId: string;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice: Invoice;

  @Column({ nullable: true })
  claveAcceso: string;

  @Column({
    type: 'enum',
    enum: SriTransactionStatus,
    default: SriTransactionStatus.PENDIENTE,
  })
  status: SriTransactionStatus;

  @Column({ default: 0 })
  attempts: number;

  @Column({ nullable: true, type: 'text' })
  requestXml: string;

  @Column({ nullable: true, type: 'text' })
  responseRaw: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
