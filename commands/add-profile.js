var fs = require('fs');
var log = require('../lib/log');
var _ = require('lodash');

// Register a new profile in the 4front global config file
module.exports = function(program, done) {
  if (_.isEmpty(program.profileName))
    return done("Please provide a profile name with --name option");

  if (_.isEmpty(program.profileUrl))
    return done("Please provide a profile url with --url option");

  // Check if this profile already exists
  if (_.any(program.globalConfig.profiles, {name: program.profileName}))
    return done("There is already a profile with the name " + program.profileName);

  var profile = {
    name: program.profileName,
    url: program.profileUrl
  };

  if (program.globalConfig.profiles.length === 0)
    profile.default = true;

  program.globalConfig.profiles.push(profile);

  log.debug("writing global config to %s", program.globalConfigPath);
  var configJson = JSON.stringify(program.globalConfig, null, 2);
  fs.writeFile(program.globalConfigPath, configJson, done);
};
