var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var api = require('./api');
var log = require('./log');
var virtualAppConfig = require('./virtual-app-config');
var debug = require('debug')('4front-cli:cli-init');
var inquirer = require('inquirer');

require('simple-errors');

// Initialization routine that runs before any CLI command
module.exports = function(program, options, callback) {
  _.defaults(options, {
    requireAuth: true,
    loadVirtualAppConfig: true,
    loadVirtualApp: true
  });

  var initTasks = [];

  initTasks.push(ensure4frontConfigExists);

  if (options.requireAuth === true) {
    initTasks.push(ensureProfileExists);
    initTasks.push(selectProfile);
    initTasks.push(checkForJwt);
    initTasks.push(promptForCredentials);
    initTasks.push(updateProfileConfig);
  }

  if (options.loadVirtualAppConfig === true) {
    initTasks.push(loadVirtualAppConfig);
  }

  if (options.loadVirtualAppConfig && options.loadVirtualApp) {
    initTasks.push(loadVirtualApp);
  }

  async.series(initTasks, callback);

  function ensureProfileExists(cb) {
    debug("prompt for profile");

    // If there is already at least one configured profile
    if (_.isEmpty(program.globalConfig.profiles) === false)
      return cb();

    // Run the initalization flow
    log.messageBox("No 4front instances have been configured. \n" +
    	"Please enter the URL of your instance:");

    debug("no configured profiles, prompt for one");
    inquirer.prompt([{
      type: "input",
      name: "platformUrl",
      message: "Platform URL:"
    }], function(answers) {
      // Make the new instance the default
      program.globalConfig.profiles = [{
        platformUrl: answers.platformUrl,
        name: 'default',
        default: true
      }];

      cb();
    });
  }

  // Prompt for which 4front profile to use
  function selectProfile(cb) {
    if (program.profile) {
      program.profile = _.find(program.globalConfig.profiles, {
        name: program.profile
      });
    }

    // If no selectedProfile, try finding the default one.
    if (!program.profile)
      program.profile = _.find(program.globalConfig.profiles, {
        default: true
      }) || program.globalConfig.profiles[0];

    cb();
  }

  // Check for an existing JWT in the config
  function checkForJwt(cb) {
    debug("check for existing jwt");

    // See if we have a login token
    if (_.isObject(program.profile.jwt) === false)
      return cb();

    // If the JWT is expired, force user to login again.
    if (_.isNumber(program.profile.jwt.expires) === false ||
      Date.now() > program.profile.jwt.expires) {
      program.profile.jwt = null;
    }

    cb();
  }

  function promptForCredentials(cb) {
    debug("prompt for credentials");

    // If we already have a valid JWT, don't force user
    // to login again.
    if (program.profile.jwt) return cb();

    // Prompt for login
    inquirer.prompt([{
      type: 'input',
      name: 'username',
      message: 'Username:',
    }, {
      type: 'password',
      name: 'password',
      message: 'Password:'
    }], function(answers) {
      // Make the api login call.
      var apiOptions = {
        method: 'POST',
        path: '/profile/login',
        json: answers,
				authenticate: false
      };

      api(program, apiOptions, function(err, jwt) {
        if (err) return cb(err);

        // Write the JWT to the configFile for future logins
        program.profile.jwt = jwt;
        cb();
      });
    });
  }

  function updateProfileConfig(cb) {
    var configJson = JSON.stringify(program.globalConfig, null, 2);
    fs.writeFile(program.globalConfigPath, configJson, cb);
  }

  function loadVirtualAppConfig(cb) {
    log.debug("loading virtual app config from package.json");
    virtualAppConfig.load(program, function(err, config) {
      if (err) return cb(err);

      program.virtualAppConfig = config;

      // Allow the appId to be overridden via a command argument
      if (program.appId)
        program.virtualAppConfig.appId = program.appId;

      cb();
    });
  }

  function loadVirtualApp(cb) {
    if (!program.virtualAppConfig)
      return cb();

    log.debug("invoking api to fetch the virtual app");
    api(program, {method: 'GET', path: '/apps/' + program.virtualAppConfig.appId}, function(err, app) {
      if (err) return cb(err);
      if (!app)
        return cb("Application " + program.virtualAppConfig.appId + " could not be found.");

      program.virtualApp = app;
      cb();
    });
  }

  function ensure4frontConfigExists(cb) {
    fs.exists(program.globalConfigPath, function(exists) {
      if (!exists)
        return createEmptyConfig();

      // The file exists, now make sure it is valid JSON.
      fs.readFile(program.globalConfigPath, function(err, data) {
        if (err) return cb(err);

        try {
          program.globalConfig = JSON.parse(data.toString());
        }
        catch (jsonErr) {
          debug("Config file %s is corrupt", program.globalConfigPath);
          return createEmptyConfig();
        }
        cb();
      });
    });

    function createEmptyConfig() {
      program.globalConfig = {profiles: []};

      fs.writeFile(program.globalConfigPath,
        JSON.stringify(program.globalConfig, null, 2), cb);
    }
  }
};
