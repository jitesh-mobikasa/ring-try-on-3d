/** The Admin API client the app gets from `authenticate.admin()` / `unauthenticated.admin()` / webhooks.
    Typed structurally so every one of those contexts fits. */
export interface Admin {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[] | unknown;
}

/** Run an Admin GraphQL query and return `data`, typed. Throws on GraphQL errors. */
export async function gql<T>(admin: Admin, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors) throw new Error("Shopify API: " + JSON.stringify(body.errors));
  if (!body.data) throw new Error("Shopify API returned no data");
  return body.data;
}

/** Shopify mutations report problems in `userErrors` instead of failing. */
export interface UserError { field?: string[] | null; message: string; code?: string | null }

export function throwUserErrors(prefix: string, errors: UserError[] | undefined) {
  if (errors?.length) throw new Error(`${prefix}: ${errors.map((e) => e.message).join(", ")}`);
}
