import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import packageJson from "../package.json" with { type: "json" };

const root = process.cwd();
const distDir = path.join(root, "dist");
const releaseDir = path.join(root, "release");
const packageName = "copytex-plus";
const version = packageJson.version;
const outputPath = path.join(releaseDir, `${packageName}-v${version}.zip`);

const files = {};

async function addDirectory(directory, archivePrefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const archivePath = `${archivePrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await addDirectory(absolute, archivePath);
    } else if (entry.isFile()) {
      files[archivePath] = new Uint8Array(await readFile(absolute));
    }
  }
}

await addDirectory(distDir, packageName);
files[`${packageName}/INSTALL.txt`] = strToU8(
  [
    "CopyTeX+ local install",
    "",
    "1. Unzip this archive.",
    "2. Open chrome://extensions or edge://extensions.",
    "3. Enable Developer mode.",
    "4. Click Load unpacked.",
    "5. Select the unzipped copytex-plus folder that contains manifest.json.",
    ""
  ].join("\n")
);

await mkdir(releaseDir, { recursive: true });
await writeFile(outputPath, zipSync(files, { level: 9 }));

console.log(`Created ${path.relative(root, outputPath)}`);
