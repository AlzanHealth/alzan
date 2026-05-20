const fs = require('fs');
const path = require('path');

const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const MODULE_FILES = ['AlzanHealthConnectModule.kt', 'AlzanHealthConnectPackage.kt'];
const HEALTH_CONNECT_DEPENDENCY = 'implementation("androidx.health.connect:connect-client:1.1.0")';
const COROUTINES_DEPENDENCY = 'implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")';
const PACKAGE_IMPORT = 'import com.alzanhealth.app.AlzanHealthConnectPackage';
const PACKAGE_REGISTRATION = 'add(AlzanHealthConnectPackage())';

const HEALTH_CONNECT_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_WEIGHT',
];

function copyModuleFiles(projectRoot) {
  const templateDir = path.join(__dirname, 'alzan-health-connect');
  const targetDir = path.join(projectRoot, 'app/src/main/java/com/alzanhealth/app');
  fs.mkdirSync(targetDir, { recursive: true });
  for (const fileName of MODULE_FILES) {
    fs.copyFileSync(path.join(templateDir, fileName), path.join(targetDir, fileName));
  }
}

function patchMainApplication(projectRoot) {
  const filePath = path.join(projectRoot, 'app/src/main/java/com/alzanhealth/app/MainApplication.kt');
  if (!fs.existsSync(filePath)) return;
  let source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes(PACKAGE_IMPORT)) {
    source = source.replace(
      'import com.facebook.react.ReactPackage\n',
      `import com.facebook.react.ReactPackage\n${PACKAGE_IMPORT}\n`,
    );
  }
  if (!source.includes(PACKAGE_REGISTRATION)) {
    if (source.includes('// add(MyReactNativePackage())')) {
      source = source.replace(
        '// add(MyReactNativePackage())',
        `// add(MyReactNativePackage())\n              ${PACKAGE_REGISTRATION}`,
      );
    } else {
      source = source.replace(
        /PackageList\(this\)\.packages\.apply \{\n/,
        match => `${match}              ${PACKAGE_REGISTRATION}\n`,
      );
    }
  }
  fs.writeFileSync(filePath, source);
}

function addDependency(buildGradle, dependency) {
  if (buildGradle.includes(dependency)) return buildGradle;
  return buildGradle.replace('dependencies {', `dependencies {\n    ${dependency}`);
}

const withAlzanHealthConnect = config => {
  config = withAndroidManifest(config, modConfig => {
    for (const permission of HEALTH_CONNECT_PERMISSIONS) {
      AndroidConfig.Permissions.addPermission(modConfig.modResults, permission);
    }
    return modConfig;
  });

  config = withAppBuildGradle(config, modConfig => {
    if (modConfig.modResults.language !== 'groovy') return modConfig;
    let contents = modConfig.modResults.contents;
    contents = addDependency(contents, HEALTH_CONNECT_DEPENDENCY);
    contents = addDependency(contents, COROUTINES_DEPENDENCY);
    modConfig.modResults.contents = contents;
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    modConfig => {
      copyModuleFiles(modConfig.modRequest.platformProjectRoot);
      patchMainApplication(modConfig.modRequest.platformProjectRoot);
      return modConfig;
    },
  ]);

  return config;
};

module.exports = withAlzanHealthConnect;
