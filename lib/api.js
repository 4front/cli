var request = require('request');
var _ = require('lodash');
var urljoin = require('url-join');
var log = require('./log');
var debug = require('debug')('4front:cli:api');
var manifest = require('../package.json');

require('simple-errors');

module.exports = function(program, options, callback) {
  _.defaults(options, {
    method: 'get',
    headers: {},
    authenticate: true,
    json: true,
    strictSSL: true
  });

  debugger;

  if (!program.profile)
    return callback(new Error("No profile exists"));

  options.url = urljoin(program.profile.platformUrl, 'api', options.path);

  _.extend(options.headers, {
    "User-Agent": '4front-cli@' + manifest.version,
    "Accept": "application/json"
  });

  // Pass the JWT token in the X-Access-Token header
  if (options.authenticate === true) {
    options.headers['X-Access-Token'] = program.profile.jwt.token;
  }

  debug("API request to %s", options.url);

  var method = options.method.toLowerCase();
  if (method === 'delete') method = 'del';

  return request[method](options, function(err, resp, body) {
    if (err)
      return callback(err);

    log.debug("Received API status code of %s", resp.statusCode);
    switch (resp.statusCode) {
      case 200:
      case 201:
      case 202:
        return callback(null, body, resp.statusCode);

      case 401:
        return callback(Error.http(401, "Unauthorized access to " + options.path + " for profile " + program.profile.name));
      case 404:
      case 500:
      default:
        log.debug("error %s from api call", resp.statusCode);
        return callback(Error.http(resp.statusCode, "Unexpected error", body));
    }
  });
};
