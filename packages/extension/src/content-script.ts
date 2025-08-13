import { nip19, NostrEvent } from "nostr-tools";
import {
  copyNeventToClipboard,
  createCodeReferenceEvent,
  createCodeSnippetEvent,
  createRepoAnnouncementEvent,
  createRepoStateEvent,
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
import { getActiveRelays, getViewerBase } from "./defaults";
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

  // Try stable or fallback container for issue header actions
  const buttons =
    document.querySelector("div.Box-sc-g0xbh4-0.bKeiGd.prc-PageHeader-Actions-ygtmj") ||
    document.querySelector("#repository-content-pjax-container header div:has(button)") ||
    document.querySelector("header div");
  if (!buttons) return;

  getRepoEvent().then((e) => {
    if (e) {
      const [button, label] = createButton(id, "prc-Button-ButtonBase-c50BI");
      buttons.firstElementChild?.insertAdjacentElement("afterbegin", button);
      label.textContent = "Share Issue on Nostr";
      (button.querySelector("button") as HTMLButtonElement | null)?.setAttribute("title", "Share Issue on Nostr");
      // A11y
      button.querySelector("button")?.setAttribute("aria-label", "Share Issue on Nostr");
      const issueBtn = button.querySelector("button");
      const handleShareIssue = async () => {
        const relays = await getActiveRelays();
        const issueInfo = parseGitHubIssueURL();
        if (!issueInfo) {
          showSnackbar("❗Could not locate the issue URL. Please try again.");
          return;
        }
        const events = await generateNostrIssueThread(issueInfo, e, relays);
        const finalEvent = await publishEvent(events.issueEvent, relays);
        const nevent = await copyNeventToClipboard(finalEvent, relays);
        if (nevent) {
          const base = await getViewerBase();
          const href = `${base}${nevent}`;
          const label = nevent.length > 24 ? `${nevent.slice(0, 12)}…${nevent.slice(-8)}` : nevent;
          showSnackbar("✅ Issue published:", "success", { href, label });
        } else {
          showSnackbar("✅ Issue published", "success");
        }

        events.commentEvents.forEach(async (comment) => {
          // NIP-22 reply threading: reference the issue root and author
          comment.tags.push(["e", finalEvent.id, "", "root"]);
          comment.tags.push(["p", finalEvent.pubkey]);
          const finalCommentEvent = await publishEvent(comment, relays);
          await copyNeventToClipboard(finalCommentEvent, relays);
          showSnackbar("✅ Comment published to relays");
        });

        console.log(events);
      };
      if (issueBtn) {
        issueBtn.addEventListener("click", handleShareIssue);
      } else {
        // Fallback to container
        button.addEventListener("click", handleShareIssue);
      }
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

  const smlButtonDiv =
    document.querySelector<HTMLFormElement>("form.unstarred.js-social-form") ||
    document.querySelector<HTMLFormElement>("form.js-social-form");
  const [smlButton, smlLabel] = createSmallButton(smlButtonId);
  if (smlButtonDiv?.parentElement) {
    smlButtonDiv.parentElement.insertAdjacentElement("afterend", smlButton);
  }

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
      (li.querySelector("button") as HTMLButtonElement | null)?.setAttribute("title", "Open on gitworkshop.dev");
      injectSvgInline(label, "svg/gitworkshop.svg", ["octicon", "mr-2"]);
      injectSvgInline(smlLabel, "svg/gitworkshop.svg", [
        "octicon",
        "Button-visual",
      ]);
      // A11y
      li.querySelector("button")?.setAttribute("aria-label", "Open on gitworkshop.dev");
      smlButton.querySelector("button")?.setAttribute("aria-label", "Open on gitworkshop.dev");
      const bigBtn = li.querySelector("button");
      const smlBtn = smlButton.querySelector("button");
      if (bigBtn) bigBtn.addEventListener("click", gitWorkshp);
      else button.addEventListener("click", gitWorkshp);
      if (smlBtn) smlBtn.addEventListener("click", gitWorkshp);
      else smlButton.addEventListener("click", gitWorkshp);
    } else {
      const shareOnNostr = async () => {
        try {
          // Confirm before publishing repo announcement
          const okRepo = window.confirm(
            "Publish Repository Announcement to Nostr?"
          );
          if (!okRepo) {
            showSnackbar("❎ Cancelled Repository announcement", "cancel");
            return;
          }
          // 1) Repo announcement (30617)
          const repoAnnouncement = await createRepoAnnouncementEvent(relays);
          if (repoAnnouncement) {
            const finalAnnouncement = await publishEvent(repoAnnouncement, relays);
            const nevent = await copyNeventToClipboard(finalAnnouncement, relays);
            if (nevent) {
              const base = await getViewerBase();
              const href = `${base}${nevent}`;
              const label = nevent.length > 24 ? `${nevent.slice(0, 12)}…${nevent.slice(-8)}` : nevent;
              showSnackbar("✅ Repository announcement:", "success", { href, label });
            } else {
              showSnackbar("✅ Repository announcement published", "success");
            }
          }

          // 2) Repo state (30618)
          const repoState = await createRepoStateEvent();
          if (repoState) {
            await publishEvent(repoState, relays);
            showSnackbar("✅ Repository state published");
          }

          // Clean up the injected buttons after successful share
          button.remove();
          smlButton.remove();
        } catch (err) {
          console.error("Failed to publish repository events:", err);
          showSnackbar(
            "❌ Failed to publish repository events",
            "error"
          );
        }
      };
      label.textContent = "Share on Nostr";
      (li.querySelector("button") as HTMLButtonElement | null)?.setAttribute("title", "Share on Nostr");
      injectSvgInline(label, "svg/nostr-icon.svg", ["octicon", "mr-2"]);
      injectSvgInline(smlLabel, "svg/nostr-icon.svg", [
        "octicon",
        "Button-visual",
      ]);
      // A11y
      li.querySelector("button")?.setAttribute("aria-label", "Share on Nostr");
      smlButton.querySelector("button")?.setAttribute("aria-label", "Share on Nostr");
      const bigBtn2 = li.querySelector("button");
      const smlBtn2 = smlButton.querySelector("button");
      if (bigBtn2) bigBtn2.addEventListener("click", shareOnNostr);
      else button.addEventListener("click", shareOnNostr);
      if (smlBtn2) smlBtn2.addEventListener("click", shareOnNostr);
      else smlButton.addEventListener("click", shareOnNostr);
    }
  });
}

