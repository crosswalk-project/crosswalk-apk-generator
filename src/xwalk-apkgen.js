/*jslint node: true*/
'use strict';

/* Copyright (c) 2014 Intel Corporation. All rights reserved.
 * Use of this source code is governed by an Apache v2 license that can be
 * found in the LICENSE-APACHE-V2 file. */

var start = new Date();

var fs = require('fs');
var path = require('path');

var nconf = require('nconf');
var Q = require('q');
var _ = require('lodash');

var CommandRunner = require('./command-runner');
var Locations = require('./locations');
var Env = require('./env');
var App = require('./app');
var genericUsage = require('./usage');
var logger = require('./console-logger')();

// show usage message
var usage = function (cliOpts) {
  var msg = 'Generate a Crosswalk apk from an HTML5 app\nOptions ' +
            'can be set with environment variables, using command ' +
            'line options, or via JSON config files (see General ' +
            'options below).';

  logger.log(genericUsage(msg, cliOpts));
};

/*
 * parse environment variables, then command line options,
 * then properties from JSON files set with --app-config and/or
 * --env-config; environment variables have precedence over properties
 * set on the command line, which in turn take precedence over file
 * properties
 *
 * note that although were using nconf to parse the cli options,
 * the actual validation of the properties for App and Env occurs in
 * those classes; also note that the "section" property is not used
 * by nconf, only internally by this script
 *
 * the default is from nconf, but defaultDescription is used in some
 * cases to describe a default value which is going to be derived
 * from the environment (e.g. the default keystore is the one
 * in whichever xwalk-android you downloaded and is not known until
 * processing starts)
 */
var cliOpts = {
  // runtime
  'outDir': {
    alias: 'o',
    default: 'build',
    describe: 'output directory for apk and other build files'
  },

  // config files; these work as shortcuts for defining app,
  // env or extension configuration
  'app-config': {
    describe: 'configuration JSON file for (app) options'
  },

  'env-config': {
    describe: 'configuration JSON file for (env) options'
  },

  'ext-config': {
    describe: 'configuration JSON file for Crosswalk extensions'
  },

  // env required (if no env-config file)
  'androidSDKDir': {
    alias: 'a',
    describe: 'root directory of the Android SDK installation',
    section: 'Environment (env)'
  },

  'xwalkAndroidDir': {
    alias: 'x',
    describe: 'xwalk_app_template directory inside an ' +
              'xwalk-android download',
    section: 'Environment (env)'
  },

  // env optional
  'androidAPILevel': {
    alias: 'android-api-level',
    describe: 'level of the Android API to use (e.g. 18, 19)',
    section: 'Environment (env)',
    default: Env.CONFIG_DEFAULTS.androidAPILevel
  },

  'keystore': {
    alias: 'keystore-path',
    describe: 'path to the JKS keystore to use for apk signing',
    section: 'Environment (env)',
    defaultDescription: 'debug keystore in xwalk-android download'
  },

  'keystoreAlias': {
    alias: 'keystore-alias',
    describe: 'alias for the signing key entry in the keystore',
    section: 'Environment (env)',
    default: Env.CONFIG_DEFAULTS.keystoreAlias
  },

  'keystorePassword': {
    alias: 'keystore-passcode',
    describe: 'password for the signing key entry in the keystore',
    section: 'Environment (env)',
    default: Env.CONFIG_DEFAULTS.keystorePassword
  },

  'arch': {
    describe: 'Architecture to build for (x86 or arm), undefined for shared',
    section: 'Environment (env)'
  },

  // app required (if no app-config file)
  'appRoot': {
    alias: 'app-root',
    describe: 'root directory containing application files',
    section: 'Application (app)'
  },

  'appLocalPath': {
    alias: 'app-local-path',
    describe: 'path from app root to main HTML file for app',
    section: 'Application (app)'
  },

  'appUrl': {
    alias: 'app-url',
    describe: 'URL of main HTML page for app',
    section: 'Application (app)'
  },

  'name': {
    describe: 'application name',
    section: 'Application (app)'
  },

  'pkg': {
    alias: 'package',
    describe: 'package for application Java classes',
    section: 'Application (app)'
  },

  'version': {
    describe: 'application version string (e.g. "1.0.0")',
    section: 'Application (app)'
  },

  // app optional
  'orientation': {
    describe: 'orientation for the application (e.g. "portrait", "landscape")',
    section: 'Application (app)'
  },

  'icon': {
    describe: 'path to the icon file for the application',
    section: 'Application (app)',
    defaultDescription: 'Crosswalk default icon'
  },

  'fullscreen': {
    describe: 'run app in fullscreen on the device',
    section: 'Application (app)',
    default: App.CONFIG_DEFAULTS.fullscreen
  },

  'remoteDebugging': {
    alias: 'enable-remote-debugging',
    describe: 'add code to switch on debugging for the app on the device',
    section: 'Application (app)',
    default: App.CONFIG_DEFAULTS.remoteDebugging
  },

  'javaSrcDirs': {
    describe: 'comma-separated list of Java source directories to compile',
    section: 'Application (app)',
    default: App.CONFIG_DEFAULTS.javaSrcDirs
  },

  'jars': {
    describe: 'comma-separated list of jars to bundle into the apk file',
    section: 'Application (app)',
    default: App.CONFIG_DEFAULTS.jars
  },

  // help
  'help': {
    alias: 'h',
    describe: 'show this help message and exit'
  }
};

