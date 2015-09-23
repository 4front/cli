var fs = require('fs');
var log = require('../lib/log');
var _ = require('lodash');

// Remove a profile from the .4front config file
module.exports = function(program, done) {
  if (_.isEmpty(program.profileName))
    return done("Please provide a profile name with --name option");

  // Check if this profile already exists
  if (_.any(program.globalConfig.profiles, {name: program.profileName}) === false)
    return done("There is no registered profile named " + program.profileName);

  program.globalConfig.profiles = _.reject(
    program.globalConfig.profiles, {name: program.profileName});

  log.debug("writing global config to %s", program.globalConfigPath);
  var configJson = JSON.stringify(program.globalConfig, null, 2);

  fs.writeFile(program.globalConfigPath, configJson, function(err) {
    if (err) return done(err);

    log.success("Profile %s removed", program.profileName);
    done();
  });
};
