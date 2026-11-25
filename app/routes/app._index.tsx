/* Dashboard: every product with its try-on status, Generate / Regenerate (manual, one product at a time).
   Products are listed from our own copy (Product table, see app/lib/catalog.server.ts) — "Sync products"
   refreshes it from Shopify, and webhooks keep it current — so listing, search and filters never call Shopify.
   "Generate all" queues every ring / bracelet without a try-on image (after a confirmation) and returns at once;
   the background worker (app/lib/jobs.server.ts) generates them one by one. */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useRevalidator, useSearchParams } from "@remix-run/react";
import { useIndexResourceState, Badge, Banner, BlockStack, Box, Button, ButtonGroup, Card, IndexTable, InlineStack, Layout, Modal, Page, Select, SkeletonBodyText, Text, TextField } from "@shopify/polaris";
import type { AssetStatus, AssetView, JewelleryKind } from "@prisma/client";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { cancelQueued, effectiveKind, enqueue, fetchProduct, getShop, quotaLeft, setPaused } from "../lib/jobs.server";
import { canGenerate, usesAI } from "../lib/generator.server";
import { bulkCandidates, bulkCounts, catalogCounts, isSyncing, queueInBackground, selectedCandidates, stopBulk, type BulkKind, listFromDb, startSync, type TryOnFilter } from "../lib/catalog.server";
import type { Admin } from "../lib/graphql.server";
import { isBusy, KIND_LABEL, numericId, STATUS } from "../lib/shared";
import { ClickableThumb, CompareModal } from "../components/CompareModal";
import { ClientOnly } from "../components/ClientOnly";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const kindFilter = (url.searchParams.get("kind") || "all") as "all" | JewelleryKind;
  const tryonFilter = (url.searchParams.get("tryon") || "all") as TryOnFilter;
  const statusFilter = (url.searchParams.get("status") || "all") as "all" | "ACTIVE" | "DRAFT" | "ARCHIVED";
  const page = Number(url.searchParams.get("page")) || 1;

  // Products come from our database. The first time (nothing synced yet), start a sync automatically.
  let shopRow = await getShop(shop);
  if (!shopRow.productsSyncedAt && !isSyncing(shopRow) && !shopRow.syncError) {
    await startSync(shop, admin as unknown as Admin);
    shopRow = await getShop(shop);
  }

  const [list, catalog, counts, bulk, quota] = await Promise.all([
    listFromDb(shop, { q, kind: kindFilter, tryon: tryonFilter, status: statusFilter, page }),
    catalogCounts(shop),
    db.tryOnAsset.groupBy({ by: ["status"], where: { shop }, _count: true }),
    bulkCounts(shop),
    usesAI() ? quotaLeft(shop) : Promise.resolve(Infinity),
  ]);
  const assets = await db.tryOnAsset.findMany({ where: { shop, productId: { in: list.rows.map((p) => p.productId) } } });
  const byId = new Map(assets.map((a) => [a.productId, a]));

  return {
    q, kindFilter, tryonFilter, statusFilter,
    page: list.page, pages: list.pages, total: list.total,
    catalog,
    bulk,
    quota: Number.isFinite(quota) ? quota : null,   // null = no AI_MONTHLY_LIMIT
    usesAI: usesAI(),
    paused: shopRow.queuePaused,
    sync: { running: isSyncing(shopRow), at: shopRow.productsSyncedAt?.toISOString() ?? null, error: shopRow.syncError },
    canGenerate: canGenerate(),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<AssetStatus, number>>,
    products: list.rows.map((r) => {
      const p = { id: r.productId, title: r.title, mediaId: r.mediaId, mediaUrl: r.mediaUrl, detectedKind: r.detectedKind };
      const a = byId.get(r.productId);
      return {
        ...p,
        thumb: r.thumbUrl,
        description: r.description,
        productType: r.productType,
        status: r.status,
        kind: effectiveKind(p, a),   // ring / bracelet / other (merchant's choice, else detected)
        kindManual: !!a?.kindManual,
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

type ActionData = { ok: boolean; queued?: number; limited?: boolean; skipped?: number; cancelled?: number; error?: string; sync?: "started" | "running" };

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionData> => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "sync") {
    const started = await startSync(session.shop, admin as unknown as Admin);
    return { ok: true, sync: started ? "started" : "running" };
  }

  if (intent === "generate") {
    // Only the id comes from the browser; the photo is looked up from Shopify
    const product = await fetchProduct(admin, String(form.get("productId")));
    if (!product) return { ok: false, error: "Product not found" };
    const row = await enqueue(session.shop, product, { force: true });
    return { ok: row.status === "queued", error: row.status === "failed" ? row.error ?? undefined : undefined };
  }

  if (intent === "bulk") {
    // Picks the products from our database (no Shopify calls), answers at once, and queues them in the
    // background. The worker then generates them one by one; the dashboard shows the progress.
    const kind = (["ring", "bracelet"].includes(String(form.get("kind"))) ? form.get("kind") : "all") as BulkKind;
    let list = await bulkCandidates(session.shop, kind);
    const left = usesAI() ? await quotaLeft(session.shop) : Infinity;
    const limited = list.length > left;
    if (limited) list = list.slice(0, left);
    await setPaused(session.shop, false);
    queueInBackground(session.shop, list, (shop, p) => enqueue(shop, p));
    return { ok: true, queued: list.length, limited };
  }

  if (intent === "selected") {
    // The ticked rows. Regenerates ready / failed ones too (the merchant chose them); skips queued, generating, uploaded.
    let ids: string[] = [];
    try { ids = JSON.parse(String(form.get("ids") || "[]")).filter((x: unknown) => typeof x === "string").slice(0, 250); } catch { /* bad input */ }
    let list = await selectedCandidates(session.shop, ids);
    const left = usesAI() ? await quotaLeft(session.shop) : Infinity;
    const limited = list.length > left;
    if (limited) list = list.slice(0, left);
    await setPaused(session.shop, false);
    queueInBackground(session.shop, list, (shop, p) => enqueue(shop, p, { force: true }));
    return { ok: true, queued: list.length, limited, skipped: ids.length - list.length };
  }

  if (intent === "pause" || intent === "resume") {
    await setPaused(session.shop, intent === "pause");
    return { ok: true };
  }
  if (intent === "cancel") {
    stopBulk(session.shop);
    const n = await cancelQueued(session.shop);
    await setPaused(session.shop, false);
    return { ok: true, cancelled: n };
  }
  return { ok: false, error: "Unknown action" };
};

type ProductItem = ReturnType<typeof useLoaderData<typeof loader>>["products"][number];

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString();
};
const PRODUCT_STATUS: Record<string, { label: string; tone?: "success" | "info" | "attention" }> = {
  ACTIVE: { label: "Active", tone: "success" }, DRAFT: { label: "Draft", tone: "info" }, ARCHIVED: { label: "Archived" },
};

export default function Dashboard() {
  const { products, page, pages, total, q, counts, canGenerate, kindFilter, tryonFilter, statusFilter, catalog, sync, bulk, quota, usesAI, paused } = useLoaderData<typeof loader>();
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } = useIndexResourceState(products);
  const selectedIds = allResourcesSelected ? products.map((p) => p.id) : selectedResources;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKind, setBulkKind] = useState<"all" | "ring" | "bracelet">("all");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(q);
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const [compare, setCompare] = useState<ProductItem | null>(null);

  // While a sync or a generation is running, refresh every 4 seconds
  const busy = sync.running || products.some((p) => isBusy(p.tryon.status)) || (counts.queued ?? 0) + (counts.processing ?? 0) > 0;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => revalidator.state === "idle" && revalidator.revalidate(), 4000);
    return () => clearInterval(t);
  }, [busy, revalidator]);

  const post = (data: Record<string, string>) => fetcher.submit(data, { method: "post" });
  const pendingIntent = fetcher.state !== "idle" ? fetcher.formData?.get("intent") : null;
  const ready = (counts.ready ?? 0) + (counts.manual ?? 0);
  const result = fetcher.data;
  // Change one filter, keep the others, go back to page 1
  const setFilter = (key: string, value: string) => {
    const next = Object.fromEntries(params);
    if (!value || value === "all") delete next[key]; else next[key] = value;
    delete next.page;
    setParams(next);
  };
  const syncing = sync.running || pendingIntent === "sync";

  return (
    <Page
      title="Try-on products"
      subtitle="Click Generate to make a product's try-on image (made once from its main photo)."
      primaryAction={{ content: "Generate all", onAction: () => setBulkOpen(true), disabled: !canGenerate || !bulk.all || syncing, loading: pendingIntent === "bulk" }}
      secondaryActions={[{ content: syncing ? "Syncing…" : "Sync products", onAction: () => post({ intent: "sync" }), loading: syncing, disabled: syncing }]}
    >
      <Layout>
        {!canGenerate && (
          <Layout.Section>
            <Banner tone="critical" title="OpenAI key missing">Set OPENAI_API_KEY on the server, or use TRYON_GENERATOR=local.</Banner>
          </Layout.Section>
        )}
        {sync.error && !sync.running && (
          <Layout.Section>
            <Banner tone="critical" title="Product sync failed" action={{ content: "Try again", onAction: () => post({ intent: "sync" }) }}>{sync.error}</Banner>
          </Layout.Section>
        )}
        {((counts.queued ?? 0) > 0 || paused) && (
          <Layout.Section>
            <Banner
              tone={paused ? "warning" : "info"}
              title={paused ? `Paused · ${counts.queued ?? 0} waiting` : `Generating · ${counts.queued ?? 0} waiting, ${counts.processing ?? 0} in progress`}
              action={paused
                ? { content: "Resume", onAction: () => post({ intent: "resume" }), loading: pendingIntent === "resume" }
                : { content: "Pause", onAction: () => post({ intent: "pause" }), loading: pendingIntent === "pause" }}
              secondaryAction={{ content: "Cancel all waiting", onAction: () => post({ intent: "cancel" }) }}
            >
              {paused
                ? "Nothing new is generated until you resume. Cancel takes the waiting products out of the queue (no cost)."
                : "Images are made one by one in the background. Pause stops new ones from starting (the one in progress finishes)."}
            </Banner>
          </Layout.Section>
        )}
        {result?.cancelled !== undefined && (
          <Layout.Section><Banner tone="success">{result.cancelled} waiting product(s) taken out of the queue.</Banner></Layout.Section>
        )}
        {result?.queued !== undefined && (
          <Layout.Section>
            <Banner tone={result.limited ? "warning" : "success"}>
              {result.queued} product(s) queued. They are generated one by one in the background; you can close this page.
              {result.limited ? " Stopped at the monthly AI image limit (AI_MONTHLY_LIMIT)." : ""}
              {result.skipped ? ` ${result.skipped} skipped (no photo, "Other" type, uploaded, or already generating).` : ""}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <div style={{ flex: 1 }}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Products</Text>
                  <Text as="p" variant="heading2xl">{catalog.products}</Text>
                  <Text as="p" tone="subdued">
                    {catalog.byKind.ring} rings · {catalog.byKind.bracelet} bracelets · {catalog.byKind.other} other
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {sync.running ? "Syncing with Shopify…" : `Last synced ${ago(sync.at)}`}
                  </Text>
                </BlockStack>
              </Card>
            </div>
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
            <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <ButtonGroup variant="segmented">
                {(["all", "ring", "bracelet", "other"] as const).map((k) => (
                  <Button key={k} pressed={kindFilter === k} onClick={() => setFilter("kind", k)}>
                    {k === "all" ? "All" : k === "ring" ? "Rings" : k === "bracelet" ? "Bracelets" : "Other"}
                  </Button>
                ))}
              </ButtonGroup>
              <div style={{ minWidth: 170 }}>
                <Select label="Try-on" labelInline value={tryonFilter} onChange={(v) => setFilter("tryon", v)} options={[
                  { label: "Any", value: "all" }, { label: "Not generated", value: "none" }, { label: "Ready", value: "ready" },
                  { label: "Generating", value: "busy" }, { label: "Failed", value: "failed" }, { label: "Photo changed", value: "stale" },
                ]} />
              </div>
              <div style={{ minWidth: 150 }}>
                <Select label="Status" labelInline value={statusFilter} onChange={(v) => setFilter("status", v)} options={[
                  { label: "Any", value: "all" }, { label: "Active", value: "ACTIVE" }, { label: "Draft", value: "DRAFT" }, { label: "Archived", value: "ARCHIVED" },
                ]} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <TextField
                  label="Search" labelHidden placeholder="Search title, type, tag" value={search} onChange={setSearch} autoComplete="off"
                  clearButton onClearButtonClick={() => { setSearch(""); setFilter("q", ""); }}
                  onBlur={() => search !== q && setFilter("q", search)}
                  connectedRight={<Button onClick={() => setFilter("q", search)}>Search</Button>}
                />
              </div>
            </div>
            {!products.length ? (
              <Box padding="600">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="p" variant="headingSm">
                    {sync.running ? "Loading your products from Shopify…" : catalog.products ? "No products match these filters" : "No products yet"}
                  </Text>
                  {!sync.running && !catalog.products && <Button onClick={() => post({ intent: "sync" })}>Sync products</Button>}
                </BlockStack>
              </Box>
            ) : (
            <ClientOnly fallback={<Box padding="400"><SkeletonBodyText lines={6} /></Box>}>{() => (
            <IndexTable
              resourceName={{ singular: "product", plural: "products" }}
              itemCount={products.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              promotedBulkActions={[{
                content: `Generate selected (${selectedIds.length})`,
                disabled: !canGenerate,
                onAction: () => { post({ intent: "selected", ids: JSON.stringify(selectedIds) }); clearSelection(); },
              }]}
              headings={[{ title: "Photo" }, { title: "Try-on image" }, { title: "Product" }, { title: "Type" }, { title: "Status" }, { title: "Try-on" }, { title: "" }]}
              pagination={{
                hasNext: page < pages,
                hasPrevious: page > 1,
                label: `Page ${page} of ${pages} · ${total} products`,
                onNext: () => setParams({ ...Object.fromEntries(params), page: String(page + 1) }),
                onPrevious: () => setParams({ ...Object.fromEntries(params), page: String(page - 1) }),
              }}
            >
              {products.map((p, i) => {
                const st = STATUS[p.tryon.status];
                const ps = PRODUCT_STATUS[p.status] ?? { label: p.status };
                const pending = pendingIntent === "generate" && fetcher.formData?.get("productId") === p.id;
                return (
                  <IndexTable.Row id={p.id} key={p.id} position={i} selected={selectedIds.includes(p.id)}>
                    <IndexTable.Cell><ClickableThumb src={p.thumb} alt={p.title} onClick={() => setCompare(p)} /></IndexTable.Cell>
                    <IndexTable.Cell><ClickableThumb src={p.tryon.image} alt="Try-on" onClick={() => setCompare(p)} /></IndexTable.Cell>
                    <IndexTable.Cell>
                      <div style={{ maxWidth: 320, whiteSpace: "normal" }}>
                        <Button variant="plain" onClick={() => navigate(`/app/products/${numericId(p.id)}`)}>{p.title}</Button>
                        {p.description && <Text as="p" tone="subdued" variant="bodySm" truncate>{p.description}</Text>}
                      </div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={p.kind === "bracelet" ? "info" : p.kind === "other" ? undefined : "success"}>
                        {`${KIND_LABEL[p.kind]}${p.kindManual ? "" : " (auto)"}`}
                      </Badge>
                      {p.productType && <Text as="p" tone="subdued" variant="bodySm">{p.productType}</Text>}
                    </IndexTable.Cell>
                    <IndexTable.Cell><Badge tone={ps.tone}>{ps.label}</Badge></IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="100">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {p.tryon.stale && <Badge tone="warning">Photo changed</Badge>}
                      </InlineStack>
                      {p.tryon.status === "failed" && <Text as="p" tone="critical" variant="bodySm">{p.tryon.error}</Text>}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button size="slim" disabled={!p.mediaUrl || !canGenerate || isBusy(p.tryon.status) || p.kind === "other"} loading={pending}
                        onClick={() => post({ intent: "generate", productId: p.id })}>
                        {p.tryon.status === "none" ? "Generate" : "Regenerate"}
                      </Button>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>
            )}</ClientOnly>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={bulkOpen} onClose={() => setBulkOpen(false)} title="Generate try-on images"
        primaryAction={{ content: `Generate ${bulk[bulkKind]} image${bulk[bulkKind] === 1 ? "" : "s"}`, disabled: !bulk[bulkKind],
          onAction: () => { post({ intent: "bulk", kind: bulkKind }); setBulkOpen(false); } }}
        secondaryActions={[{ content: "Cancel", onAction: () => setBulkOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">Makes a try-on image for every ring and bracelet that doesn't have one yet (active and draft products with a photo). Products that are ready, uploaded, generating or failed are skipped.</Text>
            <Select label="Which products" value={bulkKind} onChange={(v) => setBulkKind(v as typeof bulkKind)} options={[
              { label: `Rings and bracelets (${bulk.all})`, value: "all" },
              { label: `Only rings (${bulk.ring})`, value: "ring" },
              { label: `Only bracelets (${bulk.bracelet})`, value: "bracelet" },
            ]} />
            <Text as="p" tone="subdued">
              Takes about 30–60 seconds per image, one at a time ({Math.max(1, Math.round(bulk[bulkKind] * 45 / 60))} min for {bulk[bulkKind]}). It runs in the background, so you can close this page.
            </Text>
            {usesAI && <Banner tone="warning">Each image is a paid OpenAI request.{quota !== null ? ` Monthly limit left: ${quota}${quota < bulk[bulkKind] ? ` — only the first ${quota} will be queued.` : "."}` : " No monthly limit is set (AI_MONTHLY_LIMIT)."}</Banner>}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <CompareModal
        open={!!compare} onClose={() => setCompare(null)} title={compare?.title ?? ""}
        photo={compare?.mediaUrl ?? null} tryon={compare?.tryon.image ?? null} view={compare?.tryon.view ?? "photo"} kind={compare?.kind}
      />
    </Page>
  );
}
