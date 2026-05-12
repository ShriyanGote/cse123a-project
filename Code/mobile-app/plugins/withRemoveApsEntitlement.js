const fs = require("fs");
const plist = require("@expo/plist").default;
const { withFinalizedMod, IOSConfig } = require("expo/config-plugins");

/**
 * Removes `aps-environment` after prebuild writes entitlements so physical-device
 * builds work with free/personal Apple Developer teams (no Push on the profile).
 * Scheduled/local notifications via expo-notifications still work without APNs.
 */
module.exports = function withRemoveApsEntitlement(config) {
  return withFinalizedMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config._internal?.projectRoot;
      if (!projectRoot) return config;

      const entitlementsPath =
        IOSConfig.Entitlements.getEntitlementsPath(projectRoot);
      if (!entitlementsPath || !fs.existsSync(entitlementsPath)) return config;

      const contents = await fs.promises.readFile(entitlementsPath, "utf8");
      const data = plist.parse(contents);
      if (!("aps-environment" in data)) return config;

      delete data["aps-environment"];
      await fs.promises.writeFile(entitlementsPath, plist.build(data));
      return config;
    },
  ]);
}
