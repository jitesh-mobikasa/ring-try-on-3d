/* Only used when the app is opened outside Shopify admin (e.g. during development). */
import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { AppProvider as PolarisAppProvider, Button, Card, FormLayout, Page, Text, TextField } from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useState } from "react";
import { login } from "../shopify.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisStyles }];
type LoginResult = Awaited<ReturnType<typeof login>>;
const errorsFor = (r: LoginResult): { shop?: string } => ({ shop: r?.shop === "MISSING_SHOP" ? "Enter your shop domain" : r?.shop === "INVALID_SHOP" ? "Enter a valid shop domain" : undefined });
export const loader = async ({ request }: LoaderFunctionArgs) => ({ errors: errorsFor(await login(request)) });
export const action = async ({ request }: ActionFunctionArgs) => ({ errors: errorsFor(await login(request)) });

export default function Auth() {
  const actionData = useActionData<typeof action>();
  const loaderData = useLoaderData<typeof loader>();
  const { errors } = actionData || loaderData;
  const [shop, setShop] = useState("");
  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <Page narrowWidth>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">Log in</Text>
              <TextField type="text" name="shop" label="Shop domain" helpText="example.myshopify.com"
                value={shop} onChange={setShop} autoComplete="on" error={errors.shop} />
              <Button submit>Log in</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