async function injectNostrMenuCommand() {
  const idPermalink = "nostr-generate-event-permalink";
  const idSnippet = "nostr-generate-event-snippet";

  if (document.getElementById(idPermalink) || document.getElementById(idSnippet)) return;

  // Find a visible non-header menu (GitHub renders some menus at document.body)
  const allMenus = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"], [role="listbox"]'));
  const isVisible = (el: HTMLElement | null) => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
  const openMenu = allMenus.find(el => {
    if (!isVisible(el)) return false;
    const inHeader = !!el.closest('header, .AppHeader, [data-test-selector="header"]');
    return !inHeader;
  });
  if (!openMenu) return; // only inject when a GitHub menu is actually open

  // Look for menu items using role-based selector and multiple label variants
  const candidates = Array.from(
    openMenu.querySelectorAll<HTMLElement>('[role="menuitem"], li, button, a, span')
  );
  const wanted = ["copy permalink", "copy permanent link", "copy link"];
  const copyPermalinkItem = candidates.find((el) => {
    const text = el.textContent?.trim().toLowerCase() || "";
    return wanted.some((w) => text.includes(w));
  });
  // If no explicit copy item, consider appending at end for relevant pages
  if (!copyPermalinkItem) {
    const path = window.location.pathname;
    const isRelevant = /\/(blob|pull|commit|compare)\//.test(path) || /\/pull\//.test(path);
    if (!isRelevant) return;
    const permalinkItem = createMenuItem(idPermalink, "Create Nostr permalink");
    const snippetItem = createMenuItem(idSnippet, "Create Nostr snippet");
    permalinkItem.removeAttribute('hidden');
    snippetItem.removeAttribute('hidden');
    (permalinkItem as HTMLElement).style.display = '';
    (snippetItem as HTMLElement).style.display = '';
    openMenu.appendChild(permalinkItem);
    openMenu.appendChild(snippetItem);
    const relays = await getActiveRelays();
    const handlePermalink = async () => {
      closeGitHubContextMenu();
      const permalink = extractPermalink();
      if (!permalink) { showSnackbar("❗Could not locate the permalink URL. Please try again."); return; }
      try {
        // Confirm before publishing permalink
        const ok = window.confirm("Publish Permalink to Nostr?");
        if (!ok) {
          showSnackbar("❎ Cancelled Permalink publish", "cancel");
          return;
        }
        const permalinkData = parsePermalink();
        const nostrEvent = await createCodeReferenceEvent(permalinkData!, relays);
        const finalEvent = await publishEvent(nostrEvent, relays);
        const nevent = await copyNeventToClipboard(finalEvent, relays);
        if (nevent) {
          const base = await getViewerBase();
          const href = `${base}${nevent}`;
          const label = href; // show full URL + nevent as requested
          showSnackbar(`✅ Permalink event published:`, "success", { href, label });
        } else {
          showSnackbar(`✅ Permalink event published`, "success");
        }
      } catch (err) {
        console.error(err);
        showSnackbar("❌ Failed to publish Permalink", "error");
      }
    };
    const handleSnippet = async () => {
      closeGitHubContextMenu();
      const desc = await promptForSnippetDescription();
      if (desc) {
        try {
          const snippetData = parseSnippetLink();
          const nostrEvent = createCodeSnippetEvent(snippetData!, desc);
          const finalEvent = await publishEvent(nostrEvent, relays);
          const nevent = await copyNeventToClipboard(finalEvent, relays);
          if (nevent) {
            const base = await getViewerBase();
            const href = `${base}${nevent}`;
            const label = href; // show full URL + nevent as requested
            showSnackbar(`✅ Snippet event published:`, "success", { href, label });
          } else {
            showSnackbar(`✅ Snippet event published`, "success");
          }
        } catch (err) {
          showSnackbar(`❌ Failed to publish Snippet: ${err}`, "error");
        }
      }
    };
    permalinkItem.addEventListener("click", handlePermalink);
    permalinkItem.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlePermalink(); } });
    snippetItem.addEventListener("click", handleSnippet);
    snippetItem.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSnippet(); } });
    return;
  }

  // Use role-based selector instead of brittle class names
  const rootItem = copyPermalinkItem?.closest('[role="menuitem"]') as HTMLElement | null
    || (copyPermalinkItem as HTMLElement | null)?.parentElement as (HTMLElement | null);
  // Fallback: find the first visible menuitem to insert after
  const firstVisibleItem = Array.from(openMenu.querySelectorAll<HTMLElement>('[role="menuitem"], li, button, a, span')).find(isVisible) as (HTMLElement | undefined);

  const permalinkItem = createMenuItem(idPermalink, "Create Nostr permalink");

  if (rootItem) {
    permalinkItem.removeAttribute('hidden');
    (permalinkItem as HTMLElement).style.display = '';
    rootItem.insertAdjacentElement("afterend", permalinkItem);
  } else {
    // fallback: append to open menu
    permalinkItem.removeAttribute('hidden');
    (permalinkItem as HTMLElement).style.display = '';
    if (firstVisibleItem && firstVisibleItem.closest('[role="menuitem"], li')) {
      firstVisibleItem.closest('[role="menuitem"], li')!.insertAdjacentElement('afterend', permalinkItem);
    } else {
      openMenu.appendChild(permalinkItem);
    }
  }

  const snippetItem = createMenuItem("nostr-generate-event-snippet", "Create Nostr snippet");

  if (permalinkItem.parentElement) {
    snippetItem.removeAttribute('hidden');
    (snippetItem as HTMLElement).style.display = '';
    permalinkItem.insertAdjacentElement("afterend", snippetItem);
  } else {
    snippetItem.removeAttribute('hidden');
    (snippetItem as HTMLElement).style.display = '';
    if (permalinkItem.closest('[role="menuitem"], li')) {
      permalinkItem.closest('[role="menuitem"], li')!.insertAdjacentElement('afterend', snippetItem);
    } else if (firstVisibleItem && firstVisibleItem.closest('[role="menuitem"], li')) {
      firstVisibleItem.closest('[role="menuitem"], li')!.insertAdjacentElement('afterend', snippetItem);
    } else {
      openMenu.appendChild(snippetItem);
    }
  }

  const relays = await getActiveRelays();

  const handlePermalink = async () => {
    closeGitHubContextMenu();
    const permalink = extractPermalink();
    if (!permalink) {
      showSnackbar("❗Could not locate the permalink URL. Please try again.");
      return;
    }
    try {
      // Confirm before publishing permalink
      const ok = window.confirm("Publish Permalink to Nostr?");
      if (!ok) {
        showSnackbar("❎ Cancelled Permalink publish", "cancel");
        return;
      }
      const permalinkData = parsePermalink();
      const nostrEvent = await createCodeReferenceEvent(permalinkData!, relays);
      const finalEvent = await publishEvent(nostrEvent, relays);
      const nevent = await copyNeventToClipboard(finalEvent, relays);
      if (nevent) {
        const base = await getViewerBase();
        const href = `${base}${nevent}`;
        const label = href; // full URL + nevent
        showSnackbar(`✅ Permalink event published:`, "success", { href, label });
      } else {
        showSnackbar(`✅ Permalink event published`, "success");
      }
    } catch (err) {
      console.error(`Error generating Nostr event: ${err}`, err);
      showSnackbar("❌ Failed to publish Permalink", "error");
    }
    // Restore focus near where we injected
    (rootItem as HTMLElement | null)?.focus();
  };
  permalinkItem.addEventListener("click", handlePermalink);
  permalinkItem.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlePermalink(); }
  });

  const handleSnippet = async () => {
    closeGitHubContextMenu();
    const desc = await promptForSnippetDescription();
    if (desc) {
      try {
        const snippetData = parseSnippetLink();
        const nostrEvent = createCodeSnippetEvent(snippetData!, desc);
        const finalEvent = await publishEvent(nostrEvent, relays);
        const nevent = await copyNeventToClipboard(finalEvent, relays);
        if (nevent) {
          const base = await getViewerBase();
          const href = `${base}${nevent}`;
          const label = href; // full URL + nevent
          showSnackbar(`✅ Snippet event published:`, "success", { href, label });
        } else {
          showSnackbar(`✅ Snippet event published`, "success");
        }
      } catch (err) {
        showSnackbar(`❌ Failed to publish Snippet: ${err}`, "error");
      }
    }
    // Restore focus near where we injected
    (rootItem as HTMLElement | null)?.focus();
  };
  snippetItem.addEventListener("click", handleSnippet);
  snippetItem.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSnippet(); }
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
