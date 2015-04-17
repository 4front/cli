var express = require('express');
var fs = require('fs');
var cors = require('cors');
var path = require('path');
var urlParse = require('url').parse;
var _ = require('lodash');
var http = require('http');
var https = require('https');
var glob = require('glob');
var mime = require('mime');
var crypto = require('crypto');
var api = require('./api');
var log = require('./log');
var helper = require('./helper');
var preprocessor = require('./preprocessor');
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
			log.writeln({
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

	localhost.use(express.static(program.baseDir, {
		index: false
	}));

	// Route for css or js pre-processors
	localhost.get(/(.*\.[a-z]+)\.(css|js)$/, function(req, res, next) {
    console.log("preprocessor route");

		// Extract the second to last extension
		var filename = req.params[0];
		var contentTypeExtension = req.params[1];

		fs.exists(path.join(program.baseDir, filename), function(exists) {
			if (exists === false)
				return next(Error.http(404, "File " + filename + " not found"));
		});

		// TODO: Check if the plugin for the specified pre-processor is installed
		var preProcessorExtension = path.extname(filename);


		// Run the pre-processor and send the response

		res.set('Cache-Control', 'no-cache');
		res.set('Content-Type', mime.lookup(contentTypeExtension));
	});

	// Redirects from the 4front sandbox cloud server
	localhost.get(/sandbox\/(.*)$/ , function(req, res, next) {
    var returnUrl = urlParse(req.query.return);
    if (!returnUrl.host)
      return next(Error.http(400, "No valid URL in the return query"));

		var pagePath = req.params[0];
		// First look for a .html file, if not found, then look for the first file
		// with the specified name regardless of extension.

		var fullPath = path.join(program.baseDir, pagePath);

		findBestFileMatch(fullPath, function(err, fileMatch) {
			if (err) return next(err);

			// If no local file match was found, upload an empty
			// file indicating that a 404 should be returned.
			if (!fileMatch) {
				return uploadSandboxFile(pagePath, null, null, function(err) {
					if (err) return next(err);

					res.redirect(returnUrl);
				});
			}

      var fileStream = fs.createReadStream(fileMatch);

			// If the match is not an exact match, then
			// pre-processing needs to occur.
			debugger;
			if (fileMatch !== fullPath) {
				fileStream = fileStream.pipe(preprocessor(fileMatch));
      }

      // TODO: Pipe the stream through htmlprep to expand src paths

      var fileHash;
      var hash = crypto.createHash('sha1');
      hash.setEncoding('hex');

      var fileBuffer = '';
      fileStream
        .on('data', function(chunk) {
          fileBuffer += chunk.toString();
        })
        .pipe(hash)
        .on('finish', function() {
          hash.end();
          fileHash = hash.read();
          if (fileHash === req.query.hash)
            return res.redirect(req.query.return);

					uploadSandboxFile(pagePath, fileBuffer, fileHash, function(err) {
						if (err) return next(err);

            res.redirect(req.query.return);
					});
        });
    });
	});

	// Anything not served by the static middleware is a 404
	localhost.get('/*', function(req, res, next) {
    next(Error.http(404, "Path " + req.originalUrl + " not found"));
	});

	localhost.use(function(err, req, res, next) {
    if (!err.status)
      err.status = 500;

    res.statusCode = err.status || 500;
    if (err.status >= 500) {
      console.log(err.stack);
    	res.send(err.stack || err.toString());
    }
    else
      res.send(err.message);
	});

  return localhost;

	function uploadSandboxFile(pagePath, fileContents, hash, callback) {
		var requestOptions = {
			method: 'post',
			path: '/dev/' + program.virtualApp.appId + '/upload/' + pagePath,
			headers: {}
		};

		if (fileContents) {
			requestOptions.body = fileContents;
			requestOptions.headers['File-Hash'] = hash;
		}

		api(program, requestOptions, callback);
	}

	function findBestFileMatch(fullPath, callback) {
	  // First look for an exact match with the same extension
	  fs.exists(fullPath, function(exists) {
	    if (exists)
	      return callback(null, fullPath);

			// If there was no exact match, strip off the extension
			var pathWithoutExt = fullPath.slice(0, -1 * path.extname(fullPath).length);

	    glob(pathWithoutExt + ".*", function(err, files) {
	      if (err) return callback(err);

	      if (files.length === 0)
	        return callback(null, null);

	      return callback(null, files[0]);
	    });
	  });
	}
};