nconf.env().argv(cliOpts);

if (nconf.get('help')) {
  usage(cliOpts);
  process.exit(0);
}

// application config
var configFile = nconf.get('app-config');

if (configFile) {
  nconf.file('appConfig', {file: configFile});
}

// env config
configFile = nconf.get('env-config');

if (configFile) {
  nconf.file('envConfig', {file: configFile});
}

// if ext-config is set, read the JSON file in
configFile = nconf.get('ext-config');

var extensions = null;
if (configFile) {
  extensions = JSON.parse(fs.readFileSync(configFile));

  // resolve all jsapi paths wrt the location of the extensions
  // config JSON file
  _.each(extensions, function (ext) {
    ext.jsapi = path.join(path.dirname(configFile), ext.jsapi);
  });
}

// we need an absolute location for outDir to avoid errors when
// running Ant
var outDir = path.resolve(nconf.get('outDir'));
/*** end of property parsing ***/

// get the properties for App
var appConfig = {};
_.each(App.CONFIG_DEFAULTS, function (value, key) {
  appConfig[key] = nconf.get(key);
});

// set the extensions key for appConfig
appConfig.extensions = extensions;

// get properties for Env
var envConfig = {};
_.each(Env.CONFIG_DEFAULTS, function (value, key) {
  envConfig[key] = nconf.get(key);
});

// START
logger.log('\n*** STARTING BUILD');

var commandRunner = CommandRunner();

logger.log('\n*** CHECKING ENVIRONMENT...');

// App and Env are created asynchronously in parallel
Q.all([
  App(appConfig),
  Env(envConfig, {commandRunner: commandRunner})
])
.then(
  function (objects) {
    var app = objects[0];
    var env = objects[1];

    var locations = Locations(app, env, outDir);

    // configuration done
    logger.log('\n*** APPLICATION:');
    logger.logPublicProperties(app);
    logger.log('\n*** ENVIRONMENT:');
    logger.logPublicProperties(env);
    logger.log('\n*** LOCATIONS:');
    logger.logPublicProperties(locations);

    // make the apk for this environment
    logger.log('\n*** BUILDING APPLICATION IN ' + outDir);
    logger.spinStart();

    return env.build(app, locations);
  }
)
.done(
  function (finalApk) {
    logger.spinStop();
    var end = new Date();
    var msecs = end.getTime() - start.getTime();
    var secs = (msecs / 1000);
    logger.log('\n*** DONE\n*** BUILD TIME: ' + secs + ' seconds\n' +
                '*** Final output apk:\n    ' + finalApk);
  },

  function (e) {
    logger.spinStop();
    logger.error('!!!!!!! error occurred');
    logger.log();
    logger.error(e.stack);
    logger.log();
    logger.log('show options by calling this script with the --help option');
    process.exit(1);
  }
);
