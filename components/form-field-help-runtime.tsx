"use client";

import { useEffect } from "react";
import { buildFieldHelp } from "@/lib/form-field-help";

const CONTROL_SELECTOR = "input:not([type='hidden']), textarea, select";

export function FormFieldHelpRuntime() {
  useEffect(() => {
    const applyHelp = (control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
      if (control.dataset.fieldHelpDisabled === "true") return;
      if (control.title && control.dataset.fieldHelp) return;
      const help = buildFieldHelp({
        name: control.getAttribute("name"),
        type: control instanceof HTMLInputElement ? control.type : null,
        placeholder: "placeholder" in control ? control.getAttribute("placeholder") : null,
        label: findControlLabel(control),
        tagName: control.tagName,
      });
      if (!control.title) control.title = help;
      control.dataset.fieldHelp = help;
    };

    const applyFromEvent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.matches(CONTROL_SELECTOR)
        ? target
        : target.closest(CONTROL_SELECTOR);
      if (
        control instanceof HTMLInputElement
        || control instanceof HTMLTextAreaElement
        || control instanceof HTMLSelectElement
      ) {
        applyHelp(control);
      }
    };

    // Raw controls that do not use shared form components are enhanced lazily.
    // A full document scan can mutate React-owned inputs before route segments
    // finish hydrating, which causes title/data-field-help hydration warnings.
    document.addEventListener("focusin", applyFromEvent, true);
    document.addEventListener("pointerover", applyFromEvent, { capture: true, passive: true });
    document.addEventListener("touchstart", applyFromEvent, { capture: true, passive: true });

    return () => {
      document.removeEventListener("focusin", applyFromEvent, true);
      document.removeEventListener("pointerover", applyFromEvent, true);
      document.removeEventListener("touchstart", applyFromEvent, true);
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
