import { Config, Effect, Equal, Option, Schema } from "effect";
import { HttpMiddleware, HttpServerRequest, HttpServerResponse, HttpStatus } from "effect/http";
import { HttpApiBuilder, HttpApiSecurity } from "effect/http-api";
import { Upstream } from "./Upstream.ts";

export const upstreamUrl = (requestUrl: string): Option.Option<URL> =>
  Schema.decodeOption(Schema.URLFromString)(requestUrl.slice(1));

const respond = (literal: HttpStatus.Literal) => HttpServerResponse.empty({ status: HttpStatus.fromLiteral(literal) });

export const Handler = Effect.gen(function* () {
  const token = yield* Config.schema(Schema.Redacted(Schema.NonEmptyString), "UPTIME_PROXY_TOKEN");
  const upstream = yield* Upstream;

  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;

    if (request.method !== "GET" && request.method !== "HEAD") {
      return respond("MethodNotAllowed");
    }

    const provided = yield* HttpApiBuilder.securityDecode(HttpApiSecurity.bearer);

    if (!Equal.equals(provided, token)) {
      return respond("Unauthorized");
    }

    const url = upstreamUrl(request.url);

    if (Option.isNone(url)) {
      return respond("BadRequest");
    }

    const status = yield* upstream.status(url.value);

    return respond(status === 200 ? "OK" : "ServiceUnavailable");
  }).pipe(
    Effect.catchTag("HttpClientError", () => Effect.succeed(respond("BadGateway"))),
    HttpMiddleware.searchParamsParser,
  );
});
