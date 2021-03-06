var request = require('request');
var _ = require('lodash');
var urljoin = require('url-join');
var debug = require('debug')('4front:cli:api');
var manifest = require('../package.json');

require('simple-errors');

module.exports = function(program, options, callback) {
  _.defaults(options, {
    method: 'get',
    headers: {},
    authenticate: true,
    json: true,
    strictSSL: false
  });

  if (!program.profile) {
    return callback(new Error('No profile exists'));
  }

  options.url = urljoin(program.profile.endpoint, 'api', options.path);

  _.extend(options.headers, {
    'User-Agent': '4front-cli@' + manifest.version,
    Accept: 'application/json'
  });

  // Pass the JWT token in the X-Access-Token header
  if (options.authenticate === true) {
    options.headers['X-Access-Token'] = program.profile.jwt.token;
  }

  debug('API request to %s', options.url);

  var method = options.method.toLowerCase();
  if (method === 'delete') method = 'del';

  return request[method](options, function(err, resp, body) {
    if (err) {
      debug('error %o', err);
      return callback(err);
    }

    debug('Received API status code of %s', resp.statusCode);
    switch (resp.statusCode) {
    case 200:
    case 201:
    case 202:
    case 204:
      return callback(null, body, resp.statusCode);

    case 401:
      return callback(Error.http(401, "Authentication error, try running '4front login'"));
    case 404:
    case 500:
    default:
      debug('error %s from api call', resp.statusCode);
      return callback(Error.http(resp.statusCode, 'Unexpected error', body));
    }
  });
};
