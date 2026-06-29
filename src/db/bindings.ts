import type { DBClient } from "./client";
import { useEngineStore } from "../stores/engineStore";
import { useResultStore } from "../stores/resultStore";

export function bindClientToStores(client: DBClient): () => void {
  return client.on((event) => {
    switch (event.type) {
      case "engine:booting":
        useEngineStore.getState().setBooting();
        break;
      case "engine:ready":
        useEngineStore.getState().setReady();
        break;
      case "engine:restarting":
        useEngineStore.getState().setRestarting();
        break;
      case "engine:crashed":
        useEngineStore.getState().setCrashed(event.error);
        break;
      case "run:begin":
        useResultStore.getState().beginRun(event.runId);
        useEngineStore.getState().clearHadRestart();
        break;
      case "run:succeed":
        useResultStore.getState().succeed(event.result, event.durationMs);
        break;
      case "run:fail":
        useResultStore.getState().fail(event.error, event.durationMs);
        break;
      case "run:cancelling":
        useResultStore.getState().cancelling();
        break;
    }
  });
}
