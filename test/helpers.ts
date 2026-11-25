import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { ConfigProvider, Effect, Layer, Ref } from "effect";
import { HttpClient, HttpClientResponse, HttpEffect } from "effect/http";
import { Handler } from "../src/Handler.ts";
import { Upstream } from "../src/Upstream.ts";

export const TOKEN = "test-token";

export const env = (token: string) =>
  ConfigProvider.layer(
    ConfigProvider.fromUnknown({
      UPTIME_PROXY_TOKEN: token,
      CF_ACCESS_CLIENT_ID: "client-id.access",
      CF_ACCESS_CLIENT_SECRET: "client-secret",
    }),
  );

export const recordingClient = (status: number) =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<Request>>([]);

    const client = HttpClient.make((request, url) =>
      Ref.update(seen, (requests) => [...requests, new Request(url, { method: request.method, headers: request.headers })]).pipe(
        Effect.as(HttpClientResponse.fromWeb(request, new Response(null, { status }))),
      ),
    );

    return { seen, layer: Layer.succeed(HttpClient.HttpClient, client) };
  });

export const makeHandler = (clientLayer: Layer.Layer<HttpClient.HttpClient>, token = TOKEN) =>
  Handler.pipe(Effect.provide(Layer.provideMerge(Upstream.layer, Layer.merge(clientLayer, env(token)))));

export const serveApp = (clientLayer: Layer.Layer<HttpClient.HttpClient>) =>
  makeHandler(clientLayer).pipe(
    Effect.map((handler) => {
      const app = HttpEffect.toWebHandler(handler);

      return (path: string, init?: RequestInit): Effect.Effect<Response> =>
        Effect.promise(() => app(new Request(`https://uptime-proxy.example.workers.dev${path}`, init)));
    }),
  );

export const bearer = (token: string): RequestInit => ({ headers: { authorization: `Bearer ${token}` } });

export const RedirectingServer = Effect.acquireRelease(
  Effect.callback<{ readonly origin: string; readonly close: () => void }>((resume) => {
    const server = createServer((req, res) => {
      const authorized = req.headers["cf-access-client-id"] === "client-id.access";

      if (req.url === "/start") {
        res.writeHead(301, { location: "/middle" }).end();
      } else if (req.url === "/middle") {
        res.writeHead(302, { location: "/end" }).end();
      } else {
        res.writeHead(authorized ? 418 : 403).end("teapot body");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      // SAFETY: a server listening on a TCP host and port reports an AddressInfo.
      const { port } = server.address() as AddressInfo;

      resume(Effect.succeed({ origin: `http://127.0.0.1:${port}`, close: () => server.close() }));
    });
  }),
  (server) => Effect.sync(server.close),
);
