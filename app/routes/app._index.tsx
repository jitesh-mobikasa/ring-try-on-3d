/* Dashboard: every product with its try-on status, Generate / Regenerate (manual, one product at a time).
   "Generate all missing" (bulk) is switched off for now — see the commented-out code below. */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useRevalidator, useSearchParams } from "@remix-run/react";
import { Badge, Banner, BlockStack, Box, Button, Card, IndexTable, InlineStack, Layout, Page, SkeletonBodyText, Text, TextField } from "@shopify/polaris";
import type { AssetStatus, AssetView } from "@prisma/client";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { enqueue, fetchProduct } from "../lib/jobs.server";
import { canGenerate } from "../lib/generator.server";
import { listProducts } from "../lib/products.server";
// import { allProducts } from "../lib/products.server"; // bulk generate (disabled)
import { isBusy, numericId, STATUS } from "../lib/shared";
import { ClickableThumb, CompareModal } from "../components/CompareModal";
import { ClientOnly } from "../components/ClientOnly";

// const IN_PROGRESS_OR_DONE: AssetStatus[] = ["ready", "manual", "queued", "processing"]; // bulk generate (disabled)

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const { products, pageInfo } = await listProducts(admin, {
    query: q,
    after: url.searchParams.get("after"),
    before: url.searchParams.get("before"),
  });

  const [assets, counts] = await Promise.all([
    db.tryOnAsset.findMany({ where: { shop: session.shop, productId: { in: products.map((p) => p.id) } } }),
    db.tryOnAsset.groupBy({ by: ["status"], where: { shop: session.shop }, _count: true }),
  ]);
  const byId = new Map(assets.map((a) => [a.productId, a]));

  return {
    q,
    pageInfo,
    canGenerate: canGenerate(),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<AssetStatus, number>>,
    products: products.map((p) => {
      const a = byId.get(p.id);
      return {
        ...p,
        tryon: {
          status: (a?.status ?? "none") as AssetStatus,
          image: a?.resultUrl ?? null,
          view: (a?.view ?? "photo") as AssetView,
          error: a?.error ?? null,
          // the main photo is newer than the one the try-on image was made from
          stale: !!a && a.status === "ready" && !!p.mediaId && !!a.sourceMediaId && a.sourceMediaId !== p.mediaId,
        },
      };
    }),
  };
};

type ActionData = { ok: boolean; queued?: number; limited?: boolean; error?: string };

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionData> => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "generate") {
    // Only the id comes from the browser; the photo is looked up from Shopify
    const product = await fetchProduct(admin, String(form.get("productId")));
    if (!product) return { ok: false, error: "Product not found" };
    const row = await enqueue(session.shop, product, { force: true });
    return { ok: row.status === "queued", error: row.status === "failed" ? row.error ?? undefined : undefined };
  }

  /* Bulk generate — disabled for now (manual Generate only).
  if (intent === "all") {
    // Queue every product that has a photo and no try-on image yet (stops at the monthly limit)
    let queued = 0;
    for await (const page of allProducts(admin)) {
      const have = new Set((await db.tryOnAsset.findMany({
        where: { shop: session.shop, productId: { in: page.map((p) => p.id) }, status: { in: IN_PROGRESS_OR_DONE } },
        select: { productId: true },
      })).map((a) => a.productId));
      for (const p of page) {
        if (have.has(p.id) || !p.mediaUrl) continue;
        const row = await enqueue(session.shop, p);
        if (row.status === "queued") queued++;
        else if (/limit/i.test(row.error ?? "")) return { ok: true, queued, limited: true };
      }
    }
    return { ok: true, queued };
  }
  */
  return { ok: false, error: "Unknown action" };
};

type ProductItem = ReturnType<typeof useLoaderData<typeof loader>>["products"][number];

