import { app } from "./app";
import { env } from "./lib/env";

const server = app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});

// Agent SSE streams stay open for hours by design. Node's default 5-minute
// request timeout would destroy them mid-stream, so it is disabled here;
// the 25s SSE heartbeats already keep proxies and LBs from idling out.
server.requestTimeout = 0;
