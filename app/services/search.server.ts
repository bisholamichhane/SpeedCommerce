import { Client } from "@elastic/elasticsearch";

const ES_URL = process.env.ELASTICSEARCH_URL ?? "http://localhost:9200";
const PRODUCTS_INDEX = "products";
const esClient = new Client({
  node: ES_URL,
  headers: {
    accept: "application/vnd.elasticsearch+json; compatible-with=8",
    "content-type": "application/vnd.elasticsearch+json; compatible-with=8",
  },
});

export interface SearchParams {
  q?: string;           // full-text search on title/description
  vendor?: string;
  category?: string;
  productType?: string;
  tags?: string[];
  status?: string;
  color?: string;
  available?: boolean;
  minPrice?: number;
  maxPrice?: number;
  page?: number;        // 1-based
  size?: number;        // default 20
  sortBy?: "price_asc" | "price_desc" | "title" | "createdAt";
}

export async function searchProducts(params: SearchParams) {
  const {
    q,
    vendor,
    category,
    productType,
    tags,
    status,
    color,
    available,
    minPrice,
    maxPrice,
    page = 1,
    size = 20,
    sortBy,
  } = params;

  const must: object[] = [];
  const filter: object[] = [];

  // ── Full-text ────────────────────────────────────────────────────────────
  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ["title^3", "description", "vendor", "tags"],
        fuzziness: "AUTO",
      },
    });
  }

  // ── Keyword filters ──────────────────────────────────────────────────────
  if (vendor)      filter.push({ term: { vendor } });
  if (category)    filter.push({ term: { category } });
  if (productType) filter.push({ term: { productType } });
  if (status)      filter.push({ term: { status } });
  if (tags?.length) filter.push({ terms: { tags } });

  // ── Nested variant filters (color, available, price range) ───────────────
  const nestedFilter: object[] = [];

  if (color)              nestedFilter.push({ term: { "variants.color": color } });
  if (available !== undefined) nestedFilter.push({ term: { "variants.available": available } });
  if (minPrice !== undefined || maxPrice !== undefined) {
    nestedFilter.push({
      range: {
        "variants.price": {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
      },
    });
  }

  if (nestedFilter.length > 0) {
    filter.push({
      nested: {
        path: "variants",
        query: { bool: { filter: nestedFilter } },
      },
    });
  }

  // ── Sorting ──────────────────────────────────────────────────────────────
  const sort: object[] = [];
  if (sortBy === "price_asc") {
    sort.push({
      "variants.price": {
        order: "asc",
        nested: { path: "variants" },
        mode: "min",
      },
    });
  } else if (sortBy === "price_desc") {
    sort.push({
      "variants.price": {
        order: "desc",
        nested: { path: "variants" },
        mode: "max",
      },
    });
  } else if (sortBy === "title") {
    sort.push({ "title.keyword": { order: "asc" } });
  } else if (sortBy === "createdAt") {
    sort.push({ createdAt: { order: "desc" } });
  } else if (q) {
    sort.push({ _score: { order: "desc" } }); // relevance when searching
  } else {
    sort.push({ createdAt: { order: "desc" } }); // default: newest first
  }

  const from = (page - 1) * size;

  const response = await esClient.search({
    index: PRODUCTS_INDEX,
    from,
    size,
    sort: sort as any,
    query: {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
      },
    },
    aggs: {
      vendors:      { terms: { field: "vendor",      size: 50 } },
      categories:   { terms: { field: "category",    size: 50 } },
      productTypes: { terms: { field: "productType", size: 50 } },
      tags:         { terms: { field: "tags",        size: 100 } },
      colors: {
        nested: { path: "variants" },
        aggs: { values: { terms: { field: "variants.color", size: 50 } } },
      },
      priceRange: {
        nested: { path: "variants" },
        aggs: {
          min: { min: { field: "variants.price" } },
          max: { max: { field: "variants.price" } },
        },
      },
    },
  });

  const hits = response.hits.hits.map((h) => ({
    ...(h._source as object),
    _score: h._score,
  }));

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  return {
    total,
    page,
    size,
    totalPages: Math.ceil(total / size),
    results: hits,
    aggregations: {
      vendors:      (response.aggregations?.vendors as any)?.buckets ?? [],
      categories:   (response.aggregations?.categories as any)?.buckets ?? [],
      productTypes: (response.aggregations?.productTypes as any)?.buckets ?? [],
      tags:         (response.aggregations?.tags as any)?.buckets ?? [],
      colors:       (response.aggregations?.colors as any)?.values?.buckets ?? [],
      priceRange: {
        min: (response.aggregations?.priceRange as any)?.min?.value ?? null,
        max: (response.aggregations?.priceRange as any)?.max?.value ?? null,
      },
    },
  };
}