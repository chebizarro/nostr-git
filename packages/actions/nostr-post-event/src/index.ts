import { getInput, setFailed } from "@actions/core";
import fs from "fs";
import { getPublicKey, getEventHash, signEvent, relayInit } from "nostr-tools";

async function run() {
  try {
    const privkey = getInput("nostr-private-key", { required: true });
    const relayUrl = getInput("nostr-relay-url", { required: true });
    const eventPath = getInput("github-event-path");
    const eventName = getInput("github-event-name");

    const pubkey = getPublicKey(privkey);
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));

    let content = "";
    const tags: string[][] = [
      ["client", "github-action"],
      ["source", eventName],
    ];

    const event = {
      kind: 1,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    };

    if (eventName === "issues") {
      content = `📌 Issue: ${payload.issue.title}\n\n${payload.issue.body}\n\n🔗 ${payload.issue.html_url}`;
      tags.push(["issue", String(payload.issue.number)]);
    } else if (eventName === "pull_request") {
      content = `🔀 PR: ${payload.pull_request.title}\n\n${payload.pull_request.body}\n\n🔗 ${payload.pull_request.html_url}`;
      tags.push(["pr", String(payload.pull_request.number)]);
    } else if (eventName === "repository" && payload.repository) {
      const repo = payload.repository;
      content = "";

      tags.push(["d", repo.name]);
      tags.push(["name", repo.name]);
      tags.push(["description", repo.description ?? ""]);
      tags.push(["web", repo.html_url]);
      tags.push(["clone", repo.clone_url ?? `${repo.html_url}.git`]);

      event.kind = 30617;
    } else {
      content = `GitHub event: ${eventName}`;
    }

    if (useRemoteSigner) {
      const { connectSignerAndSign } = await import("./nip46-signer.js");
      event.sig = await connectSignerAndSign({
        event,
        relayUrl: remoteRelay,
        remoteSignerPubkey,
      });
    } else {
      event.sig = signEvent(event, privkey);
    }
    const relay = relayInit(relayUrl);
    await relay.connect();

    await new Promise((resolve, reject) => {
      const pub = relay.publish(event);
      pub.on("ok", () => {
        console.log("✅ Published to relay");
        resolve(true);
      });
      pub.on("failed", (reason: string) => {
        console.error("❌ Failed to publish:", reason);
        reject(reason);
      });
    });

    await relay.close();
  } catch (error: any) {
    setFailed(error.message);
  }
}

run();
