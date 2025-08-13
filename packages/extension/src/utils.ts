export function showSnackbar(
  message: string,
  type: "success" | "error" | "cancel" = "success",
  link?: { href: string; label?: string }
) {
  ensureSnackbarContainer();

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const snackbar = document.createElement("div");
  // Build content: text + optional link
  const textSpan = document.createElement('span');
  textSpan.textContent = message + (link ? ' ' : '');
  snackbar.appendChild(textSpan);
  if (link && link.href) {
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link.label || link.href;
    a.style.color = '#fff';
    a.style.textDecoration = 'underline';
    a.style.marginLeft = '4px';
    a.addEventListener('click', (e) => {
      // prevent the snackbar container's click handler from dismissing
      e.stopPropagation();
    });
    snackbar.appendChild(a);

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.style.marginLeft = '8px';
    copyBtn.style.padding = '2px 6px';
    copyBtn.style.fontSize = '12px';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.border = '1px solid rgba(255,255,255,0.5)';
    copyBtn.style.background = 'transparent';
    copyBtn.style.color = '#fff';
    copyBtn.style.cursor = 'pointer';
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(link.href);
      } catch (err) {
        console.warn('Failed to copy link to clipboard', err);
      }
    });
    snackbar.appendChild(copyBtn);
  }
  const bg = type === "success" ? "#2da44e" : type === "cancel" ? "#e5534b" : "#cf222e";
  snackbar.style.background = bg;
  snackbar.style.color = "#ffffff";
  snackbar.style.padding = "8px 16px";
  snackbar.style.borderRadius = "6px";
  snackbar.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
  snackbar.style.fontSize = "14px";
  snackbar.style.fontWeight = "500";
  snackbar.style.maxWidth = "90%";
  snackbar.style.whiteSpace = "pre-wrap";
  snackbar.style.wordBreak = "break-word";
  snackbar.style.opacity = prefersReduced ? "1" : "0";
  snackbar.style.transform = prefersReduced ? "none" : "translateY(8px)";
  snackbar.style.transition = prefersReduced ? "none" : "opacity 180ms ease, transform 180ms ease";
  snackbar.style.cursor = "pointer";
  snackbar.setAttribute('role', 'button');
  snackbar.setAttribute('aria-label', 'Notification: click to dismiss');
  snackbar.tabIndex = 0;

  document.getElementById("nostr-snackbar-container")?.appendChild(snackbar);

  if (!prefersReduced) {
    requestAnimationFrame(() => {
      snackbar.style.opacity = "1";
      snackbar.style.transform = "translateY(0)";
    });
  }

  const dismiss = () => {
    if (!prefersReduced) snackbar.style.transform = "translateY(8px)";
    snackbar.style.opacity = "0";
    setTimeout(() => snackbar.remove(), prefersReduced ? 0 : 250);
  };
  snackbar.addEventListener('click', dismiss);
  snackbar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dismiss();
    }
  });

  // Auto-dismiss: 3s for cancel, 5s otherwise
  const AUTO_CLOSE_MS = type === 'cancel' ? 3000 : 5000;
  const timer = window.setTimeout(() => dismiss(), AUTO_CLOSE_MS);
  // Clear timer if it is dismissed manually early
  const clear = () => window.clearTimeout(timer);
  snackbar.addEventListener('click', clear);
  snackbar.addEventListener('keydown', clear, { once: true });
}

function ensureSnackbarContainer() {
  if (document.getElementById("nostr-snackbar-container")) return;

  const container = document.createElement("div");
  container.id = "nostr-snackbar-container";
  container.style.position = "fixed";
  container.style.bottom = "20px";
  container.style.left = "50%";
  container.style.transform = "translateX(-50%)";
  container.style.zIndex = "9999";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.alignItems = "center";
  container.style.gap = "8px";
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
}

export function createSmallButton(id: string): [HTMLDivElement, HTMLSpanElement] {
  const div = document.createElement("div");
  div.className = "d-md-none";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "Button Button--iconOnly Button--secondary Button--medium";
  button.tabIndex = 1;

  const buttonContainer = document.createElement("span");
  buttonContainer.className = "prc-Button-ButtonContent-HKbr-";

  const labelSpan = document.createElement("span");
  labelSpan.id = id;
  labelSpan.className = "prc-Button-Visual-2epfX prc-Button-VisualWrap-Db-eB";

  buttonContainer.appendChild(labelSpan);
  button.appendChild(buttonContainer);
  div.appendChild(button);

  return [div, labelSpan];
}

export function createButton(id: string, cls: string): [HTMLDivElement, HTMLSpanElement] {
  const div = document.createElement("div");
  div.className = "Box-sc-g0xbh4-0";

  const button = document.createElement("button");
  button.type = "button";
  button.className = cls;
  button.tabIndex = 1;

  const buttonContainer = document.createElement("span");
  buttonContainer.className = "prc-Button-ButtonContent-HKbr-";

  const labelSpan = document.createElement("span");
  labelSpan.id = id;
  labelSpan.className = "prc-Button-Label-pTQ3x";

  labelSpan.textContent = "Loading...";

  buttonContainer.appendChild(labelSpan);
  button.appendChild(buttonContainer);
  div.appendChild(button);

  return [div, labelSpan];
}

export async function injectSvgInline(
  target: HTMLElement,
  svgPath: string,
  cls: string[]
): Promise<void> {
  try {
    const res = await fetch(chrome.runtime.getURL(svgPath));
    const svgText = await res.text();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = svgText;
    const svgElement = wrapper.firstElementChild as SVGElement;
    if (svgElement && svgElement.tagName === "svg") {
      svgElement.classList.add(...cls);
      target.prepend(svgElement);
    }
  } catch (err) {
    console.error("Failed to load SVG", svgPath, err);
  }
}

export function createMenuItem(id: string, label: string): HTMLLIElement {
  // Create the <li> element
  const li = document.createElement("li");
  li.tabIndex = -1;
  li.setAttribute("aria-labelledby", `${id}-label`);
  li.setAttribute("role", "menuitem");
  li.id = id;
  li.className = "prc-ActionList-ActionListItem-uq6I7";
  li.setAttribute("aria-keyshortcuts", "n");

  // Create the <div>
  const div = document.createElement("div");
  div.className = "prc-ActionList-ActionListContent-sg9-x";

  // Create the first <span> (the spacer)
  const spacerSpan = document.createElement("span");
  spacerSpan.className = "prc-ActionList-Spacer-dydlX";

  // Create the second <span> (sub-content container)
  const subContentSpan = document.createElement("span");
  subContentSpan.className = "prc-ActionList-ActionListSubContent-lP9xj";

  // Create the inner label <span>
  const labelSpan = document.createElement("span");
  labelSpan.id = `${id}-label`;
  labelSpan.className = "prc-ActionList-ItemLabel-TmBhn";
  labelSpan.textContent = label;

  // Nest the elements
  subContentSpan.appendChild(labelSpan);
  div.appendChild(spacerSpan);
  div.appendChild(subContentSpan);
  li.appendChild(div);

  return li;
}
