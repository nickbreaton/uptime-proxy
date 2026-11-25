import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Option, Ref } from "effect";
import { FetchHttpClient, HttpClient, HttpClientError } from "effect/http";
import { upstreamUrl } from "../src/Handler.ts";
import { RedirectingServer, TOKEN, bearer, makeHandler, recordingClient, serveApp } from "./helpers.ts";

describe("upstreamUrl", () => {
  it("takes everything after the leading slash, including the query", () => {
    const url = upstreamUrl("/https://status.example.com/health?verbose=1");

    assert.strictEqual(Option.getOrThrow(url).href, "https://status.example.com/health?verbose=1");
  });

  it.each(["/", "/not a url"])("rejects %s", (path) => {
    assert.isTrue(Option.isNone(upstreamUrl(path)));
  });
});

describe("handler", () => {
  it.effect("fails to start with an empty UPTIME_PROXY_TOKEN", () =>
    Effect.gen(function* () {
      const upstream = yield* recordingClient(200);
      const error = yield* makeHandler(upstream.layer, "").pipe(Effect.asVoid, Effect.flip);

      assert.strictEqual(error._tag, "ConfigError");
    }),
  );

  it.effect.each([
    { name: "no", init: undefined },
    { name: "a wrong", init: bearer("nope") },
    { name: "a prefix of the", init: bearer(TOKEN.slice(0, -1)) },
    { name: "a non-bearer", init: { headers: { authorization: `Basic ${TOKEN}` } } },
  ])("rejects $name token with 401 without calling upstream", ({ init }) =>
    Effect.gen(function* () {
      const upstream = yield* recordingClient(200);
      const request = yield* serveApp(upstream.layer);
      const response = yield* request("/https://example.com", init);

      assert.strictEqual(response.status, 401);
      assert.lengthOf(yield* Ref.get(upstream.seen), 0);
    }),
  );

  it.effect("rejects an invalid upstream URL with 400", () =>
    Effect.gen(function* () {
      const upstream = yield* recordingClient(200);
      const request = yield* serveApp(upstream.layer);
      const response = yield* request("/not-a-url", bearer(TOKEN));

      assert.strictEqual(response.status, 400);
      assert.lengthOf(yield* Ref.get(upstream.seen), 0);
    }),
  );

  it.effect("rejects non-GET requests with 405", () =>
    Effect.gen(function* () {
      const upstream = yield* recordingClient(200);
      const request = yield* serveApp(upstream.layer);
      const response = yield* request("/https://example.com", { ...bearer(TOKEN), method: "POST" });

      assert.strictEqual(response.status, 405);
      assert.lengthOf(yield* Ref.get(upstream.seen), 0);
    }),
  );

  it.effect.each([200, 404, 503])("returns upstream status %s with an empty body", (status) =>
    Effect.gen(function* () {
      const upstream = yield* recordingClient(status);
      const request = yield* serveApp(upstream.layer);
      const response = yield* request("/https://example.com/health", bearer(TOKEN));

      assert.strictEqual(response.status, status);
      assert.strictEqual(yield* Effect.promise(() => response.text()), "");
    }),
  );

  it.effect("swaps the bearer token for the Cloudflare Access service token", () =>
    Effect.gen(function* () {
      const upstream = yield* recordingClient(200);
      const request = yield* serveApp(upstream.layer);

      yield* request("/https://example.com/health?x=1", bearer(TOKEN));

      const sent = yield* Ref.get(upstream.seen);

      assert.lengthOf(sent, 1);
      assert.strictEqual(sent[0]?.url, "https://example.com/health?x=1");
      assert.strictEqual(sent[0]?.method, "GET");
      assert.strictEqual(sent[0]?.headers.get("cf-access-client-id"), "client-id.access");
      assert.strictEqual(sent[0]?.headers.get("cf-access-client-secret"), "client-secret");
      assert.isNull(sent[0]?.headers.get("authorization") ?? null);
    }),
  );

  it.effect("returns 502 when the upstream cannot be reached", () =>
    Effect.gen(function* () {
      const unreachable = HttpClient.make((request) =>
        Effect.fail(new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) })),
      );

      const request = yield* serveApp(Layer.succeed(HttpClient.HttpClient, unreachable));
      const response = yield* request("/https://example.com", bearer(TOKEN));

      assert.strictEqual(response.status, 502);
    }),
  );

  it.effect("follows redirects over real fetch and returns the final status", () =>
    Effect.gen(function* () {
      const server = yield* RedirectingServer;
      const request = yield* serveApp(FetchHttpClient.layer);
      const response = yield* request(`/${server.origin}/start`, bearer(TOKEN));

      assert.strictEqual(response.status, 418);
      assert.strictEqual(yield* Effect.promise(() => response.text()), "");
    }),
  );
});
