import { describe, expect, it } from "vitest";

import { formatBytes, getDataUrlByteSize } from "./image-utils";

describe("image-utils", () => {
    it("formats byte sizes with readable units", () => {
        expect(formatBytes(0)).toBe("");
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    });

    it("calculates base64 data url byte size", () => {
        expect(getDataUrlByteSize("data:text/plain;base64,SGVsbG8=")).toBe(5);
        expect(getDataUrlByteSize("data:text/plain;base64,")).toBe(0);
    });
});
