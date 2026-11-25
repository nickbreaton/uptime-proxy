import { assert, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { Upstream } from "../src/Upstream.ts";

const TestClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) => {
    assert.strictEqual(request.url, "https://example.com/health");
    assert.strictEqual(request.headers["cf-access-client-id"], "client-id.access");
    assert.strictEqual(request.headers["cf-access-client-secret"], "client-secret");

    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 503 })));
  }),
);

const TestEnv = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    CF_ACCESS_CLIENT_ID: "client-id.access",
    CF_ACCESS_CLIENT_SECRET: "client-secret",
  }),
);

layer(Upstream.layer.pipe(Layer.provide(TestClient), Layer.provide(TestEnv)))("Upstream", (it) => {
  it.effect("sends the Cloudflare Access service token and returns the status", () =>
    Effect.gen(function* () {
      const upstream = yield* Upstream;
      const status = yield* upstream.status(new URL("https://example.com/health"));

      assert.strictEqual(status, 503);
    }),
  );
});
