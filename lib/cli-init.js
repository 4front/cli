var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var api = require('./api');
var log = require('./log');
var parseUrl = require('url').parse;
var manifest = require('./manifest');
var debug = require('debug')('4front:cli:init');
var inquirer = require('inquirer');

require('simple-errors');

// Initialization routine that runs before any CLI command
module.exports = function(program, options, callback) {
  log.debug("initiliazing CLI");

  _.defaults(options, {
    requireAuth: false,
    loadManifest: false,
    loadVirtualApp: false
  });

  debugger;
  var initTasks = [];

  initTasks.push(ensure4frontConfigExists);

  if (options.requireAuth === true) {
    initTasks.push(ensureProfileExists);
    initTasks.push(selectProfile);
    initTasks.push(checkForJwt);
    initTasks.push(promptForCredentials);
    initTasks.push(updateProfileConfig);
  }

  if (options.loadManifest === true) {
    initTasks.push(loadManifest);
  }

  if (options.loadVirtualApp) {
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
      name: "endpoint",
      message: "Endpoint URL:"
    }, {
      type: "input",
      name: "identityProvider",
      message: "Identity provider:"
    }], function(answers) {
      // Make the new instance the default
      program.globalConfig.profiles = [{
        endpoint: answers.endpoint,
        name: 'default',
        default: true,
        identityProvider: answers.identityProvider
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

    // Next check if there is an environment variable with the name of a valid profile.
    var envVarProfile = process.env.FF_PROFILE;
    if (_.isEmpty(envVarProfile) === false) {
      program.profile = _.find(program.globalConfig.profiles, {name: envVarProfile});
      if (!program.profile)
        cb(new Error("Environment variable FF_PROFILE refers to to an invalid 4front profile."));
    }

    // If no selectedProfile, try finding the default one.
    if (!program.profile)
      program.profile = _.find(program.globalConfig.profiles, {
        default: true
      }) || program.globalConfig.profiles[0];

    var endpointUrl = parseUrl(program.profile.endpoint);
    program.virtualHost = endpointUrl.host;

    debug("using profile: %o", _.pick(program.profile, 'name', 'url'));

    cb();
  }

  // Check for an existing JWT in the config
  function checkForJwt(cb) {
    debug("check for existing jwt");

    // See if we have a login token
    if (_.isObject(program.profile.jwt) === false)
      return cb();

    // If force new login, clear out any existing jwt.
    if (options.forceLogin) {
      program.profile.jwt = null;
      return cb();
    }

    // If the JWT is expired, force user to login again.
    if (_.isNumber(program.profile.jwt.expires) === false ||
      Date.now() > program.profile.jwt.expires) {
      program.profile.jwt = null;
    }

    cb();
  }

  function promptForCredentials(cb) {
    // If we already have a valid JWT, don't force user
    // to login again.
    if (program.profile.jwt) {
      debug("using existing jwt");
      return cb();
    }

    debug("prompt for credentials");

    // Prompt for login
    inquirer.prompt([{
      type: 'input',
      name: 'username',
      message: 'Username:'
    }, {
      type: 'password',
      name: 'password',
      message: 'Password:'
    }], function(answers) {
      answers.identityProvider = program.profile.identityProvider;
      // Make the api login call.
      var apiOptions = {
        method: 'POST',
        path: '/profile/login',
        json: answers,
				authenticate: false
      };

      api(program, apiOptions, function(err, user) {
        if (err) return cb(err);

        debug("setting jwt for profile %s: %s", program.profile.name, JSON.stringify(user.jwt));

        // Write the JWT to the configFile for future logins
        program.profile.jwt = user.jwt;
        cb();
      });
    });
  }

  function updateProfileConfig(cb) {
    debug("writing to %s", program.globalConfigPath);
    var configJson = JSON.stringify(program.globalConfig, null, 2);
    fs.writeFile(program.globalConfigPath, configJson, cb);
  }

  function loadManifest(cb) {
    log.debug("loading virtual app config from package.json");

    manifest.load(program, function(err, config) {
      if (err) return cb(err);

      program.virtualAppManifest = config;
      cb();
    });
  }

  function loadVirtualApp(cb) {
    debugger;
    var appId;
    if (program.appId)
      appId = program.appId;
    else if (program.virtualAppManifest)
      appId = program.virtualAppManifest.appId;
    else
      return cb();

    log.debug("invoking api to fetch the virtual app");
    api(program, {
      method: 'GET',
      path: '/apps/' + appId
    }, function(err, app) {
      if (err) return cb(err);
      if (!app)
        return cb("Application " + appId + " could not be found.");

      debug("virtual app loaded from API");
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
