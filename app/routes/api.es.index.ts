// app/routes/api.es.index.ts
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Client } from "@elastic/elasticsearch";
import prisma from "../db.server";

const ES_URL = process.env.ELASTICSEARCH_URL ?? "http://localhost:9200";
const PRODUCTS_INDEX = "products";
const esClient = new Client({
  node: ES_URL,
  headers: {
    accept: "application/vnd.elasticsearch+json; compatible-with=8",
    "content-type": "application/vnd.elasticsearch+json; compatible-with=8",
  },
});

async function ensureProductsIndex() {
  const exists = await esClient.indices.exists({ index: PRODUCTS_INDEX });
  if (exists) return { created: false };

  await esClient.indices.create({
    index: PRODUCTS_INDEX,
    mappings: {
      properties: {
        id: { type: "keyword" },
        handle: { type: "keyword" },
        title: { type: "text", fields: { keyword: { type: "keyword" } } },
        description: { type: "text" },
        vendor: { type: "keyword" },
        productType: { type: "keyword" },
        category: { type: "keyword" },
        tags: { type: "keyword" },
        status: { type: "keyword" },
        imageUrl: { type: "keyword", index: false },
        createdAt: { type: "date" },
        updatedAt: { type: "date" },
        variants: {
          type: "nested",
          properties: {
            id: { type: "keyword" },
            sku: { type: "keyword" },
            barcode: { type: "keyword" },
            price: { type: "float" },
            compareAtPrice: { type: "float" },
            inventoryQty: { type: "integer" },
            color: { type: "keyword" },
            available: { type: "boolean" },
          },
        },
      },
    },
  });

  return { created: true };
}

// GET → health check
export async function loader(_: LoaderFunctionArgs) {
  return Response.json({ ok: true, message: "POST to /api/es/index to bulk-index products into Elasticsearch" });
}

// POST → index all products
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const start = Date.now();

  // 1. Ensure index exists with correct mapping
  const { created } = await ensureProductsIndex();

  // 2. Fetch all products with variants from Postgres
  const products = await prisma.product.findMany({
    include: { variants: true },
  });

  if (products.length === 0) {
    return Response.json({ ok: true, message: "No products found in DB. Run /api/import first.", indexed: 0 });
  }

  // 3. Build bulk operations array
  const operations = products.flatMap((p) => [
    { index: { _index: PRODUCTS_INDEX, _id: p.id } },
    {
      id:          p.id,
      handle:      p.handle,
      title:       p.title,
      description: p.description,
      vendor:      p.vendor,
      productType: p.productType,
      category:    p.category,
      tags:        p.tags,
      status:      p.status,
      imageUrl:    p.imageUrl,
      createdAt:   p.createdAt,
      updatedAt:   p.updatedAt,
      variants:    p.variants.map((v) => ({
        id:             v.id,
        sku:            v.sku,
        barcode:        v.barcode,
        price:          v.price,
        compareAtPrice: v.compareAtPrice,
        inventoryQty:   v.inventoryQty,
        color:          v.color,
        available:      v.available,
      })),
    },
  ]);

  // 4. Bulk index
  const bulkResponse = await esClient.bulk({ operations, refresh: true });

  const errors = bulkResponse.items
    .filter((item) => item.index?.error)
    .map((item) => item.index?.error);

  return Response.json({
    ok: errors.length === 0,
    indexCreated: created,
    indexed: products.length,
    errors: errors.length > 0 ? errors : undefined,
    durationMs: Date.now() - start,
  });
}