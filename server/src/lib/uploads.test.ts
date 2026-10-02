import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseRange } from "./storage.js";
import { processImage, sniff } from "./uploads.js";

/** JPEG mit EXIF (Kamera, GPS) und Ausrichtung "90° gedreht". */
async function jpegWithExif(width = 300, height = 200) {
  const withGps = await sharp({ create: { width, height, channels: 3, background: "#884422" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam", Model: "X1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "47/1 22/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "8/1 32/1 0/1" },
    })
    .toBuffer();
  // Die Ausrichtung setzt sharp nur über withMetadata (behält das EXIF oben)
  return sharp(withGps).withMetadata({ orientation: 6 }).jpeg().toBuffer();
}

describe("Typerkennung", () => {
  it("erkennt erlaubte Formate an den ersten Bytes", async () => {
    const solid = sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } });
    expect(sniff(await solid.clone().jpeg().toBuffer())).toEqual({ kind: "image", mime: "image/jpeg" });
    expect(sniff(await solid.clone().png().toBuffer())).toEqual({ kind: "image", mime: "image/png" });
    expect(sniff(await solid.clone().webp().toBuffer())).toEqual({ kind: "image", mime: "image/webp" });
    expect(sniff(await solid.clone().gif().toBuffer())).toEqual({ kind: "image", mime: "image/gif" });
    expect(sniff(Buffer.from("%PDF-1.7\n%âãÏÓ"))).toEqual({ kind: "pdf", mime: "application/pdf" });
  });

  it("erkennt HEIC und lehnt Unbekanntes ab", () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic0000")]);
    expect(sniff(heic)).toEqual({ kind: "heic" });
    expect(sniff(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniff(Buffer.from("<html><script>"))).toBeNull();
    expect(sniff(Buffer.alloc(0))).toBeNull();
  });
});

describe("Bildverarbeitung", () => {
  it("entfernt EXIF/GPS und wendet die Ausrichtung an", async () => {
    const input = await jpegWithExif(300, 200);
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif?.includes(Buffer.from("TestCam"))).toBe(true);
    expect(inMeta.orientation).toBe(6);

    const out = await processImage(input, { maxEdge: 4096 });
    const meta = await sharp(out.full).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    // Orientation 6: Breite und Höhe sind vertauscht
    expect([out.width, out.height]).toEqual([200, 300]);
    expect((await sharp(out.thumb).metadata()).exif).toBeUndefined();
  });

  it("verkleinert auf die lange Kante, vergrössert aber nicht", async () => {
    const big = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#123" } }).png().toBuffer();
    const out = await processImage(big, { maxEdge: 1500 });
    expect([out.width, out.height]).toEqual([1500, 500]);
    const thumb = await sharp(out.thumb).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(480);

    const small = await processImage(await jpegWithExif(100, 50), { maxEdge: 4096 });
    expect(Math.max(small.width, small.height)).toBe(100);
  });

  it("lehnt kaputte Bilder ab", async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await expect(processImage(broken, { maxEdge: 4096 })).rejects.toThrow();
  });
});

describe("Byte-Bereiche", () => {
  it("versteht einfache Bereiche", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=0-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=1000-", 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
  });
});
