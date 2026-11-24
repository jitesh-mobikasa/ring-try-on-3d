/* The storefront reads one JSON metafield per product: tryon.asset (see TryOnMetafield).
   The theme block passes it to the viewer, so no API call is needed while shopping. */
import type { TryOnAsset } from "@prisma/client";
import { gql, throwUserErrors, type Admin, type UserError } from "./graphql.server";
import { METAFIELD, type TryOnMetafield } from "./shared";

/** Create the metafield definition (once per store) so the storefront is allowed to read it. */
export async function ensureDefinition(admin: Admin): Promise<UserError[]> {
  const data = await gql<{ metafieldDefinitionCreate: { userErrors: UserError[] } }>(admin, `#graphql
    mutation Def($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { code message } }
    }`, {
    definition: {
      name: "Ring try-on",
      namespace: METAFIELD.namespace,
      key: METAFIELD.key,
      type: "json",
      ownerType: "PRODUCT",
      description: "Managed by the Ring Try-On app. Do not edit by hand.",
      access: { storefront: "PUBLIC_READ" },
    },
  });
  // TAKEN = the definition already exists, which is fine
  return data.metafieldDefinitionCreate.userErrors.filter((e) => e.code !== "TAKEN");
}

export function assetValue(asset: TryOnAsset): TryOnMetafield {
  return {
    enabled: asset.enabled,
    view: asset.view,
    image: asset.resultUrl,
    scale: asset.scale,
    offsetY: asset.offsetY,
    source: asset.sourceMediaId,
  };
}

export async function writeAssetMetafield(admin: Admin, asset: TryOnAsset): Promise<void> {
  const data = await gql<{ metafieldsSet: { userErrors: UserError[] } }>(admin, `#graphql
    mutation Save($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`, {
    metafields: [{
      ownerId: asset.productId, namespace: METAFIELD.namespace, key: METAFIELD.key,
      type: "json", value: JSON.stringify(assetValue(asset)),
    }],
  });
  throwUserErrors("Metafield", data.metafieldsSet.userErrors);
}

export async function deleteAssetMetafield(admin: Admin, productId: string): Promise<void> {
  await gql(admin, `#graphql
    mutation Del($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) { userErrors { message } }
    }`, { metafields: [{ ownerId: productId, namespace: METAFIELD.namespace, key: METAFIELD.key }] });
}
