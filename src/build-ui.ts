import { existsSync, mkdirSync, cpSync, copyFileSync } from "fs";
import { dirname, join } from "path";

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function copyFileSafe(src: string, dest: string) {
  if (!existsSync(src)) throw new Error(`missing required UI asset: ${src}`);
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
}

function copyDirSafe(src: string, dest: string) {
  if (!existsSync(src)) throw new Error(`missing required UI directory: ${src}`);
  ensureDir(dest);
  cpSync(src, dest, { recursive: true });
}

function main() {
  const out = "public";
  ensureDir(out);
  copyFileSafe("design/alpha-pon.html", join(out, "index.html"));
  copyDirSafe("design/app", join(out, "app"));
  copyDirSafe("design/frames", join(out, "frames"));
  copyFileSafe("design/tweaks-panel.jsx", join(out, "tweaks-panel.jsx"));
  console.log("static UI built to public/");
}

main();
