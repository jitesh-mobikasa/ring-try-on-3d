/* Plan & usage. Paid plans go through Shopify Billing (charged on the merchant's Shopify invoice). */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Layout, List, Page, ProgressBar, Text } from "@shopify/polaris";
import type { Plan } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getShop } from "../lib/jobs.server";
import { BILLING_PLAN, isPaidPlan, PLANS } from "../lib/shared";

const isTest = process.env.BILLING_TEST !== "false";
type Billing = Awaited<ReturnType<typeof authenticate.admin>>["billing"];

/** Keep the DB plan in sync with the merchant's real Shopify subscription. */
async function syncPlan(billing: Billing, shop: string): Promise<{ plan: Plan; subscriptionId?: string }> {
  const { appSubscriptions } = await billing.check({ plans: Object.values(BILLING_PLAN), isTest });
  const active = appSubscriptions.find((s) => s.status === "ACTIVE");
  const plan = (Object.entries(BILLING_PLAN).find(([, name]) => name === active?.name)?.[0] ?? "free") as Plan;
  await db.shop.update({ where: { shop }, data: { plan } });
  return { plan, subscriptionId: active?.id };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  await getShop(session.shop);
  const { plan } = await syncPlan(billing, session.shop);
  const shop = await getShop(session.shop);
  return { plan, used: shop.usedThisPeriod, plans: Object.values(PLANS) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const target = String((await request.formData()).get("plan"));

  if (target === "free") {
    const { subscriptionId } = await syncPlan(billing, session.shop);
    if (subscriptionId) await billing.cancel({ subscriptionId, isTest, prorate: true });
    await db.shop.update({ where: { shop: session.shop }, data: { plan: "free" } });
    return null;
  }
  if (!isPaidPlan(target)) return null;

  // Sends the merchant to Shopify's approve-charge page, then back here
  const storeHandle = session.shop.replace(".myshopify.com", "");
  await billing.request({
    plan: BILLING_PLAN[target],
    isTest,
    returnUrl: `https://admin.shopify.com/store/${storeHandle}/apps/${process.env.SHOPIFY_API_KEY}/app/plans`,
  });
  return null;
};

export default function Plans() {
  const { plan, used, plans } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const current = PLANS[plan];

  return (
    <Page title="Plan & usage" backAction={{ content: "Products", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">This month</Text>
              <Text as="p">{used} of {current.generations} AI try-on images generated</Text>
              <ProgressBar progress={Math.min(100, (used / current.generations) * 100)} />
              <Text as="p" tone="subdued">Shopper try-ons and free cut-outs are unlimited on every plan. Only AI images count.</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid columns={3} gap="400">
            {plans.map((p) => (
              <Card key={p.key}>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    {p.name} {p.key === plan && <Badge tone="success">Current</Badge>}
                  </Text>
                  <Text as="p" variant="headingXl">
                    {p.price ? `$${p.price}` : "Free"}
                    <Text as="span" tone="subdued">{p.price ? " / 30 days" : ""}</Text>
                  </Text>
                  <List>{p.features.map((f) => <List.Item key={f}>{f}</List.Item>)}</List>
                  <Form method="post">
                    <input type="hidden" name="plan" value={p.key} />
                    <Button submit disabled={p.key === plan} loading={nav.formData?.get("plan") === p.key} variant={p.key === plan ? "secondary" : "primary"}>
                      {p.key === plan ? "Current plan" : p.price ? `Choose ${p.name}` : "Downgrade"}
                    </Button>
                  </Form>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
