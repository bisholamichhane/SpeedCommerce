import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { searchProducts } from "../services/search.server";

// GET /api/es/search?q=shirt&vendor=Nike&minPrice=10&maxPrice=100&page=1&size=20
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const p = url.searchParams;

  const params = {
    q:           p.get("q")           ?? undefined,
    vendor:      p.get("vendor")      ?? undefined,
    category:    p.get("category")    ?? undefined,
    productType: p.get("productType") ?? undefined,
    tags:        p.getAll("tags"),
    status:      p.get("status")      ?? undefined,
    color:       p.get("color")       ?? undefined,
    available:   p.has("available")   ? p.get("available") === "true" : undefined,
    minPrice:    p.has("minPrice")    ? parseFloat(p.get("minPrice")!) : undefined,
    maxPrice:    p.has("maxPrice")    ? parseFloat(p.get("maxPrice")!) : undefined,
    page:        p.has("page")        ? parseInt(p.get("page")!, 10)   : 1,
    size:        p.has("size")        ? parseInt(p.get("size")!, 10)   : 20,
    sortBy:      (p.get("sortBy") as any) ?? undefined,
  };

  try {
    const result = await searchProducts(params);
    return Response.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/es/search with JSON body matching SearchParams
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const params = {
      q: typeof body.q === "string" ? body.q : undefined,
      vendor: typeof body.vendor === "string" ? body.vendor : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      productType:
        typeof body.productType === "string" ? body.productType : undefined,
      tags: Array.isArray(body.tags)
        ? body.tags.filter((t): t is string => typeof t === "string")
        : [],
      status: typeof body.status === "string" ? body.status : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      available:
        typeof body.available === "boolean" ? body.available : undefined,
      minPrice:
        typeof body.minPrice === "number" ? body.minPrice : undefined,
      maxPrice:
        typeof body.maxPrice === "number" ? body.maxPrice : undefined,
      page: typeof body.page === "number" ? body.page : 1,
      size: typeof body.size === "number" ? body.size : 20,
      sortBy:
        typeof body.sortBy === "string"
          ? (body.sortBy as "price_asc" | "price_desc" | "title" | "createdAt")
          : undefined,
    };

    const result = await searchProducts(params);
    return Response.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}