export default function Dashboard() {
  const { products, pageInfo, q, counts, canGenerate } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(q);
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const [compare, setCompare] = useState<ProductItem | null>(null);

  // While anything is generating, refresh the list every 4 seconds
  const busy = products.some((p) => isBusy(p.tryon.status)) || (counts.queued ?? 0) + (counts.processing ?? 0) > 0;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => revalidator.state === "idle" && revalidator.revalidate(), 4000);
    return () => clearInterval(t);
  }, [busy, revalidator]);

  const post = (data: Record<string, string>) => fetcher.submit(data, { method: "post" });
  const pendingIntent = fetcher.state !== "idle" ? fetcher.formData?.get("intent") : null;
  const ready = (counts.ready ?? 0) + (counts.manual ?? 0);
  const result = fetcher.data;

  return (
    <Page
      title="Ring try-on"
      subtitle="Click Generate to make a product's try-on image (made once from its main photo)."
      // primaryAction={{ content: "Generate all missing", onAction: () => post({ intent: "all" }), loading: pendingIntent === "all", disabled: !canGenerate }}
    >
      <Layout>
        {!canGenerate && (
          <Layout.Section>
            <Banner tone="critical" title="OpenAI key missing">Set OPENAI_API_KEY on the server, or use TRYON_GENERATOR=local.</Banner>
          </Layout.Section>
        )}
        {result?.queued !== undefined && (
          <Layout.Section>
            <Banner tone={result.limited ? "warning" : "success"}>
              {result.queued} product(s) queued.{result.limited ? " Monthly AI image limit reached." : ""}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <div style={{ flex: 1 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Try-on ready</Text>
                  <Text as="p" variant="heading2xl">{ready}</Text>
                  <Text as="p" tone="subdued">{counts.queued ?? 0} queued · {counts.processing ?? 0} generating · {counts.failed ?? 0} failed</Text>
                </BlockStack>
              </Card>
            </div>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <div style={{ padding: 12 }}>
              <TextField
                label="Search" labelHidden placeholder="Search products" value={search} onChange={setSearch} autoComplete="off"
                clearButton onClearButtonClick={() => { setSearch(""); setParams({}); }}
                onBlur={() => setParams(search ? { q: search } : {})}
              />
            </div>
            <ClientOnly fallback={<Box padding="400"><SkeletonBodyText lines={6} /></Box>}>{() => (
            <IndexTable
              resourceName={{ singular: "product", plural: "products" }}
              itemCount={products.length}
              selectable={false}
              headings={[{ title: "Photo" }, { title: "Try-on image" }, { title: "Product" }, { title: "Status" }, { title: "" }]}
              pagination={{
                hasNext: pageInfo.hasNextPage,
                hasPrevious: pageInfo.hasPreviousPage,
                onNext: () => setParams({ ...Object.fromEntries(params), after: pageInfo.endCursor ?? "", before: "" }),
                onPrevious: () => setParams({ ...Object.fromEntries(params), before: pageInfo.startCursor ?? "", after: "" }),
              }}
            >
              {products.map((p, i) => {
                const st = STATUS[p.tryon.status];
                const pending = pendingIntent === "generate" && fetcher.formData?.get("productId") === p.id;
                return (
                  <IndexTable.Row id={p.id} key={p.id} position={i}>
                    <IndexTable.Cell><ClickableThumb src={p.thumb} alt={p.title} onClick={() => setCompare(p)} /></IndexTable.Cell>
                    <IndexTable.Cell><ClickableThumb src={p.tryon.image} alt="Try-on" onClick={() => setCompare(p)} /></IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button variant="plain" onClick={() => navigate(`/app/products/${numericId(p.id)}`)}>{p.title}</Button>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="100">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {p.tryon.stale && <Badge tone="warning">Photo changed</Badge>}
                      </InlineStack>
                      {p.tryon.status === "failed" && <Text as="p" tone="critical" variant="bodySm">{p.tryon.error}</Text>}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button size="slim" disabled={!p.mediaUrl || !canGenerate || isBusy(p.tryon.status)} loading={pending}
                        onClick={() => post({ intent: "generate", productId: p.id })}>
                        {p.tryon.status === "none" ? "Generate" : "Regenerate"}
                      </Button>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>
            )}</ClientOnly>
          </Card>
        </Layout.Section>
      </Layout>

      <CompareModal
        open={!!compare} onClose={() => setCompare(null)} title={compare?.title ?? ""}
        photo={compare?.mediaUrl ?? null} tryon={compare?.tryon.image ?? null} view={compare?.tryon.view ?? "photo"}
      />
    </Page>
  );
}
