/*
  Warnings:

  - You are about to drop the column `available` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `Product` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[handle]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `handle` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Product_externalId_key";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "available",
DROP COLUMN "externalId",
DROP COLUMN "price",
DROP COLUMN "sku",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "handle" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "price" DOUBLE PRECISION,
    "compareAtPrice" DOUBLE PRECISION,
    "inventoryQty" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Variant_productId_idx" ON "Variant"("productId");

-- CreateIndex
CREATE INDEX "Variant_sku_idx" ON "Variant"("sku");

-- CreateIndex
CREATE INDEX "Variant_price_idx" ON "Variant"("price");

-- CreateIndex
CREATE UNIQUE INDEX "Product_handle_key" ON "Product"("handle");

-- CreateIndex
CREATE INDEX "Product_vendor_idx" ON "Product"("vendor");

-- CreateIndex
CREATE INDEX "Product_productType_idx" ON "Product"("productType");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
