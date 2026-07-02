import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProductBatches1781900000000 implements MigrationInterface {
    name = 'CreateProductBatches1781900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "product_batches" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "productId" uuid NOT NULL,
                "batchNumber" character varying NOT NULL,
                "expirationDate" date NOT NULL,
                "quantity" numeric(10,2) NOT NULL,
                "remainingQuantity" numeric(10,2) NOT NULL,
                "receivedAt" date,
                "unitCost" numeric(10,4),
                "notes" character varying,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_product_batches_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_product_batches_productId" ON "product_batches" ("productId")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_product_batches_expirationDate" ON "product_batches" ("expirationDate")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_product_batches_isActive" ON "product_batches" ("isActive")
        `);

        await queryRunner.query(`
            ALTER TABLE "product_batches"
            ADD CONSTRAINT "FK_product_batches_productId"
            FOREIGN KEY ("productId") REFERENCES "products"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_batches" DROP CONSTRAINT "FK_product_batches_productId"`);
        await queryRunner.query(`DROP INDEX "IDX_product_batches_isActive"`);
        await queryRunner.query(`DROP INDEX "IDX_product_batches_expirationDate"`);
        await queryRunner.query(`DROP INDEX "IDX_product_batches_productId"`);
        await queryRunner.query(`DROP TABLE "product_batches"`);
    }
}