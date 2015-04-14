var request = require('request');
var _ = require('lodash');
var urljoin = require('url-join');
var log = require('./log');
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

  if (program.platformUrl)
    options.url = urljoin(program.platformUrl, 'api', options.path);

  _.extend(options.headers, {
    "User-Agent": '4front-cli@' + manifest.version,
    "Accept": "application/json"
  });

  // Pass the JWT token in the X-Access-Token header
  if (options.authenticate === true)
    options.headers['X-Access-Token'] = program.jwt.token;

  log.debug("API request to %s", options.url);
  return request[options.method.toLowerCase()](options, function(err, resp,
    body) {
    if (err)
      return callback(err);

    log.debug("Received API status code of %s", resp.statusCode);
    switch (resp.statusCode) {
      case 200:
      case 201:
      case 202:
        return callback(null, body, resp.statusCode);

      case 401:
        return callback(Error.http(401, "Unauthorized to perform requested action for profile " + program.profile));
      case 404:
      case 500:
      default:
        return callback(Error.http(resp.statusCode, body));
    }
  });
};
