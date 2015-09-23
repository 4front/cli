var _ = require('lodash');
var debug = require('debug')('4front:cli:env');
var api = require('../lib/api');

var INVALID_KEY_ERR = "Environment variable keys can only contain " +
  "letters, numbers, dashes, and underscores.";

module.exports = function(program, done) {
  switch (program.subCommand) {
    case "set":
      set(); break;
    case "list":
      list(); break;
    case "del":
      del(); break;
    default:
      return done("Invalid sub-command " + program.subCommand +
        ". Expected set, get, del, or list.")
  }

  function set() {
    debug('setting env variable');
    if (_.isEmpty(program.key))
      return done("No environment variable key specified");

    if (!validateKey())
      return done(INVALID_KEY_ERR);

    if (_.isEmpty(program.value))
      return done("No environment variable value specified");

    var apiPath = '/apps/' + program.virtualApp.appId + '/env';
    if (program.virtualEnv)
      apiPath += '/' + program.virtualEnv;

    apiPath += '/' + program.key;

    var requestOptions = {
      path: apiPath,
      method: 'PUT',
      json: {
        value: program.value,
        encrypted: program.encrypted === true
      }
    };

    debug("invoking api to set env var %s", program.key);
    api(program, requestOptions, done);
  }

  // Get the value of an environment variable
  function list() {
    var requestOptions = {
      path: '/apps/' + program.virtualApp.appId + '/env',
      method: 'GET'
    };

    api(program, requestOptions, function(err, env) {
      if (err) return done(err);

      console.log(JSON.stringify(env, null, 2));
      done();
    });
  }

  function del() {
    if (!validateKey())
      return done(INVALID_KEY_ERR);

    var apiPath = '/apps/' + program.virtualApp.appId + '/env/';
    if (program.virtualEnv)
      apiPath += program.virtualEnv + '/';

    apiPath += program.key;

    api(program, {path: apiPath, method: 'DELETE'}, done);
  }

  function validateKey() {
    return /^[A-Z_\-0-9]+$/i.test(program.key);
  }
};
