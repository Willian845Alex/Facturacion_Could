import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductBatch } from './entities/product-batch.entity';
import { Product } from '../products/entities/product.entity';
import { ProductBatchesService } from './product-batches.service';
import { ProductBatchesController } from './product-batches.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductBatch, Product])],
  controllers: [ProductBatchesController],
  providers: [ProductBatchesService],
  exports: [ProductBatchesService],
})
export class ProductBatchesModule {}