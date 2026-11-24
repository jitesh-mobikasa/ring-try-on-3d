import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Banner, BlockStack, Button, Card, InlineStack, Layout, List, Page, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

/* Theme setup: the try-on button, and the two product templates of the spec
   (customisable with the ring configurator, standard without), plus the story sections. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const editor = (template: string, block?: string, target = "mainSection") =>
    `https://${session.shop}/admin/themes/current/editor?template=${template}` +
    (block ? `&addAppBlockId=${process.env.SHOPIFY_API_KEY}/${block}&target=${target}` : "");
  return {
    tryon: editor("product", "tryon-button"),
    customisable: editor("product.customisable"),
    configurator: editor("product.customisable", "ring-configurator"),
    tryonCustom: editor("product.customisable", "tryon-button"),
    craftsmanship: editor("product.customisable", "craftsmanship", "newAppsSection"),
    materials: editor("product.customisable", "materials", "newAppsSection"),
    brandStory: editor("product.customisable", "brand-story", "newAppsSection"),
    products: `https://${session.shop}/admin/products`,
  };
};

export default function Setup() {
  const u = useLoaderData<typeof loader>();
  return (
    <Page title="Theme setup" backAction={{ content: "Products", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">1. Add the “Try it on” button (standard product page)</Text>
                <List type="number">
                  <List.Item>Click the button below. The theme editor opens on a product page with the block added.</List.Item>
                  <List.Item>Drag “Ring try-on” under Add to cart. Optionally pick a collection of rings shoppers can switch between.</List.Item>
                  <List.Item>Save. The button appears on every product that has a ready try-on image.</List.Item>
                </List>
                <div><Button variant="primary" url={u.tryon} target="_blank">Add try-on to the standard template</Button></div>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">2. Create the “Customisable” product template (once)</Text>
                <Text as="p">Rings shoppers configure (metal, stone, shape, carat, size, engraving) use this template. Ready-made rings keep the standard one.</Text>
                <List type="number">
                  <List.Item>In the theme editor, open the template menu at the top → Products → <b>Create template</b>.</List.Item>
                  <List.Item>Name it <b>customisable</b>, based on <b>Default product</b>, and create it.</List.Item>
                  <List.Item>On the new template, hide the theme's own <b>Variant picker</b> and <b>Buy buttons</b> (the configurator replaces them).</List.Item>
                  <List.Item>Use the buttons below to add the configurator, the try-on button and the story sections, then Save.</List.Item>
                  <List.Item>In each customisable product, set <b>Theme template</b> to <b>customisable</b>.</List.Item>
                </List>
                <InlineStack gap="200" wrap>
                  <Button url={u.customisable} target="_blank">Open the customisable template</Button>
                  <Button variant="primary" url={u.configurator} target="_blank">Add ring configurator</Button>
                  <Button url={u.tryonCustom} target="_blank">Add try-on button</Button>
                </InlineStack>
                <Text as="h3" variant="headingSm">Story sections (craftsmanship, materials, brand story)</Text>
                <Text as="p" tone="subdued">Each opens as its own section that you can move, edit and reuse on any product template.</Text>
                <InlineStack gap="200" wrap>
                  <Button url={u.craftsmanship} target="_blank">Add Craftsmanship</Button>
                  <Button url={u.materials} target="_blank">Add Materials</Button>
                  <Button url={u.brandStory} target="_blank">Add Brand story</Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">3. Set up the options on your products</Text>
                <Text as="p">The configurator uses your products' own options, so price and stock always come from Shopify.</Text>
                <List>
                  <List.Item>Add options named <b>Metal</b>, <b>Stone</b>, <b>Shape</b>, <b>Carat</b> and <b>Size</b> (or change the names in the block settings). Use only the ones a ring needs.</List.Item>
                  <List.Item>Give each variant its own price, e.g. Platinum · 2 ct costs more than Yellow gold · 1 ct. The page shows the difference next to each choice.</List.Item>
                  <List.Item>Engraving is a free-text field on the order line. To charge for it, create a product called “Engraving” priced at the fee and pick it in the block settings.</List.Item>
                </List>
                <Banner tone="info">A product can have up to 2,048 variants, enough for metal × stone × shape × carat × size on most rings.</Banner>
                <div><Button url={u.products} target="_blank">Open products</Button></div>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
