// bippy must be evaluated before React; importing it here installs the RDT hook
// as a side-effect. This IIFE bundle runs synchronously when the <script> tag
// loads, so as long as the user pastes the tag into <head> before their app
// entry, the hook is in place when React boots.
import "bippy";

import { mountShadow } from "./mount";
import { TriggerButton } from "./trigger";
import { OverlayLayer } from "./overlay";
import { Picker } from "./pick";
import { PromptBox } from "./prompt-box";
import { StatusManager } from "./status";
import { JobSocket } from "./socket";
import { resolveTarget } from "./source";
import { buildFingerprint, findByFingerprint } from "./refind";
import { persistence } from "./persistence";
import type { CreateJobRequest, CreateJobResponse, ServerEvent } from "../protocol";

declare global {
  interface Window {
    __SPIDEY_GRAB__?: boolean;
  }
}

function boot() {
  if (window.__SPIDEY_GRAB__) return;
  window.__SPIDEY_GRAB__ = true;

  const baseUrl = detectBaseUrl();
  const mount = mountShadow();
  const overlay = new OverlayLayer(mount.layer);
  const status = new StatusManager(overlay);
  const socket = new JobSocket(baseUrl);
  socket.on((event) => {
    if (event.type === "hello") {
      recoverFromHello(event);
    }
    status.handleServerEvent(event);
  });

  let mode: "idle" | "picking" = "idle";
  let activePromptBox: PromptBox | null = null;
  let selectedOutlineId: symbol | null = null;

  const isOwnNode = (node: Node | null): boolean => {
    if (!node) return false;
    return mount.host.contains(node) || node === mount.host;
  };

  function clearSelected() {
    if (selectedOutlineId !== null) {
      overlay.remove(selectedOutlineId);
      selectedOutlineId = null;
    }
  }

  function closePromptBox() {
    activePromptBox?.destroy();
    activePromptBox = null;
    clearSelected();
  }

  const trigger = new TriggerButton(mount.layer, toggleGrab);

  function toggleGrab() {
    if (mode === "picking") {
      stopPicking();
    } else {
      closePromptBox();
      startPicking();
    }
  }

  window.addEventListener(
    "keydown",
    (e) => {
      const isShortcut =
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === "g" || e.key === "G");
      if (!isShortcut) return;
      e.preventDefault();
      e.stopPropagation();
      toggleGrab();
    },
    true,
  );

  const picker = new Picker(overlay, {
    isOwnNode,
    onPick: async (target) => {
      stopPicking();
      await openPromptFor(target);
    },
    onCancel: () => {
      stopPicking();
    },
  });

  function startPicking() {
    closePromptBox();
    mode = "picking";
    trigger.setActive(true);
    picker.start();
  }

  function stopPicking() {
    if (mode !== "picking") return;
    mode = "idle";
    trigger.setActive(false);
    picker.stop();
  }

  async function openPromptFor(target: Element) {
    closePromptBox();
    const resolved = await resolveTarget(target);
    const fp = buildFingerprint(target, resolved);

    selectedOutlineId = overlay.attach(target, "selected", {
      withBadge: false,
      refinder: () => findByFingerprint(fp),
    });

    activePromptBox = new PromptBox({
      parent: mount.layer,
      target,
      resolved,
      onSubmit: async (prompt) => {
        const box = activePromptBox;
        activePromptBox = null;
        box?.destroy();
        clearSelected();

        const req: CreateJobRequest = {
          prompt,
          source: resolved.source,
          context: resolved.context,
        };

        try {
          const res = await fetch(`${baseUrl}jobs`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(req),
          });
          if (!res.ok) {
            console.error("[spidey-grab] failed to create job", res.status, await res.text());
            return;
          }
          const body = (await res.json()) as CreateJobResponse;
          status.track(body.jobId, target, fp, { persist: true });
        } catch (err) {
          console.error("[spidey-grab] could not reach daemon", err);
        }
      },
      onCancel: () => {
        closePromptBox();
      },
    });
  }

  function recoverFromHello(event: Extract<ServerEvent, { type: "hello" }>) {
    const persisted = persistence.load();
    if (persisted.length === 0) return;
    const byId = new Map(event.jobs.map((j) => [j.jobId, j]));
    for (const p of persisted) {
      const snap = byId.get(p.jobId);
      if (!snap) {
        // daemon doesn't know this job anymore (probably restarted); drop it
        persistence.remove(p.jobId);
        continue;
      }
      // already attached this session? skip
      if (status.hasJob(p.jobId)) continue;
      void status.recover(p, {
        status: snap.status,
        step: snap.step,
        error: snap.error,
      });
    }
  }
}

function detectBaseUrl(): string {
  const scripts = document.querySelectorAll<HTMLScriptElement>("script[src]");
  for (const s of Array.from(scripts).reverse()) {
    const src = s.src;
    if (src && /spidey-grab(?:\.js|\/inject\.js)/.test(src)) {
      try {
        const u = new URL(src);
        return `${u.origin}/`;
      } catch {
        // ignore
      }
    }
  }
  // fallback: same origin as the page (only useful if the user is serving the bundle themselves)
  return `${location.origin}/`;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
