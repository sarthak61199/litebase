import { PGlite } from "@electric-sql/pglite";
import { createHandlers } from "./handlers";
import { serveWorker } from "./rpc/server";

const db = new PGlite("memory://");

db.waitReady
  .then(() => db.exec("SELECT 1"))
  .then(() => {
    serveWorker(createHandlers(db));
    self.postMessage({ type: "ready" });
  });
