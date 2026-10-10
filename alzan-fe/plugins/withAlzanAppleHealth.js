const fs = require('fs');
const path = require('path');

const { withDangerousMod, withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const MODULE_FILES = ['AlzanAppleHealth.swift', 'AlzanAppleHealthSleepSessionGrouper.swift', 'AlzanAppleHealthBridge.m'];
const HEALTH_SHARE_USAGE =
  'Permite a Alzan leer tus entrenamientos, sueño y métricas de salud para sincronizarlos con tu progreso.';
const REACT_BRIDGE_IMPORT = '#import <React/RCTBridgeModule.h>';

function copyModuleFiles(platformProjectRoot, projectName) {
  const templateDir = path.join(__dirname, 'alzan-apple-health');
  const targetDir = path.join(platformProjectRoot, projectName);

  fs.mkdirSync(targetDir, { recursive: true });

  for (const fileName of MODULE_FILES) {
    fs.copyFileSync(path.join(templateDir, fileName), path.join(targetDir, fileName));
  }

  const bridgingHeaderName = `${projectName}-Bridging-Header.h`;
  const bridgingHeaderPath = path.join(targetDir, bridgingHeaderName);
  const defaultHeaderPath = path.join(templateDir, 'AlzanHealth-Bridging-Header.h');
  const existing = fs.existsSync(bridgingHeaderPath)
    ? fs.readFileSync(bridgingHeaderPath, 'utf8')
    : fs.readFileSync(defaultHeaderPath, 'utf8');

  if (existing.includes(REACT_BRIDGE_IMPORT)) {
    fs.writeFileSync(bridgingHeaderPath, existing);
    return;
  }

  fs.writeFileSync(bridgingHeaderPath, `${existing.trimEnd()}\n${REACT_BRIDGE_IMPORT}\n`);
}

function addSourceFileIfMissing(project, projectName, fileName, targetUuid, groupUuid) {
  const filePath = `${projectName}/${fileName}`;
  if (project.hasFile(filePath)) {
    return;
  }
  project.addSourceFile(filePath, { target: targetUuid }, groupUuid);
}

function addFrameworkIfMissing(project, frameworkName, targetUuid) {
  const frameworkPath = `System/Library/Frameworks/${frameworkName}`;
  if (project.hasFile(frameworkPath)) {
    return;
  }
  project.addFramework(frameworkName, { target: targetUuid });
}

function ensureSwiftBuildSettings(project, projectName) {
  const configurations = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    if (key.endsWith('_comment')) {
      continue;
    }

    const buildSettings = configurations[key].buildSettings;
    if (!buildSettings?.PRODUCT_BUNDLE_IDENTIFIER) {
      continue;
    }

    buildSettings.SWIFT_VERSION = buildSettings.SWIFT_VERSION ?? '5.0';
    buildSettings.SWIFT_OBJC_BRIDGING_HEADER =
      buildSettings.SWIFT_OBJC_BRIDGING_HEADER ?? `"${projectName}/${projectName}-Bridging-Header.h"`;
  }
}

function findAppGroupKey(project, projectName) {
  const namedGroupKey = project.findPBXGroupKey({ name: projectName });
  if (namedGroupKey) {
    return namedGroupKey;
  }

  const groups = project.hash.project.objects.PBXGroup;
  for (const key of Object.keys(groups)) {
    if (key.endsWith('_comment')) {
      continue;
    }

    const group = groups[key];
    const childComments = (group.children ?? []).map(child => child.comment);
    if (childComments.includes('AppDelegate.swift') && childComments.includes('Info.plist')) {
      return key;
    }
  }

  return null;
}

const withAlzanAppleHealth = config => {
  config = withInfoPlist(config, modConfig => {
    modConfig.modResults.NSHealthShareUsageDescription =
      modConfig.modResults.NSHealthShareUsageDescription ?? HEALTH_SHARE_USAGE;
    return modConfig;
  });

  config = withEntitlementsPlist(config, modConfig => {
    modConfig.modResults['com.apple.developer.healthkit'] = true;
    return modConfig;
  });

  config = withDangerousMod(config, [
    'ios',
    modConfig => {
      copyModuleFiles(modConfig.modRequest.platformProjectRoot, modConfig.modRequest.projectName);
      return modConfig;
    },
  ]);

  config = withXcodeProject(config, modConfig => {
    const project = modConfig.modResults;
    const projectName = modConfig.modRequest.projectName;
    const targetUuid = project.getFirstTarget().uuid;
    const appGroupKey = findAppGroupKey(project, projectName);

    if (!appGroupKey) {
      throw new Error(`Unable to find the main iOS project group for AlzanAppleHealth.`);
    }

    for (const fileName of MODULE_FILES) {
      addSourceFileIfMissing(project, projectName, fileName, targetUuid, appGroupKey);
    }

    addFrameworkIfMissing(project, 'HealthKit.framework', targetUuid);
    addFrameworkIfMissing(project, 'CoreLocation.framework', targetUuid);
    ensureSwiftBuildSettings(project, projectName);

    return modConfig;
  });

  return config;
};

module.exports = withAlzanAppleHealth;
