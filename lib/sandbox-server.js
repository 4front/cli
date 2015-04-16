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
	localhost.get(/html-page\/(.*)\.html$/ , function(req, res, next) {
    console.log('html-page route');

    var returnUrl = urlParse(req.query.return);
    if (!returnUrl.host)
      return next(Error.http(400, "No valid URL in the return query"));

		// req.originalUrl
		var pagePath = req.params[0];
		// First look for a .html file, if not found, then look for the first file
		// with the specified name regardless of extension.

    findHtmlFile(pagePath, program.baseDir, function(err, htmlFile) {
      var fileStream;
      // Need to perform src expansions on the file
      if (path.extname(htmlFile) === '.html') {
        fileStream = fs.createReadStream(htmlFile);
      }
      else {
        // TODO: Pipe the file through a pre-processor
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

          var requestOptions = {
            method: 'post',
            path: '/dev/' + program.virtualApp.appId + '/upload/' + pagePath + '.html',
            headers: {
              'File-Hash': fileHash
            },
            body: fileBuffer
          };

          api(program, requestOptions, function(err) {
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
};

function findHtmlFile(filePath, baseDir, callback) {
  // First look for the .html file
  var htmlFile = path.join(baseDir, filePath + '.html');
  fs.exists(htmlFile, function(exists) {
    if (exists)
      return callback(null, htmlFile);

    glob(filePath + "/*", {cwd: baseDir}, function(err, files) {
      if (err) return callback(err);

      if (files.length === 0)
        return callback(null, null);

      return callback(null, files[0]);
    });
  });
}
