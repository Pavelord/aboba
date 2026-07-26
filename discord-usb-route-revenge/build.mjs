import esbuild from "esbuild";
import { readFile, writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";

const outDir = "dist/UsbAudioRoute";
await mkdir(outDir, { recursive: true });

const vendettaPlugin = {
  name: "vendetta-globals",
  setup(build) {
    build.onResolve({ filter: /^@vendetta/ }, args => ({ path: args.path, namespace: "vendetta-globals" }));
    build.onLoad({ filter: /.*/, namespace: "vendetta-globals" }, args => {
      const globalPath = args.path.replace("@vendetta", "vendetta").replace(/\//g, ".");
      return { contents: `module.exports = ${globalPath};`, loader: "js" };
    });
  },
};

await esbuild.build({
  entryPoints: ["plugins/UsbAudioRoute/src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "plugin",
  outfile: `${outDir}/index.js`,
  plugins: [vendettaPlugin],
  footer: { js: "module.exports = plugin;" },
  treeShaking: true,
  minify: false,
});

const js = await readFile(`${outDir}/index.js`);
const manifest = JSON.parse(await readFile("plugins/UsbAudioRoute/manifest.json", "utf8"));
manifest.hash = createHash("sha256").update(js).digest("hex");
await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest));
console.log("Built UsbAudioRoute");
