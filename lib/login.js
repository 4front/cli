var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var api = require('./api');
var debug = require('debug')('4front-cli:login');
var inquirer = require('inquirer');

require('simple-errors');

// Ensure the user is logged in.
module.exports = function(program, callback) {
  var seriesTasks = [];
  var configJson;
  var selectedProfile;

  seriesTasks.push(function(cb) {
    fs.exists(program.configFilePath, function(exists) {
      if (!exists) {
        debug("config file %s does not exist", program.configFilePath);
        configJson = {};
        return cb();
      }

      // The file exists, now make sure it is valid JSON.
      fs.readFile(program.configFilePath, function(err, data) {
        if (err) return cb(err);

        try {
          configJson = JSON.parse(data.toString());
        }
        catch (jsonErr) {
          configJson = {};
          debug("Config file %s is corrupt", program.configFilePath);
        }
        cb();
      });
    });
  });

  seriesTasks.push(function(cb) {
    debug("prompt for profile");

    // If there is already at least one configured profile
    if (_.isEmpty(configJson.profiles) === false)
      return cb();

    // Run the initalization flow
    // prompt.message("No 4front instances have been configured. \n" +
    // 	"Please enter the URL of your instance:");

    debug("no configured profiles, prompt for one");
    inquirer.prompt([{
      type: "input",
      name: "platformUrl",
      message: "Platform URL:"
    }], function(answers) {
      // Make the new instance the default
      configJson.profiles = [{
        platformUrl: answers.platformUrl,
        name: 'default',
        default: true
      }];

      cb();
    });
  });

  // Prompt for which 4front profile to use
  seriesTasks.push(function(cb) {
    if (program.profile) {
      selectedProfile = _.find(configJson.profiles, {
        name: program.profile
      });
    }

    // If no selectedProfile, try finding the default one.
    if (!selectedProfile)
      selectedProfile = _.find(configJson.profiles, {
        default: true
      }) || configJson.profiles[0];

    program.platformUrl = selectedProfile.platformUrl;
    program.profile = selectedProfile.name;

    cb();
  });

  // Check for an existing JWT in the config
  seriesTasks.push(function(cb) {
    debug("check for existing jwt");

    // See if we have a login token
    if (_.isObject(selectedProfile.jwt) === false)
      return cb();

    // If the JWT is expired, force user to login again.
    if (_.isNumber(selectedProfile.jwt.expires) === false ||
      Date.now() > selectedProfile.jwt.expires) {
      selectedProfile.jwt = null;
    }

    cb();
  });

  seriesTasks.push(function(cb) {
    debug("prompt for credentials");

    // If we already have a valid JWT, don't force user
    // to login again.
    if (selectedProfile.jwt) return cb();

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
        selectedProfile.jwt = jwt;
        cb();
      });
    });
  });

  async.series(seriesTasks, function(err) {
    if (err) return callback(err);

    // Save the configJson file with any changes
    fs.writeFile(program.configFilePath, JSON.stringify(configJson, null,
        2),
      function(err) {
        if (err) return callback(err);

        // Return the json web token back
        callback(null, selectedProfile.jwt);
      });
  });
};
