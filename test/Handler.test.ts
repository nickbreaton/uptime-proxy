import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Option } from "effect";
import { HttpClientError, HttpClientRequest, HttpServerRequest } from "effect/http";
import { Handler, upstreamUrl } from "../src/Handler.ts";
import { Upstream } from "../src/Upstream.ts";

const handle = Effect.fn("handle")(function* (
  request: Request,
  status: Upstream["Service"]["status"],
  token = "test-token",
) {
  const handler = yield* Handler.pipe(
    Effect.provide(
      Layer.merge(
        Layer.succeed(Upstream, Upstream.of({ status })),
        ConfigProvider.layer(ConfigProvider.fromUnknown({ UPTIME_PROXY_TOKEN: token })),
      ),
    ),
  );

  return yield* Effect.provideService(handler, HttpServerRequest.HttpServerRequest, HttpServerRequest.fromWeb(request));
});

describe("upstreamUrl", () => {
  it("takes everything after the leading slash, including the query", () => {
    const url = upstreamUrl("/https://status.example.com/health?verbose=1");

    assert.strictEqual(Option.getOrThrow(url).href, "https://status.example.com/health?verbose=1");
  });

  it.each(["/", "/not a url"])("rejects %s", (path) => {
    assert.isTrue(Option.isNone(upstreamUrl(path)));
  });
});

describe("Handler", () => {
  it.effect("fails to start with an empty UPTIME_PROXY_TOKEN", () =>
    Effect.gen(function* () {
      const error = yield* handle(new Request("http://localhost/https://example.com"), () => Effect.die("upstream should not be called"), "").pipe(
        Effect.flip,
      );

      assert.strictEqual(error._tag, "ConfigError");
    }),
  );

  it.effect.each([
    { name: "no", headers: new Headers() },
    { name: "a wrong", headers: new Headers({ authorization: "Bearer nope" }) },
    { name: "a prefix of the", headers: new Headers({ authorization: "Bearer test-toke" }) },
    { name: "a non-bearer", headers: new Headers({ authorization: "Basic test-token" }) },
  ])("rejects $name token with 401", ({ headers }) =>
    Effect.gen(function* () {
      const response = yield* handle(new Request("http://localhost/https://example.com", { headers }), () => Effect.die("upstream should not be called"));

      assert.strictEqual(response.status, 401);
    }),
  );

  it.effect("rejects an invalid upstream URL with 400", () =>
    Effect.gen(function* () {
      const request = new Request("http://localhost/not-a-url", { headers: { authorization: "Bearer test-token" } });
      const response = yield* handle(request, () => Effect.die("upstream should not be called"));

      assert.strictEqual(response.status, 400);
    }),
  );

  it.effect("rejects non-GET requests with 405", () =>
    Effect.gen(function* () {
      const request = new Request("http://localhost/https://example.com", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
      });

      const response = yield* handle(request, () => Effect.die("upstream should not be called"));

      assert.strictEqual(response.status, 405);
    }),
  );

  it.effect.each([200, 404, 503])("returns upstream status %s for the upstream URL", (status) =>
    Effect.gen(function* () {
      const request = new Request("http://localhost/https://example.com/health?x=1", {
        headers: { authorization: "Bearer test-token" },
      });

      const response = yield* handle(request, (url) => {
        assert.strictEqual(url.href, "https://example.com/health?x=1");

        return Effect.succeed(status);
      });

      assert.strictEqual(response.status, status);
    }),
  );

  it.effect("returns 502 when the upstream cannot be reached", () =>
    Effect.gen(function* () {
      const request = new Request("http://localhost/https://example.com", {
        headers: { authorization: "Bearer test-token" },
      });

      const response = yield* handle(request, (url) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({ request: HttpClientRequest.get(url) }),
          }),
        ),
      );

      assert.strictEqual(response.status, 502);
    }),
  );
});
