// electron-builder afterPack hook: copies the staged Next.js server (desktop/server, see
// prepare-server.mjs) into the app's resources folder. Done here rather than with
// extraResources because electron-builder never copies node_modules folders that way.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const resources =
    electronPlatformName === "darwin" || electronPlatformName === "mas"
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");
  const from = path.join(packager.projectDir, "server");
  if (!fs.existsSync(path.join(from, "server.js"))) throw new Error('desktop/server is missing: run "npm run server" first.');
  const to = path.join(resources, "server");
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
};
