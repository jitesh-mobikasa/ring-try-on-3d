/* Store a PNG in the merchant's Shopify Files (Content → Files) and get its CDN URL.
   Flow: stagedUploadsCreate → upload to the signed URL → fileCreate → wait until READY. */
import { gql, throwUserErrors, type Admin, type UserError } from "./graphql.server";

export interface UploadedFile { id: string; url: string; width: number; height: number }

interface StagedTarget { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }
type FileStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";

export async function uploadPng(admin: Admin, buffer: Buffer, { filename, alt }: { filename: string; alt: string }): Promise<UploadedFile> {
  // 1. Ask Shopify where to upload
  const staged = await gql<{ stagedUploadsCreate: { stagedTargets: StagedTarget[]; userErrors: UserError[] } }>(admin, `#graphql
    mutation Stage($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`, { input: [{ filename, mimeType: "image/png", httpMethod: "POST", resource: "IMAGE", fileSize: String(buffer.length) }] });
  throwUserErrors("Upload", staged.stagedUploadsCreate.userErrors);
  const target = staged.stagedUploadsCreate.stagedTargets[0];

  // 2. Upload the bytes
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "image/png" }), filename);
  const up = await fetch(target.url, { method: "POST", body: form });
  if (!up.ok) throw new Error(`Upload failed (${up.status})`);

  // 3. Register it as a file
  const created = await gql<{ fileCreate: { files: { id: string }[]; userErrors: UserError[] } }>(admin, `#graphql
    mutation Create($files: [FileCreateInput!]!) {
      fileCreate(files: $files) { files { id fileStatus } userErrors { message } }
    }`, { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", alt }] });
  throwUserErrors("File", created.fileCreate.userErrors);
  const id = created.fileCreate.files[0].id;

  // 4. Shopify processes images asynchronously; wait for the CDN URL
  for (let i = 0; i < 30; i++) {
    const r = await gql<{ node: { fileStatus?: FileStatus; image?: { url: string; width: number; height: number } | null } | null }>(admin, `#graphql
      query F($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url width height } } } }`, { id });
    const n = r.node;
    if (n?.fileStatus === "READY" && n.image?.url) return { id, ...n.image };
    if (n?.fileStatus === "FAILED") throw new Error("Shopify could not process the image");
    await sleep(1500);
  }
  throw new Error("Timed out waiting for Shopify Files");
}

export async function deleteFile(admin: Admin, fileId: string | null | undefined): Promise<void> {
  if (!fileId) return;
  try {
    await gql(admin, `#graphql
      mutation D($ids: [ID!]!) { fileDelete(fileIds: $ids) { userErrors { message } } }`, { ids: [fileId] });
  } catch (e) {
    console.warn("[files] delete failed", e instanceof Error ? e.message : e);
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
