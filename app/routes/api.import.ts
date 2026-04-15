import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import path from "path";

// ─── GET /api/import ──────────────────────────────────────────────────────────
// Returns status — use to check if an import is needed or verify last run.

export async function loader({ request }: LoaderFunctionArgs) {
  return Response.json({
    ok: true,
    message: "POST to /api/import with { csvPath } or place products.csv in /data/products.csv",
    usage: {
      method: "POST",
      body: { csvPath: "/absolute/path/to/products.csv" },
    },
  });
}

// ─── POST /api/import ─────────────────────────────────────────────────────────
// Body: { csvPath?: string }
// If csvPath is omitted, falls back to DATA_DIR env var or /data/products.csv

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let csvPath: string;

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    csvPath =
      (body.csvPath as string) ||
      process.env.CSV_PATH ||
      path.join(process.cwd(), "data", "products.csv");
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Basic path validation
  if (!csvPath.endsWith(".csv")) {
    return Response.json({ error: "csvPath must point to a .csv file" }, { status: 400 });
  }

  console.log(`[import] Starting CSV import from: ${csvPath}`);

  try {
    const { importProductsFromCsv } = await import("../services/import.server");
    const result = await importProductsFromCsv(csvPath);

    console.log(
      `[import] Done — ${result.productsCreated} products, ${result.variantsCreated} variants in ${result.durationMs}ms`
    );

    return Response.json(
      {
        ok: result.success,
        stats: {
          productsCreated: result.productsCreated,
          variantsCreated: result.variantsCreated,
          skipped: result.skipped,
          durationMs: result.durationMs,
          durationSec: (result.durationMs / 1000).toFixed(2),
        },
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      { status: result.success ? 200 : 207 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[import] Fatal error:", message);

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}