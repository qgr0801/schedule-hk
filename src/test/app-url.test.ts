import { afterEach, describe, expect, it, vi } from "vitest";
import { staffPasswordSetupUrl } from "@/lib/app-url";

afterEach(() => vi.unstubAllEnvs());

describe("staffPasswordSetupUrl", () => {
  it.each([
    ["https://schedule.example.com/", "https://schedule.example.com/set-password"],
    ["http://localhost:5173", "http://localhost:5173/set-password"],
  ])("uses the configured origin %s", (origin, expected) => {
    vi.stubEnv("VITE_APP_URL", origin);
    expect(staffPasswordSetupUrl()).toBe(expected);
  });

  it.each([
    undefined,
    "http://schedule.example.com",
    "https://schedule.example.com/other",
    "https://user@schedule.example.com",
    "https://schedule.example.com/?redirect=other",
  ])("rejects missing or invalid site configuration %s", (origin) => {
    vi.stubEnv("VITE_APP_URL", origin);
    expect(staffPasswordSetupUrl).toThrow("VITE_APP_URL");
  });
});
