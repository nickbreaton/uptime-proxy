import { Config, Context, Effect, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient, type HttpClientError } from "effect/http";

export class Upstream extends Context.Service<
  Upstream,
  {
    readonly status: (url: URL) => Effect.Effect<number, HttpClientError.HttpClientError>;
  }
>()("uptime-proxy/Upstream") {
  static readonly layer = Layer.effect(
    Upstream,
    Effect.gen(function* () {
      const clientId = yield* Config.Redacted("CF_ACCESS_CLIENT_ID");
      const clientSecret = yield* Config.Redacted("CF_ACCESS_CLIENT_SECRET");
      const client = yield* HttpClient.HttpClient;

      const status = Effect.fn("Upstream.status")(function* (url: URL) {
        const response = yield* client
          .get(url, {
            headers: {
              "CF-Access-Client-Id": Redacted.value(clientId),
              "CF-Access-Client-Secret": Redacted.value(clientSecret),
            },
          })
          .pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }));

        return response.status;
      });

      return Upstream.of({ status });
    }),
  );
}
