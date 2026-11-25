import { assert, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Option } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { Upstream } from "../src/Upstream.ts";

const TestClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.gen(function* () {
      const init = yield* Effect.serviceOption(FetchHttpClient.RequestInit);

      assert.deepStrictEqual(init, Option.some({ redirect: "manual" }));
      assert.strictEqual(request.url, "https://example.com/health");
      assert.strictEqual(request.headers["cf-access-client-id"], "client-id.access");
      assert.strictEqual(request.headers["cf-access-client-secret"], "client-secret");

      return HttpClientResponse.fromWeb(request, new Response(null, { status: 302 }));
    }),
  ),
);

const TestEnv = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    CF_ACCESS_CLIENT_ID: "client-id.access",
    CF_ACCESS_CLIENT_SECRET: "client-secret",
  }),
);

layer(Upstream.layer.pipe(Layer.provide(TestClient), Layer.provide(TestEnv)))("Upstream", (it) => {
  it.effect("sends the Cloudflare Access service token without following redirects", () =>
    Effect.gen(function* () {
      const upstream = yield* Upstream;
      const status = yield* upstream.status(new URL("https://example.com/health"));

      assert.strictEqual(status, 302);
    }),
  );
});
