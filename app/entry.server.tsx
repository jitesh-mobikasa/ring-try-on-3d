import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { createReadableStreamFromReadable, type EntryContext } from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import { startWorker } from "./lib/jobs.server";

// Background generator: picks up queued products (also ones left over from a restart)
startWorker();

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const callbackName = isbot(request.headers.get("user-agent") ?? "") ? "onAllReady" : "onShellReady";

  return new Promise<Response>((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(<RemixServer context={remixContext} url={request.url} />, {
      [callbackName]: () => {
        const body = new PassThrough();
        responseHeaders.set("Content-Type", "text/html");
        resolve(new Response(createReadableStreamFromReadable(body), { headers: responseHeaders, status: responseStatusCode }));
        pipe(body);
      },
      onShellError: reject,
      onError(error: unknown) {
        responseStatusCode = 500;
        console.error(error);
      },
    });
    setTimeout(abort, streamTimeout + 1000);
  });
}
