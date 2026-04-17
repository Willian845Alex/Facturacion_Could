import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1776398874662 implements MigrationInterface {
    name = 'InitialSchema1776398874662'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_873f570c6b40132f2b037d6c70" ON "products" ("auxiliaryCode") `);
        await queryRunner.query(`CREATE INDEX "IDX_4c9fb58de893725258746385e1" ON "products" ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_ff39b9ac40872b2de41751eedc" ON "products" ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_5c4d8ad8a8acf0b5ae849ae168" ON "invoices" ("secuencial") `);
        await queryRunner.query(`CREATE INDEX "IDX_ac0f09364e3701d9ed35435288" ON "invoices" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_73ead96fa15571993d193bdfb0" ON "invoices" ("fechaEmision") `);
        await queryRunner.query(`CREATE INDEX "IDX_d71c67ec85d779559fee77b892" ON "invoices" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_05715a7ea47e49653f164c0dd8" ON "inventory_movements" ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8dc70213a51af3ec36b6690dba" ON "inventory_movements" ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_3725f350c287cd1b92d6f14a44" ON "inventory_movements" ("createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_3725f350c287cd1b92d6f14a44"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8dc70213a51af3ec36b6690dba"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_05715a7ea47e49653f164c0dd8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d71c67ec85d779559fee77b892"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_73ead96fa15571993d193bdfb0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ac0f09364e3701d9ed35435288"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5c4d8ad8a8acf0b5ae849ae168"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff39b9ac40872b2de41751eedc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c9fb58de893725258746385e1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_873f570c6b40132f2b037d6c70"`);
    }

}
