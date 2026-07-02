import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

/**
 * Lote de un producto — permite que un mismo producto tenga varias
 * existencias con distinta fecha de caducidad al mismo tiempo.
 *
 * NOTA: por ahora este registro es informativo/de control. La venta
 * (descuento de stock) sigue operando sobre Product.stock como antes,
 * sin descontar de un lote específico. Cuando se decida implementar
 * descuento FEFO, este será el punto de partida.
 */
@Entity('product_batches')
export class ProductBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  productId: string;

  @ManyToOne(() => Product, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  /** Número o código de lote impreso en el empaque */
  @Column()
  batchNumber: string;

  /** Fecha de caducidad del lote */
  @Index()
  @Column({ type: 'date' })
  expirationDate: Date;

  /** Cantidad de unidades que ingresaron en este lote */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  /** Cantidad restante del lote (se reduce manualmente o por ajuste,
   *  no automáticamente por venta — ver nota de la clase) */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  remainingQuantity: number;

  /** Fecha en que se registró el ingreso de este lote */
  @Column({ type: 'date', nullable: true })
  receivedAt: Date;

  /** Costo unitario de compra de este lote (opcional, para trazabilidad) */
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  unitCost: number;

  @Column({ nullable: true })
  notes: string;

  /** Permite "cerrar" un lote agotado sin borrarlo (trazabilidad histórica) */
  @Index()
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}