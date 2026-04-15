import fs from "fs";
import path from "path";
import prisma from "../db.server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CsvRow {
  Handle: string;
  Title: string;
  "Body (HTML)": string;
  Vendor: string;
  "Product Category": string;
  Type: string;
  Tags: string;
  Status: string;
  "Image Src": string;
  "Variant SKU": string;
  "Variant Barcode": string;
  "Variant Price": string;
  "Variant Compare At Price": string;
  "Variant Inventory Qty": string;
  "Color (product.metafields.shopify.color-pattern)": string;
  [key: string]: string;
}

interface ImportResult {
  success: boolean;
  productsCreated: number;
  variantsCreated: number;
  skipped: number;
  errors: string[];
  durationMs: number;
}

type CsvParseFn = (
  input: string,
  options: {
    columns: boolean;
    skip_empty_lines: boolean;
    trim: boolean;
    bom: boolean;
  }
) => CsvRow[];

async function getCsvParse(): Promise<CsvParseFn> {
  try {
    const mod = await import("csv-parse/sync");
    return mod.parse as CsvParseFn;
  } catch {
    // Fallback for environments where subpath export resolution is strict.
    const mod = await import("csv-parse/browser/esm/sync");
    return mod.parse as CsvParseFn;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePrice(val: string): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseFloat(val.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

function parseQty(val: string): number {
  if (!val || val.trim() === "") return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

function parseTags(val: string): string[] {
  if (!val || val.trim() === "") return [];
  return val
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// ─── Core import logic ────────────────────────────────────────────────────────

export async function importProductsFromCsv(
  csvPath: string
): Promise<ImportResult> {
  const start = Date.now();
  const errors: string[] = [];
  let productsCreated = 0;
  let variantsCreated = 0;
  let skipped = 0;
  const parse = await getCsvParse();

  // Read & parse CSV
  const content = fs.readFileSync(csvPath, "utf-8");
  const rows: CsvRow[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true, // handle Shopify BOM exports
  });

  // Group rows by handle — each unique handle = one Product
  const grouped = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const handle = row.Handle?.trim();
    if (!handle) {
      skipped++;
      continue;
    }
    if (!grouped.has(handle)) grouped.set(handle, []);
    grouped.get(handle)!.push(row);
  }

  // Upsert in batches of 100 products
  const handles = Array.from(grouped.keys());
  const BATCH_SIZE = 100;

  for (let i = 0; i < handles.length; i += BATCH_SIZE) {
    const batch = handles.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (handle) => {
        const productRows = grouped.get(handle)!;
        // First row carries the product-level fields
        const first = productRows[0];

        try {
          // Upsert the product
          const product = await prisma.product.upsert({
            where: { handle },
            update: {
              title: first.Title || handle,
              description: first["Body (HTML)"] || null,
              vendor: first.Vendor || null,
              productType: first.Type || null,
              category: first["Product Category"] || null,
              tags: parseTags(first.Tags),
              status: (first.Status || "active").toLowerCase(),
              imageUrl: first["Image Src"] || null,
            },
            create: {
              handle,
              title: first.Title || handle,
              description: first["Body (HTML)"] || null,
              vendor: first.Vendor || null,
              productType: first.Type || null,
              category: first["Product Category"] || null,
              tags: parseTags(first.Tags),
              status: (first.Status || "active").toLowerCase(),
              imageUrl: first["Image Src"] || null,
            },
          });

          productsCreated++;

          // Delete existing variants so we get a clean re-import
          await prisma.variant.deleteMany({
            where: { productId: product.id },
          });

          // Create all variants for this product
          const variantData = productRows
            .filter((r) => r["Variant SKU"] || r["Variant Price"])
            .map((r) => ({
              productId: product.id,
              sku: r["Variant SKU"] || null,
              barcode: r["Variant Barcode"] || null,
              price: parsePrice(r["Variant Price"]),
              compareAtPrice: parsePrice(r["Variant Compare At Price"]),
              inventoryQty: parseQty(r["Variant Inventory Qty"]),
              color:
                r["Color (product.metafields.shopify.color-pattern)"] || null,
              available: parseQty(r["Variant Inventory Qty"]) > 0,
            }));

          if (variantData.length > 0) {
            await prisma.variant.createMany({ data: variantData });
            variantsCreated += variantData.length;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`[${handle}] ${msg}`);
        }
      })
    );
  }

  return {
    success: errors.length === 0,
    productsCreated,
    variantsCreated,
    skipped,
    errors: errors.slice(0, 20), // cap error list
    durationMs: Date.now() - start,
  };
}