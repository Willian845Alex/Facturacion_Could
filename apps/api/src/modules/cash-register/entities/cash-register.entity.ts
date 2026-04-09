import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum CashRegisterStatus {
  ABIERTA = 'ABIERTA',
  CERRADA = 'CERRADA',
}

@Entity('cash_registers')
export class CashRegister {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column()
  branchId: string;

  @Column({ type: 'enum', enum: CashRegisterStatus, default: CashRegisterStatus.ABIERTA })
  status: CashRegisterStatus;

  @CreateDateColumn()
  openedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  initialAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalSales: number;

  @Column({ type: 'int', default: 0 })
  totalInvoices: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalCash: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalCard: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalTransfer: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  expectedAmount: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  actualAmount: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  difference: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
