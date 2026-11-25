import * as Alchemy from "alchemy";
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";
import UptimeProxy from "./src/worker.ts";

export default Alchemy.Stack(
  "UptimeProxy",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* UptimeProxy;

    return { url: worker.url };
  }),
);
