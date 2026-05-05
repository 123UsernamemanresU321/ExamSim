import { describe, expect, it } from "vitest";
import { summarizeModerationEvents } from "@/lib/moderation";

describe("summarizeModerationEvents", () => {
  it("aggregates browser-mode evidence without accusing the student", () => {
    const summary = summarizeModerationEvents(
      [
        {
          event_type: "fullscreen.exit",
          server_received_at: "2026-05-05T08:00:00.000Z",
          payload_json: {},
        },
        {
          event_type: "visibility.hidden",
          server_received_at: "2026-05-05T08:01:00.000Z",
          payload_json: {},
        },
        {
          event_type: "visibility.visible",
          server_received_at: "2026-05-05T08:01:20.000Z",
          payload_json: {},
        },
        {
          event_type: "window.blur",
          server_received_at: "2026-05-05T08:02:00.000Z",
          payload_json: {},
        },
        {
          event_type: "reconnect",
          server_received_at: "2026-05-05T08:03:00.000Z",
          payload_json: {},
        },
      ],
      [],
    );

    expect(summary.fullscreenExitCount).toBe(1);
    expect(summary.visibilityHiddenCount).toBe(1);
    expect(summary.estimatedHiddenSeconds).toBe(20);
    expect(summary.windowBlurCount).toBe(1);
    expect(summary.reconnectCount).toBe(1);
    expect(summary.severity).toBe("medium");
    expect(summary.language).toContain("Moderation signal");
  });
});
