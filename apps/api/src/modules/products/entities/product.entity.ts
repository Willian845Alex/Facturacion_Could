import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { IvaRate, TaxType } from '@facturacion-ec/shared';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @Column({ nullable: true })
  auxiliaryCode: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  price: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0, nullable: true })
  cost: number; // precio de costo/compra (para promedio ponderado)

  @Column({ nullable: true })
  unit: string;

  @Column({ default: false })
  isService: boolean;

  @Column({ type: 'enum', enum: TaxType, default: TaxType.IVA })
  taxType: TaxType;

  @Column({ type: 'enum', enum: IvaRate, default: IvaRate.QUINCE })
  ivaRate: IvaRate;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  stock: number;

  @Column({ default: false })
  trackInventory: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  minStock: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
