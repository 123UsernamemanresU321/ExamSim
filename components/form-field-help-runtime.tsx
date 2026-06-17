"use client";

import { useEffect } from "react";
import { buildFieldHelp } from "@/lib/form-field-help";

const CONTROL_SELECTOR = "input:not([type='hidden']), textarea, select";

export function FormFieldHelpRuntime() {
  useEffect(() => {
    let observer: MutationObserver | null = null;
    let timer: number | null = null;
    const applyHelp = () => {
      for (const control of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(CONTROL_SELECTOR)) {
        if (control.dataset.fieldHelpDisabled === "true") continue;
        if (control.title && control.dataset.fieldHelp) continue;
        const help = buildFieldHelp({
          name: control.getAttribute("name"),
          type: control instanceof HTMLInputElement ? control.type : null,
          placeholder: "placeholder" in control ? control.getAttribute("placeholder") : null,
          label: findControlLabel(control),
          tagName: control.tagName,
        });
        if (!control.title) control.title = help;
        control.dataset.fieldHelp = help;
      }
    };

    const start = () => {
      timer = window.setTimeout(() => {
        applyHelp();
        observer = new MutationObserver(applyHelp);
        observer.observe(document.body, { childList: true, subtree: true });
      }, 250);
    };

    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start, { once: true });
    }

    return () => {
      window.removeEventListener("load", start);
      if (timer !== null) window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, []);

  return null;
}

function findControlLabel(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const ariaLabel = control.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const id = control.id;
  if (id) {
    const explicit = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (explicit?.textContent) return explicit.textContent;
  }

  const wrappingLabel = control.closest("label");
  if (wrappingLabel?.textContent) return wrappingLabel.textContent;

  const nearbyLabel = control.parentElement?.querySelector("label");
  if (nearbyLabel?.textContent) return nearbyLabel.textContent;

  return "";
}
