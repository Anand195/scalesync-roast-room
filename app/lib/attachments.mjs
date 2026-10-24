import fs from "node:fs";
import path from "node:path";

const EXTENSIONS = new Set([".pdf", ".md", ".markdown", ".txt", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const IMAGES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;
const isMedia = (b) => b.toString("ascii", 0, 3) === "ID3" || b.toString("ascii", 0, 4) === "OggS" ||
  b.toString("ascii", 0, 4) === "fLaC" || b.toString("ascii", 0, 4) === "MThd" ||
  (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE") ||
  b.toString("ascii", 4, 8) === "ftyp" ||
  (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) ||
  (b[0] === 0xff && [0xfb, 0xf3, 0xf2].includes(b[1]));

export function saveAttachments(sessionDir, files = []) {
  if (!Array.isArray(files) || files.length > 5) throw new Error("Attach up to five files.");
  let total = 0;
  const prepared = files.map((file, index) => {
    if (!file || typeof file.name !== "string" || typeof file.data !== "string") throw new Error("Invalid attachment.");
    const ext = path.extname(file.name).toLowerCase();
    if (/^(audio|video)\//i.test(file.type || "") || /\.(mp3|wav|m4a|mp4|mov|webm|avi|ogg)$/i.test(file.name)) {
      throw new Error("Audio and video files are not accepted.");
    }
    if (!EXTENSIONS.has(ext)) throw new Error(`Unsupported file type: ${ext || "unknown"}. Use PDF, Markdown, text, CSV, JSON, or an image.`);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) || file.data.length % 4 !== 0) throw new Error("Invalid attachment encoding.");
    const bytes = Buffer.from(file.data, "base64");
    if (isMedia(bytes)) throw new Error("Audio and video files are not accepted.");
    if (!bytes.length || bytes.length > MAX_FILE) throw new Error("Each file must be between 1 byte and 10 MB.");
    total += bytes.length;
    if (total > MAX_TOTAL) throw new Error("Attachments must total 20 MB or less.");
    if (ext === ".pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("The PDF file is invalid.");
    if (ext === ".png" && !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("The PNG file is invalid.");
    if ([".jpg", ".jpeg"].includes(ext) && !(bytes[0] === 0xff && bytes[1] === 0xd8)) throw new Error("The JPEG file is invalid.");
    if (ext === ".gif" && !bytes.subarray(0, 3).equals(Buffer.from("GIF"))) throw new Error("The GIF file is invalid.");
    if (ext === ".webp" && !(bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")) throw new Error("The WebP file is invalid.");
    if (![".pdf", ...IMAGES].includes(ext) && bytes.includes(0)) throw new Error("Text attachments must be plain text.");
    const basename = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || `file${ext}`;
    return { name: file.name.slice(0, 120), fileName: `${index + 1}-${basename}`, bytes, kind: IMAGES.has(ext) ? "image" : ext === ".pdf" ? "pdf" : "text" };
  });
  if (!prepared.length) return [];
  const dir = path.join(sessionDir, "attachments");
  fs.mkdirSync(dir, { recursive: true });
  return prepared.map(({ name, fileName, bytes, kind }) => {
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, bytes, { flag: "wx", mode: 0o600 });
    return { name, path: filePath, kind, bytes: bytes.length };
  });
}
