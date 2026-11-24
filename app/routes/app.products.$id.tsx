/* One product: source photo vs try-on image, live preview on the hand, fine-tuning, own upload, regenerate. */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { Badge, Banner, BlockStack, Box, Button, Card, Checkbox, DropZone, InlineGrid, InlineStack, Layout, Page, RangeSlider, Text } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { AssetStatus } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { enqueue, fetchProduct } from "../lib/jobs.server";
import { deleteFile, uploadPng } from "../lib/files.server";
import { canGenerate, normaliseUpload, usesAI } from "../lib/generator.server";
import { deleteAssetMetafield, writeAssetMetafield } from "../lib/metafields.server";
import { productStoreInfo } from "../lib/products.server";
import { errorMessage } from "../lib/errors";
import { encodeViewerConfig, isBusy, isReady, STATUS, withWidth } from "../lib/shared";
import { CompareModal } from "../components/CompareModal";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const gidFor = (id: string | undefined) => `gid://shopify/Product/${id}`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productId = gidFor(params.id);
  const product = await fetchProduct(admin, productId);
  if (!product) throw new Response("Product not found", { status: 404 });

  const [info, asset] = await Promise.all([
    productStoreInfo(admin, productId),
    db.tryOnAsset.findUnique({ where: { shop_productId: { shop: session.shop, productId } } }),
  ]);
  return {
    product: { ...product, ...info },
    asset: asset && {
      status: asset.status,
      image: asset.resultUrl,
      view: asset.view,
      error: asset.error,
      scale: asset.scale,
      offsetY: asset.offsetY,
      enabled: asset.enabled,
      stale: asset.status === "ready" && !!asset.sourceMediaId && !!product.mediaId && asset.sourceMediaId !== product.mediaId,
    },
    canGenerate: canGenerate(),
    aiMode: usesAI(),
  };
};

type ActionData = { ok: boolean; message?: string; error?: string };

export const action = async ({ request, params }: ActionFunctionArgs): Promise<ActionData> => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = gidFor(params.id);
  const where = { shop_productId: { shop, productId } };
  const form = await request.formData();

  switch (form.get("intent")) {
    case "generate": {
      const product = await fetchProduct(admin, productId);
      if (!product) return { ok: false, error: "Product not found" };
      const row = await enqueue(shop, product, { force: true });
      return row.status === "failed" ? { ok: false, error: row.error ?? "Could not queue" } : { ok: true };
    }

    case "upload": {
      const file = form.get("file");
      if (!(file instanceof File)) return { ok: false, error: "Choose a PNG file" };
      if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Max 8 MB" };
      try {
        const product = await fetchProduct(admin, productId);
        if (!product) return { ok: false, error: "Product not found" };
        const png = await normaliseUpload(Buffer.from(await file.arrayBuffer()));
        const up = await uploadPng(admin, png, { filename: `tryon-${params.id}-manual-${Date.now()}.png`, alt: `Try-on image: ${product.title}` });
        const old = await db.tryOnAsset.findUnique({ where });
        if (old?.resultFileId) await deleteFile(admin, old.resultFileId);
        const fields = {
          status: "manual" as const, view: "top" as const, error: null,
          resultFileId: up.id, resultUrl: up.url, sourceMediaId: product.mediaId, sourceUrl: product.mediaUrl,
        };
        const row = await db.tryOnAsset.upsert({
          where,
          create: { shop, productId, productTitle: product.title, ...fields },
          update: fields,
        });
        await writeAssetMetafield(admin, row);
        return { ok: true, message: "Image uploaded" };
      } catch (e) {
        return { ok: false, error: errorMessage(e) };
      }
    }

    case "save": {
      const row = await db.tryOnAsset.update({
        where,
        data: {
          scale: clamp(Number(form.get("scale")), 0.5, 2, 1),
          offsetY: clamp(Number(form.get("offsetY")), -0.5, 0.5, 0),
          enabled: form.get("enabled") === "true",
        },
      });
      if (row.resultUrl) await writeAssetMetafield(admin, row);
      return { ok: true, message: "Saved" };
    }

    case "remove": {
      const old = await db.tryOnAsset.findUnique({ where });
      if (old?.resultFileId) await deleteFile(admin, old.resultFileId);
      await db.tryOnAsset.deleteMany({ where: { shop, productId } });
      await deleteAssetMetafield(admin, productId);
      return { ok: true, message: "Try-on image removed" };
    }

    default:
      return { ok: false, error: "Unknown action" };
  }
};

