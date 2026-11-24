import { describe, expect, it } from "vitest";
import loader from "@/lib/cloudinary-loader";

describe("cdn image loader", () => {
  it("adds resize + auto format for a Cloudinary upload URL", () => {
    const out = loader({ src: "https://res.cloudinary.com/demo/image/upload/v1791736215/clubs/abc/x.png", width: 640 });
    expect(out).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_640,c_limit,dpr_1.0/v1791736215/clubs/abc/x.png");
  });
  it("does not transform twice", () => {
    const src = "https://res.cloudinary.com/demo/image/upload/f_auto,w_300/v1/clubs/abc/x.png";
    expect(loader({ src, width: 640 })).toBe(src);
  });
  it("uses explicit quality", () => {
    expect(loader({ src: "https://res.cloudinary.com/demo/image/upload/v1/a.png", width: 100, quality: 70 })).toContain("q_70");
  });
  it("sets width on Unsplash", () => {
    const out = new URL(loader({ src: "https://images.unsplash.com/photo-1?ixid=1", width: 800 }));
    expect(out.searchParams.get("w")).toBe("800");
    expect(out.searchParams.get("auto")).toBe("format");
  });
  it("leaves local assets untouched", () => {
    expect(loader({ src: "/images/hero.jpg", width: 800 })).toBe("/images/hero.jpg");
  });
});
