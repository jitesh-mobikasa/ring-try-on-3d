import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BlockStack, Button, Card, Layout, List, Page, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    // Opens the theme editor on a product page with our block ready to add
    addBlockUrl: `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${process.env.SHOPIFY_API_KEY}/tryon-button&target=mainSection`,
  };
};

export default function Setup() {
  const { addBlockUrl } = useLoaderData<typeof loader>();
  return (
    <Page title="Theme setup" backAction={{ content: "Products", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Add the “Try it on” button (once)</Text>
              <List type="number">
                <List.Item>Click the button below. The theme editor opens on a product page with the block added.</List.Item>
                <List.Item>Drag “Ring try-on” under Add to cart. Optionally pick a collection of rings shoppers can switch between.</List.Item>
                <List.Item>Save. The button appears on every product that has a ready try-on image.</List.Item>
              </List>
              <div><Button variant="primary" url={addBlockUrl} target="_blank">Add block in theme editor</Button></div>
              <Text as="p" tone="subdued">Works with any Online Store 2.0 theme. No code or URLs to configure.</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
