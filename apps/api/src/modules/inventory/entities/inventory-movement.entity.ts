import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Product } from '../../products/entities/product.entity';

export enum MovementType {
  // Legados
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
  AJUSTE = 'AJUSTE',
  // Tipos específicos
  ENTRADA_COMPRA      = 'ENTRADA_COMPRA',
  ENTRADA_AJUSTE      = 'ENTRADA_AJUSTE',
  ENTRADA_DEVOLUCION  = 'ENTRADA_DEVOLUCION',
  SALIDA_VENTA        = 'SALIDA_VENTA',
  SALIDA_MERMA        = 'SALIDA_MERMA',
  SALIDA_AJUSTE       = 'SALIDA_AJUSTE',
}

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  productId: string;

  @ManyToOne(() => Product, { eager: false })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Index()
  @Column({ type: 'enum', enum: MovementType })
  type: MovementType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  stockBefore: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  stockAfter: number;

  @Column({ nullable: true })
  referenceId: string; // invoice ID u otro documento

  @Column({ nullable: true })
  reference: string; // referencia legible (ej: "Compra factura #001")

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  unitCost: number;

  @Column({ nullable: true })
  notes: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