const clamp = (n: number, min: number, max: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

const CHECKER = "repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0/16px 16px";

export default function ProductPage() {
  const { product, asset, canGenerate, aiMode } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const status: AssetStatus = asset?.status ?? "none";
  const st = STATUS[status];

  const [scale, setScale] = useState(asset?.scale ?? 1);
  const [offsetY, setOffsetY] = useState(asset?.offsetY ?? 0);
  const [enabled, setEnabled] = useState(asset?.enabled ?? true);
  const [compareOpen, setCompareOpen] = useState(false);
  useEffect(() => {
    setScale(asset?.scale ?? 1);
    setOffsetY(asset?.offsetY ?? 0);
    setEnabled(asset?.enabled ?? true);
  }, [asset?.scale, asset?.offsetY, asset?.enabled]);

  // Poll while the image is being generated
  useEffect(() => {
    if (!isBusy(status)) return;
    const t = setInterval(() => revalidator.state === "idle" && revalidator.revalidate(), 4000);
    return () => clearInterval(t);
  }, [status, revalidator]);

  useEffect(() => {
    if (fetcher.data?.message) shopify.toast.show(fetcher.data.message);
    if (fetcher.data?.error) shopify.toast.show(fetcher.data.error, { isError: true });
  }, [fetcher.data, shopify]);

  // Live preview: the same viewer shoppers see, fed with the unsaved slider values
  const previewSrc = useMemo(() => {
    if (!asset?.image) return null;
    return "/viewer/index.html#c=" + encodeViewerConfig({
      currency: "USD",
      origin: typeof window !== "undefined" ? window.location.origin : "",
      current: "p",
      preview: true,
      products: [{ key: "p", title: product.title, image: product.mediaUrl, price: product.price, tryon: { image: asset.image, scale, offsetY, view: asset.view } }],
    });
  }, [asset?.image, asset?.view, scale, offsetY, product.title, product.mediaUrl, product.price]);

  const busy = isBusy(status);
  const submitting = (intent: string) => fetcher.state !== "idle" && fetcher.formData?.get("intent") === intent;
  const submit = (data: Record<string, string>) => fetcher.submit(data, { method: "post" });
  const generateLabel = `${asset?.image ? "Regenerate" : "Generate"}${aiMode ? " with AI" : ""}`;

  return (
    <Page
      backAction={{ content: "Products", url: "/app" }}
      title={product.title}
      titleMetadata={<InlineStack gap="100"><Badge tone={st.tone}>{st.label}</Badge>{asset?.stale && <Badge tone="warning">Photo changed</Badge>}</InlineStack>}
      secondaryActions={product.url ? [{ content: "View in store", url: product.url, target: "_blank" }] : []}
    >
      <Layout>
        {status === "failed" && asset?.error && (
          <Layout.Section><Banner tone="critical" title="Generation failed">{asset.error}</Banner></Layout.Section>
        )}
        {asset?.stale && (
          <Layout.Section><Banner tone="warning">The main photo changed since this try-on image was made. Regenerate to update it.</Banner></Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineGrid columns={2} gap="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Product photo</Text>
                  <Box background="bg-surface-secondary" borderRadius="200" padding="200">
                    {product.mediaUrl
                      ? <img src={withWidth(product.mediaUrl, 500)} alt="" onClick={() => setCompareOpen(true)} title="Click to compare" style={{ width: "100%", display: "block", cursor: "zoom-in" }} />
                      : <Text as="p" tone="subdued">No photo</Text>}
                  </Box>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Try-on image</Text>
                  <Box background="bg-surface-secondary" borderRadius="200" padding="200" minHeight="200px">
                    {asset?.image
                      ? <img src={asset.image} alt="" onClick={() => setCompareOpen(true)} title="Click to compare" style={{ width: "100%", display: "block", cursor: "zoom-in", background: CHECKER }} />
                      : <Text as="p" tone="subdued">{busy ? "Generating… this can take up to a minute." : "Not generated yet."}</Text>}
                  </Box>
                </BlockStack>
              </InlineGrid>
              <InlineStack gap="200">
                <Button variant="primary" disabled={!canGenerate || !product.mediaUrl || busy} loading={busy || submitting("generate")}
                  onClick={() => submit({ intent: "generate" })}>
                  {generateLabel}
                </Button>
                <Button onClick={() => setCompareOpen(true)} disabled={!product.mediaUrl}>Compare side by side</Button>
                {asset && <Button tone="critical" variant="plain" onClick={() => submit({ intent: "remove" })}>Remove try-on</Button>}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {previewSrc && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Preview on the hand</Text>
                <iframe title="Try-on preview" src={previewSrc} style={{ width: "100%", height: 620, border: 0, borderRadius: 8 }} />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {isReady(status) && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Fit on the finger</Text>
                  <RangeSlider label="Size" min={0.5} max={2} step={0.05} value={scale} onChange={(v) => setScale(Number(v))} output />
                  <RangeSlider label="Move up / down" min={-0.5} max={0.5} step={0.01} value={offsetY} onChange={(v) => setOffsetY(Number(v))} output />
                  <Checkbox label="Show try-on for this product" checked={enabled} onChange={setEnabled} />
                  <Button variant="primary" loading={submitting("save")}
                    onClick={() => submit({ intent: "save", scale: String(scale), offsetY: String(offsetY), enabled: String(enabled) })}>
                    Save
                  </Button>
                </BlockStack>
              </Card>
            )}
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Use your own image</Text>
                <Text as="p" tone="subdued">PNG with a transparent background, ring seen from above with the band left-to-right.</Text>
                <DropZone accept="image/png" type="image" allowMultiple={false}
                  onDrop={(files: File[]) => {
                    const fd = new FormData();
                    fd.append("intent", "upload");
                    fd.append("file", files[0]);
                    fetcher.submit(fd, { method: "post", encType: "multipart/form-data" });
                  }}>
                  {submitting("upload") ? <Box padding="400"><Text as="p">Uploading…</Text></Box> : <DropZone.FileUpload actionHint="PNG, max 8 MB" />}
                </DropZone>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} title={product.title}
        photo={product.mediaUrl} tryon={asset?.image ?? null} view={asset?.view ?? "photo"} />
    </Page>
  );
}
