const fs = require('fs');
const path = require('path');

const { withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const MODULE_FILES = ['AlzanAppleReminders.swift', 'AlzanAppleRemindersBridge.m'];
const REMINDERS_USAGE = 'Permite a Alzan crear tu lista de la compra en Recordatorios.';
const REACT_BRIDGE_IMPORT = '#import <React/RCTBridgeModule.h>';

function copyModuleFiles(platformProjectRoot, projectName) {
  const templateDir = path.join(__dirname, 'alzan-reminders');
  const targetDir = path.join(platformProjectRoot, projectName);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const fileName of MODULE_FILES) {
    fs.copyFileSync(path.join(templateDir, fileName), path.join(targetDir, fileName));
  }

  const bridgingHeaderPath = path.join(targetDir, `${projectName}-Bridging-Header.h`);
  const existing = fs.existsSync(bridgingHeaderPath) ? fs.readFileSync(bridgingHeaderPath, 'utf8') : '';
  if (!existing.includes(REACT_BRIDGE_IMPORT)) {
    fs.writeFileSync(bridgingHeaderPath, `${existing.trimEnd()}\n${REACT_BRIDGE_IMPORT}\n`);
  }
}

function addSourceFileIfMissing(project, projectName, fileName, targetUuid, groupUuid) {
  const filePath = `${projectName}/${fileName}`;
  if (!project.hasFile(filePath)) {
    project.addSourceFile(filePath, { target: targetUuid }, groupUuid);
  }
}

function findAppGroupKey(project, projectName) {
  const namedGroupKey = project.findPBXGroupKey({ name: projectName });
  if (namedGroupKey) return namedGroupKey;

  const groups = project.hash.project.objects.PBXGroup;
  for (const key of Object.keys(groups)) {
    if (key.endsWith('_comment')) continue;
    const childComments = (groups[key].children ?? []).map(child => child.comment);
    if (childComments.includes('AppDelegate.swift') && childComments.includes('Info.plist')) return key;
  }

  return null;
}

function ensureSwiftBuildSettings(project, projectName) {
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    if (key.endsWith('_comment')) continue;
    const buildSettings = configurations[key].buildSettings;
    if (!buildSettings?.PRODUCT_BUNDLE_IDENTIFIER) continue;
    buildSettings.SWIFT_VERSION = buildSettings.SWIFT_VERSION ?? '5.0';
    buildSettings.SWIFT_OBJC_BRIDGING_HEADER =
      buildSettings.SWIFT_OBJC_BRIDGING_HEADER ?? `"${projectName}/${projectName}-Bridging-Header.h"`;
  }
}

const withAlzanAppleReminders = config => {
  config = withInfoPlist(config, modConfig => {
    modConfig.modResults.NSRemindersUsageDescription =
      modConfig.modResults.NSRemindersUsageDescription ?? REMINDERS_USAGE;
    modConfig.modResults.NSRemindersFullAccessUsageDescription =
      modConfig.modResults.NSRemindersFullAccessUsageDescription ?? REMINDERS_USAGE;
    return modConfig;
  });

  config = withDangerousMod(config, [
    'ios',
    modConfig => {
      copyModuleFiles(modConfig.modRequest.platformProjectRoot, modConfig.modRequest.projectName);
      return modConfig;
    },
  ]);

  return withXcodeProject(config, modConfig => {
    const project = modConfig.modResults;
    const projectName = modConfig.modRequest.projectName;
    const targetUuid = project.getFirstTarget().uuid;
    const appGroupKey = findAppGroupKey(project, projectName);
    if (!appGroupKey) throw new Error('Unable to find the main iOS project group for AlzanAppleReminders.');

    for (const fileName of MODULE_FILES) {
      addSourceFileIfMissing(project, projectName, fileName, targetUuid, appGroupKey);
    }
    ensureSwiftBuildSettings(project, projectName);
    return modConfig;
  });
};

module.exports = withAlzanAppleReminders;
