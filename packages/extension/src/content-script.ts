import { nip19, NostrEvent } from "nostr-tools";
import {
  copyNeventToClipboard,
  createCodeReferenceEvent,
  createCodeSnippetEvent,
  createRepoAnnouncementEvent,
  fetchRepoEvent,
  generateNostrIssueThread,
  publishEvent,
} from "./event";
import {
  parseGitHubIssueURL,
  parsePermalink,
  parseSnippetLink,
} from "./github";
import { promptForSnippetDescription } from "./snippet-dialog";
import { getActiveRelays } from "./defaults";
import {
  createButton,
  createMenuItem,
  createSmallButton,
  injectSvgInline,
  showSnackbar,
} from "./utils";

injectNostrBridge();

const repoEventCache: Record<string, Promise<NostrEvent | undefined>> = {};

async function getRepoEvent() {
  const { pathname } = window.location;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return;

  const [owner, repo] = segments;
  const cacheKey = `${owner}/${repo}`;

  if (!repoEventCache[cacheKey]) {
    repoEventCache[cacheKey] = fetchRepoEvent(await getActiveRelays());
  }

  return repoEventCache[cacheKey];
}

async function insertNostrIssuesCommand() {
  const id = "nostr-share-issue-button";

  const existingItem = document.getElementById(id);
  if (existingItem) return;

  const buttons = document.querySelector(
    "div.Box-sc-g0xbh4-0.bKeiGd.prc-PageHeader-Actions-ygtmj"
  );
  if (!buttons) return;

  getRepoEvent().then((e) => {
    if (e) {
      const [button, label] = createButton(id, "prc-Button-ButtonBase-c50BI");
      buttons.firstElementChild?.insertAdjacentElement("afterbegin", button);
      label.textContent = "Share Issue on Nostr";
      // A11y
      button.querySelector("button")?.setAttribute("aria-label", "Share Issue on Nostr");
      button.addEventListener("click", async () => {
        const relays = await getActiveRelays();
        const issueInfo = parseGitHubIssueURL();
        if (!issueInfo) {
          showSnackbar("❗Could not locate the issue URL. Please try again.");
          return;
        }
        const events = await generateNostrIssueThread(issueInfo, e, relays);
        const finalEvent = await publishEvent(events.issueEvent, relays);
        await copyNeventToClipboard(finalEvent, relays);

        showSnackbar("✅ Issue published to relays");

        events.commentEvents.forEach(async (comment) => {
          // NIP-22 reply threading: reference the issue root and author
          comment.tags.push(["e", finalEvent.id, "", "root"]);
          comment.tags.push(["p", finalEvent.pubkey]);
          const finalCommentEvent = await publishEvent(comment, relays);
          await copyNeventToClipboard(finalCommentEvent, relays);
          showSnackbar("✅ Comment published to relays");
        });

        console.log(events);
      });
    }
  });
}

async function insertNostrRepoCommand() {
  const lgButtonId = "nostr-share-repo-button";
  const smlButtonId = "nostr-share-repo-button-sml";

  const existingItem = document.getElementById(lgButtonId);
  if (existingItem) return;

  const existingSmlButton = document.getElementById(smlButtonId);
  if (existingSmlButton) return;

  const buttons = document.getElementById("repository-details-container");
  if (!buttons) return;

  const [button, label] = createButton(lgButtonId, "btn-sm btn");
  const li = document.createElement("li");
  li.appendChild(button);
  buttons.firstElementChild?.insertAdjacentElement("afterbegin", li);

  const smlButtonDiv = document.querySelector<HTMLFormElement>(
    "form.unstarred.js-social-form"
  );
  const [smlButton, smlLabel] = createSmallButton(smlButtonId);
  smlButtonDiv!.parentElement!.insertAdjacentElement("afterend", smlButton);

  const relays = await getActiveRelays();

  getRepoEvent().then((e) => {
    const gitWorkshp = () => {
      const npub = nip19.npubEncode(e!.pubkey);
      const repo = e!.tags.find((t) => t[0] === "d")?.[1];
      const url = `https://gitworkshop.dev/${npub}/${repo}`;
      window.open(url, "_blank");
    };
    if (e) {
      label.textContent = "Open on gitworkshop.dev";
      injectSvgInline(label, "svg/gitworkshop.svg", ["octicon", "mr-2"]);
      injectSvgInline(smlLabel, "svg/gitworkshop.svg", [
        "octicon",
        "Button-visual",
      ]);
      // A11y
      li.querySelector("button")?.setAttribute("aria-label", "Open on gitworkshop.dev");
      smlButton.querySelector("button")?.setAttribute("aria-label", "Open on gitworkshop.dev");
      button.addEventListener("click", gitWorkshp);
      smlButton.addEventListener("click", gitWorkshp);
    } else {
      const shareOnNostr = async () => {
        try {
          const unsignedEvent = await createRepoAnnouncementEvent(relays);
          if (unsignedEvent) {
            const finalEvent = await publishEvent(unsignedEvent, relays);
            await copyNeventToClipboard(finalEvent, relays);
            showSnackbar("✅ Repository announcement published");
            button.remove();
            smlButton.remove();
          }
        } catch (err) {
          showSnackbar(
            "❌ Failed to publish Repository Announcement event",
            "error"
          );
        }
      };
      label.textContent = "Share on Nostr";
      injectSvgInline(label, "svg/nostr-icon.svg", ["octicon", "mr-2"]);
      injectSvgInline(smlLabel, "svg/nostr-icon.svg", [
        "octicon",
        "Button-visual",
      ]);
      // A11y
      li.querySelector("button")?.setAttribute("aria-label", "Share on Nostr");
      smlButton.querySelector("button")?.setAttribute("aria-label", "Share on Nostr");
      button.addEventListener("click", shareOnNostr);
      smlButton.addEventListener("click", shareOnNostr);
    }
  });
}

