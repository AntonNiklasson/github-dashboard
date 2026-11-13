import { createInterface } from "node:readline/promises";
import { startScenario } from "./runtime.js";
import type { Phase } from "./github.js";

const scenario = await startScenario();
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const stop = async () => {
  terminal.close();
  await scenario.close();
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
console.log(`Scenario board: ${scenario.url}`);
console.log("Commands: in-flight, queued, queue-failed, offline, sync, quit");
console.log(
  "Each phase command syncs the real API. The board polls every 10s; reload for an immediate update.",
);
try {
  for await (const line of terminal) {
    const command = line.trim();
    if (command === "quit") break;
    if (["in-flight", "queued", "queue-failed", "offline"].includes(command)) {
      scenario.setPhase(command as Phase);
    } else if (command !== "sync") {
      console.log(
        "Unknown command. Use in-flight, queued, queue-failed, offline, sync, or quit.",
      );
      continue;
    }
    try {
      const prs = await scenario.syncPrs();
      console.log(
        JSON.stringify(
          prs.map(
            (pr: {
              number: number;
              inMergeQueue: boolean;
              ciStatus: string;
            }) => ({
              number: pr.number,
              queued: pr.inMergeQueue,
              ci: pr.ciStatus,
            }),
          ),
        ),
      );
    } catch (error) {
      console.log(String(error));
    }
  }
} finally {
  await stop();
}
