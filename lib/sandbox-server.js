var express = require('express');
var fs = require('fs');
var cors = require('cors');
var path = require('path');
var async = require('async');
var urljoin = require('url-join');
var urlParse = require('url').parse;
var formatUrl = require('url').format;
var debug = require('debug')('4front:cli:sandbox-server');
var api = require('./api');
var log = require('./log');
var helper = require('./helper');
var onFinished = require('on-finished');

require('simple-errors');

// The localhost express server that works in tandem with the sanbox
// environment running in the 4front cloud.

module.exports = function(program) {
  debug('Creating development express app');
  var localhost = express();

  localhost.use(function(req, res, next) {
    debug('Request for %s', req.path);

    onFinished(res, function() {
      // Write each request to the log in a format that emulates NPM
      log({
        process: '4front',
        status: res.statusCode,
        color: res.statusCode === 200 ? 'green' : 'magenta',
        message: 'Serving ' + req.path
      });
    });

    next();
  });

  // Serve node_modules and bower_components from the root of the app
  // regardless of the value of program.baseDir
  localhost.use('/node_modules', express.static(path.join(program.cwd, 'node_modules'), {
    index: false
  }));

  localhost.use('/bower_components', express.static(path.join(program.cwd, 'bower_components'), {
    index: false
  }));

  localhost.use(cors());

  localhost.use('/static', express.static(path.join(__dirname, '../static')));

  localhost.use(express.static(program.baseDir, {
    index: false
  }));

  // Redirects from the 4front sandbox cloud server
  localhost.get(/sandbox\/(.*)$/, function(req, res, next) {
    log.info('sandbox request for %s', req.originalUrl);

    var returnUrl = urlParse(req.query.return);
    if (!returnUrl.host) {
      return next(Error.http(400, 'No valid URL in the return query'));
    }

    var pagePath = req.params[0];
    var fullPath = path.join(program.baseDir, pagePath);

    var pageExists;
    async.series([
      function(cb) {
        fs.exists(fullPath, function(exists) {
          pageExists = exists;
          cb();
        });
      },
      function(cb) {
        if (pageExists || !req.query.custom404) return cb();

        debug('looking for custom 404 page %s', req.query.custom404);
        var custom404Path = path.join(program.baseDir, req.query.custom404);
        fs.exists(custom404Path, function(exists) {
          // If the custom 404 page exists, use that instead.
          if (exists) {
            fullPath = custom404Path;
            pageExists = true;
            pagePath = req.query.custom404;
          }
          cb();
        });
      },
      function(cb) {
        if (!pageExists) {
          api(program, {
            method: 'post',
            path: urljoin('/dev', program.virtualApp.appId, 'notfound', pagePath)
          }, cb);
        } else {
          uploadFileToServer(pagePath, fullPath, req.query, cb);
        }
      }
    ], function(err) {
      if (err) return next(err);

      res.redirect(req.query.return);
    });
  });

  // If autoReload is true, configure the middleware
  if (program.autoReload) {
    localhost.use('/autoreload', require('./autoreload')(program));
  }

  // Anything not served by the static middleware is a 404
  localhost.get('/*', function(req, res, next) {
    // Special handling for favicon.ico. If a local version doesn't exist,
    // then redirect to the 4front server with a default=1 querystring
    // to render the default.
    if (req.path === '/favicon.ico') {
      return res.redirect(formatUrl({
        protocol: program.virtualApp.requireSsl === true ? 'https' : 'http',
        host: program.virtualApp.name + '--dev.' + program.virtualHost,
        pathname: '/favicon.ico',
        query: {default: 1}
      }));
    }

    next(Error.http(404, 'Path ' + req.originalUrl + ' not found'));
  });

  localhost.use(require('./middleware').error);

  function uploadFileToServer(pagePath, fullPath, query, callback) {
    // Get the hash of the file
    // TODO: What if the file has references to other files internally,
    // for example liquid templates. Would it be possible to scan through the
    // document and find references to other files?
    helper.fileHash(fullPath, function(err, hash) {
      if (err) return callback(err);

      // If the server already has the latest version, just redirect
      // back to the server hosted version.
      if (hash === query.hash) {
        debug('hash for page %s has not changed', pagePath);
        return callback();
      }

      // Pipe the local version up to the sandbox server
      var requestOptions = {
        method: 'post',
        path: urljoin('/dev', program.virtualApp.appId, 'upload', pagePath),
        json: false,
        headers: {}
      };

      requestOptions.headers['File-Hash'] = hash;

      debug('uploading file %s to %s with File-Hash header of %s',
        pagePath, requestOptions.path, hash);

      var fileStream = fs.createReadStream(fullPath);
      fileStream.pipe(api(program, requestOptions, callback));
    });
  }

  return localhost;
};
