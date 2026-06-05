import { describe, expect, it, beforeEach, vi } from "vitest";
import {
	clearHomeCatalogScroll,
	hasHomeCatalogScrollPending,
	peekHomeCatalogScroll,
	restoreHomeCatalogScrollIfPending,
	saveHomeCatalogScroll,
	subscribeHomeCatalogScrollSave,
} from "./homeScrollRestore";

describe("homeScrollRestore", () => {
	beforeEach(() => {
		clearHomeCatalogScroll();
		vi.restoreAllMocks();
		Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
		Object.defineProperty(document.documentElement, "scrollHeight", {
			value: 3000,
			configurable: true,
		});
		Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
	});

	it("save, peek, and restore scrollY", () => {
		Object.defineProperty(window, "scrollY", { value: 420, configurable: true, writable: true });
		saveHomeCatalogScroll();
		expect(peekHomeCatalogScroll()).toBe(420);
		expect(hasHomeCatalogScrollPending()).toBe(true);
		expect(sessionStorage.getItem("homeCatalogScroll")).toBe("420");

		Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
		const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {
			Object.defineProperty(window, "scrollY", { value: 420, configurable: true, writable: true });
		});

		expect(restoreHomeCatalogScrollIfPending()).toBe(true);
		expect(scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: "auto" });
		expect(hasHomeCatalogScrollPending()).toBe(false);
	});

	it("retries when the page is not tall enough yet", () => {
		sessionStorage.setItem("homeCatalogScroll", "1500");
		Object.defineProperty(document.documentElement, "scrollHeight", {
			value: 1000,
			configurable: true,
		});

		expect(restoreHomeCatalogScrollIfPending()).toBe(false);
		expect(hasHomeCatalogScrollPending()).toBe(true);
	});

	it("flushes on scroll end", () => {
		vi.useFakeTimers();
		const unsub = subscribeHomeCatalogScrollSave();

		Object.defineProperty(window, "scrollY", { value: 777, configurable: true, writable: true });
		window.dispatchEvent(new Event("scrollend"));

		expect(peekHomeCatalogScroll()).toBe(777);
		unsub();
		vi.useRealTimers();
	});
});
