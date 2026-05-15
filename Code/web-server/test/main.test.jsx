import { beforeEach, describe, expect, it, vi } from "vitest";

const render = vi.fn();

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({ render })),
}));

describe("main entry", () => {
  beforeEach(() => {
    vi.resetModules();
    render.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("mounts the app into #root", async () => {
    const { createRoot } = await import("react-dom/client");
    await import("../src/main.jsx");
    expect(createRoot).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });
});
