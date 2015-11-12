var _ = require('lodash');
var inquirer = require('inquirer');
var api = require('../lib/api');
var log = require('../lib/log');

require('simple-errors');

module.exports = function(program, done) {
  program = _.defaults(program || {}, {
    baseDir: process.cwd()
  });

  log.messageBox('Delete the ' + program.virtualApp.name + ' 4front app.\n' +
    'Enter the app name to confirm this is what you want to do.');

  // Prompt the user to re-enter the name of the app to confirm its deletion
  var confirmAppName = {
    type: 'input',
    message: 'App name',
    name: 'appName'
  };

  inquirer.prompt([confirmAppName], function(answers) {
    if (answers.appName !== program.virtualApp.name) {
      return done(new Error('The app name you entered does not match.'));
    }

    var options = {
      method: 'DELETE',
      path: '/apps/' + program.virtualApp.appId
    };

    log.info('Invoking 4front API to delete app');
    api(program, options, function(err) {
      if (err) return done(err);

      log.success('Successfully deleted app %s', program.virtualApp.name);
      done(null);
    });
  });
};
