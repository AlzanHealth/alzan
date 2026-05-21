const fs = require('fs');
const path = require('path');

const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const MODULE_FILES = ['AlzanHealthConnectModule.kt', 'AlzanHealthConnectPackage.kt', 'PermissionsRationaleActivity.kt'];
const HEALTH_CONNECT_DEPENDENCY = 'implementation("androidx.health.connect:connect-client:1.1.0")';
const COROUTINES_DEPENDENCY = 'implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")';
const PACKAGE_IMPORT = 'import com.alzanhealth.app.AlzanHealthConnectPackage';
const PACKAGE_REGISTRATION = 'add(AlzanHealthConnectPackage())';
const HEALTH_CONNECT_PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';

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

function ensureHealthConnectPackageQuery(manifest) {
  const queries = manifest.queries ?? [];
  const query = queries[0] ?? {};
  query.package = query.package ?? [];

  const hasHealthConnectPackage = query.package.some(
    item => item?.$?.['android:name'] === HEALTH_CONNECT_PROVIDER_PACKAGE,
  );
  if (!hasHealthConnectPackage) {
    query.package.push({ $: { 'android:name': HEALTH_CONNECT_PROVIDER_PACKAGE } });
  }

  if (queries.length === 0) queries.push(query);
  manifest.queries = queries;
}

function ensureRationaleActivity(application) {
  application.activity = application.activity ?? [];
  const hasRationaleActivity = application.activity.some(
    activity => activity?.$?.['android:name'] === '.PermissionsRationaleActivity',
  );
  if (!hasRationaleActivity) {
    application.activity.push({
      $: {
        'android:name': '.PermissionsRationaleActivity',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
        },
      ],
    });
  }

  application['activity-alias'] = application['activity-alias'] ?? [];
  const hasRationaleAlias = application['activity-alias'].some(
    activityAlias => activityAlias?.$?.['android:name'] === 'ViewPermissionUsageActivity',
  );
  if (!hasRationaleAlias) {
    application['activity-alias'].push({
      $: {
        'android:name': 'ViewPermissionUsageActivity',
        'android:exported': 'true',
        'android:targetActivity': '.PermissionsRationaleActivity',
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        },
      ],
    });
  }
}

const withAlzanHealthConnect = config => {
  config = withAndroidManifest(config, modConfig => {
    ensureHealthConnectPackageQuery(modConfig.modResults.manifest);
    for (const permission of HEALTH_CONNECT_PERMISSIONS) {
      AndroidConfig.Permissions.addPermission(modConfig.modResults, permission);
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    ensureRationaleActivity(application);
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
