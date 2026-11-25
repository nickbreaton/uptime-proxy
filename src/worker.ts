import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { Handler } from "./Handler.ts";
import { Upstream } from "./Upstream.ts";

export default Cloudflare.Worker(
  "UptimeProxy",
  {
    name: "uptime-proxy",
    main: import.meta.url,
    compatibility: { flags: ["global_fetch_strictly_public"] },
  },
  Handler.pipe(
    Effect.map((fetch) => ({ fetch })),
    Effect.provide(Upstream.layer.pipe(Layer.provide(FetchHttpClient.layer))),
  ),
);
