const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

// Recursive copy helper
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const file of fs.readdirSync(src)) {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log("Copied", file);
    }
  }
}

try {
  console.log("Compiling TypeScript...");
  const tscPath = path.join(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  execSync(`"${tscPath}"`, { stdio: "inherit" });

  console.log("Copying public assets...");
  const srcDir = path.join(__dirname, "..", "public");
  const outDir = path.join(__dirname, "..", "dist");
  copyRecursive(srcDir, outDir);

  console.log("✅ Build completed successfully!");
} catch (err) {
  console.error("❌ Build failed:", err);
  process.exit(1);
}