async function injectNostrMenuCommand() {
  // Check if we already added the new items to avoid duplication
  const existingItem = document.getElementById("nostr-generate-event");
  if (existingItem) return;

  const menuItems = document.querySelectorAll<HTMLSpanElement>(
    "span.prc-ActionList-ItemLabel-TmBhn"
  );
  if (!menuItems) return;

  const relays = await getActiveRelays();

  const copyPermalinkItem = Array.from(menuItems).find(
    (el) => el.textContent?.trim() === "Copy permalink"
  );
  if (!copyPermalinkItem) return;

  const rootItem = copyPermalinkItem?.closest(
    ".prc-ActionList-ActionListItem-uq6I7"
  );

  const permalinkItem = createMenuItem("Create Nostr permalink");

  rootItem?.insertAdjacentElement("afterend", permalinkItem);

  const snippetItem = createMenuItem("Create Nostr snippet");

  permalinkItem.insertAdjacentElement("afterend", snippetItem);

  permalinkItem.addEventListener("click", async () => {
    closeGitHubContextMenu();
    const permalink = extractPermalink();
    if (!permalink) {
      showSnackbar("❗Could not locate the permalink URL. Please try again.");
      return;
    }
    try {
      const permalinkData = parsePermalink();
      const nostrEvent = await createCodeReferenceEvent(permalinkData!, relays);
      const finalEvent = await publishEvent(nostrEvent, relays);
      const nevent = await copyNeventToClipboard(finalEvent, relays);
      showSnackbar(`✅ Permalink event published`);
    } catch (err) {
      console.error(`Error generating Nostr event: ${err}`, err);
      showSnackbar("❌ Failed to publish Permalink", "error");
    }
  });

  snippetItem.addEventListener("click", async () => {
    closeGitHubContextMenu();
    const desc = await promptForSnippetDescription();
    if (desc) {
      try {
        const snippetData = parseSnippetLink();
        const nostrEvent = createCodeSnippetEvent(snippetData!, desc);
        const finalEvent = await publishEvent(nostrEvent, relays);
        const nevent = await copyNeventToClipboard(finalEvent, relays);
        console.log(
          `Successfully posted Nostr event: ${nevent} to relays: ${relays}`
        );
        showSnackbar(`✅ Snippet event published`);
      } catch (err) {
        showSnackbar(`❌ Failed to publish Snippet: ${err}`, "error");
      }
    }
  });
}

function extractPermalink(): string | null {
  const currentURL = window.location.href;
  return currentURL || null;
}

function closeGitHubContextMenu() {
  const escapeEvent = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    bubbles: true,
    cancelable: true,
  });

  document.dispatchEvent(escapeEvent);
}

function startObserver() {
  // Observe changes to the DOM and re-inject with debounce to avoid thrashing.
  let timer: number | undefined;
  const observer = new MutationObserver(() => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      injectNostrMenuCommand();
      insertNostrRepoCommand();
      insertNostrIssuesCommand();
    }, 250);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function injectNostrBridge(): void {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-bridge.js");
  script.type = "module";
  script.async = false;
  document.documentElement.appendChild(script);
  script.remove();
}

insertNostrIssuesCommand();
injectNostrMenuCommand();
insertNostrRepoCommand();
startObserver();
