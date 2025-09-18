const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const distDir = path.join(process.cwd(), "dist");
const zipPath = path.join(process.cwd(), "dialog-clicker.zip");

// Check dist exists
if (!fs.existsSync(distDir)) {
  console.error("❌ dist/ folder not found. Run `npm run build` first!");
  process.exit(1);
}

// Create output stream
const output = fs.createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`✅ Zipped ${distDir} → ${zipPath} (${archive.pointer()} bytes)`);
});

archive.on("error", (err) => {
  console.error("❌ Failed to zip:", err);
  process.exit(1);
});

archive.pipe(output);
archive.directory(distDir, false); // add contents of dist/ to root of zip
archive.finalize();
