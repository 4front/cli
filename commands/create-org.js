var _ = require('lodash');
var api = require('../lib/api');
var log = require('../lib/log');
var debug = require('debug')('4front:cli:create-org');

require("simple-errors");

module.exports = function(program, done) {
	log.messageBox("Create a new 4front organization");

  if (_.isEmpty(program.orgName))
    return done("Please provide a organization name with the --org-name option");

  var requestOptions = {
    path: '/orgs',
    method: 'POST',
    json: {
      name: program.orgName
    }
  };

  debug("invoking api to create organization %s", program.orgName);
  api(program, requestOptions, function(err, org) {
    if (err) return done(err);

    log.success("Organization %s created", org.name);
    done();
  });
};
