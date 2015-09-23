var Table = require('cli-table');
var _ = require('lodash');
var chalk = require('chalk');

// Register a new profile in the 4front global config file
module.exports = function(program, done) {
  // If the user is a member of more than 1 org, make them select which one
  // to display apps for.

  var profiles = program.globalConfig.profiles;
  if (_.isArray(profiles) === false || profiles.length === 0) {
    return console.log("No profiles configured. Add one by running '4front add-profile'");
  }

  // Display the apps in a grid.
  var table = new Table({
    head: [chalk.cyan('name'), chalk.cyan('endpoint'), chalk.cyan('default')],
    colWidths: [25, 35, 10]
  });

  _.each(profiles, function(profile) {
    table.push([profile.name || '', profile.endpoint, profile.default ? 'true' : 'false'])
  });

  console.log(table.toString());
  done();
};
