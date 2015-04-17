var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var debug = require('debug')('4front-cli:helper');

module.exports.takeFirstExistsPath = function(baseDir, candidates, fallback) {
	for (var i = 0; i < candidates.length; i++) {
		var dir = path.join(baseDir, candidates[i]);
		var exists = fs.existsSync(dir);

		debug("Existence check for %s: %s", dir, exists);
		if (exists)
			return dir;
	}
	// If none of the candidate dirs exist, use the current directory.
	return fallback;
};

module.exports.getFileHash = function(filePath, callback) {
  var hash = crypto.createHash('sha1');
  hash.setEncoding('hex');

	var stream;
	if (_.isString(filePath))
		stream = fs.createReadStream(filePath);
	else
		stream = filePath;

  stream.on('end', function() {
    hash.end();
    callback(hash.read());
  });

  stream.pipe(hash);
};
