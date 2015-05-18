var fs = require('fs');
var inquirer = require('inquirer');
var log = require('../lib/log');
var api = require('../lib/api');
var Table = require('cli-table');
var _ = require('lodash');
var moment = require('moment');
var urljoin = require('url-join');
var helper = require('../lib/helper');
var chalk = require('chalk');

// Register a new profile in the 4front global config file
module.exports = function(program, done) {
  // If the user is a member of more than 1 org, make them select which one
  // to display apps for.

  api(program, {
    method: 'GET',
    path: '/profile/orgs'
  }, function(err, orgs) {
    if (err) return done(err);

    if (orgs.length === 0) {
      log.messageBox("You don't belong to any organizations yet.\n" +
        "Visit " + urljoin(program.profile.platformUrl, '/portal/orgs/create') + " to get started.");

      return done();
    }

    if (orgs.length === 1)
      return displayApps(orgs[0].orgId);

    var selectOrgQuestion = helper.pickOrgQuestion(orgs, "Select organization");
    inquirer.prompt([selectOrgQuestion], function(answers) {
      displayApps(answers.orgId);
    });
  });

  function displayApps(orgId) {
    api(program, {
      method: 'GET',
      path: '/orgs/' + orgId + '/apps'
    }, function(err, apps) {
      if (err) return done(err);

      // Display the apps in a grid.
      var table = new Table({
        head: [chalk.cyan('name'), chalk.cyan('url'), chalk.cyan('created')],
        colWidths: [25, 35, 22]
      });

      _.each(apps, function(app) {
        table.push([app.name || '', app.url, moment(app.created).format("MMM D, YYYY")])
      });

      console.log(table.toString());
      done();
    });
  }
};
