var express = require('express');
var fs = require('fs');
var cors = require('cors');
var path = require('path');
var bodyParser = require('body-parser');
var urlParse = require('url').parse;
var _ = require('lodash');
var http = require('http');
var https = require('https');
var glob = require('glob');
var mime = require('mime');
var crypto = require('crypto');
var debug = require('debug')('4front:cli:sandbox-server');
var api = require('./api');
var log = require('./log');
var helper = require('./helper');
var onFinished = require('on-finished');

require('simple-errors');

// The localhost express server that works in tandem with the sanbox
// environment running in the 4front cloud.

module.exports = function(program) {
	log.debug("Creating development express app");
	var localhost = express();

	localhost.use(function(req, res, next) {
		log.debug("Request for %s", req.path);

		onFinished(res, function() {
			// Write each request to the log in a format that emulates NPM
			log({
				process: '4front',
				status: res.statusCode,
				color: res.statusCode === 200 ? 'green' : 'magenta',
				message: "Serving " + req.path
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
	localhost.get(/sandbox\/(.*)$/ , function(req, res, next) {
		log.info("sandbox request for %s with hash %s", req.params[0], req.query.hash || 'none');

    var returnUrl = urlParse(req.query.return);
    if (!returnUrl.host)
      return next(Error.http(400, "No valid URL in the return query"));

		var pagePath = req.params[0];
		var fullPath = path.join(program.baseDir, pagePath);

		fs.exists(fullPath, function(exists) {
			if (!exists)
				return next(Error.http(404, "Page " + fullPath + " not found"));

			// Get the hash of the file
			// TODO: What if the file has references to other files internally,
			// for example liquid templates. Would it be possible to scan through the
			// document and find references to other files?
			helper.fileHash(fullPath, function(err, hash) {
				if (err) return next(err);

				// If the server already has the latest version, just redirect
				// back to the server hosted version.
				if (hash === req.query.hash) {
					debug("hash for page %s has not changed", pagePath);
					return res.redirect(req.query.return);
				}

				// Pipe the local version up to the sandbox server
				var requestOptions = {
					method: 'post',
					path: '/dev/' + program.virtualApp.appId + '/upload/' + pagePath,
					json: false,
					headers: {}
				};

				requestOptions.headers['File-Hash'] = hash;

				debug("uploading file %s to %s with File-Hash header of %s",
					pagePath, requestOptions.path, hash);

				fs.createReadStream(fullPath)
					.pipe(api(program, requestOptions, function(err) {
						if (err) return next(err);

						res.redirect(req.query.return);
					}));
			});
		});
	});

	// If autoReload is true, configure the middleware
	if (program.autoReload) {
		localhost.use('/autoreload', require('./autoreload')(program));
	}

	// Anything not served by the static middleware is a 404
	localhost.get('/*', function(req, res, next) {
    next(Error.http(404, "Path " + req.originalUrl + " not found"));
	});

	localhost.use(require('./middleware').error);

  return localhost;
};
