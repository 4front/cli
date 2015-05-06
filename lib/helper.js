var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var debug = require('debug')('4front-cli:helper');

module.exports.takeFirstExistsPath = function(cwd, candidates, callback) {
	var baseDir;
	var i = 0;
	async.whilst(function() {
		return _.isUndefined(baseDir) && i < candidates.length;
	}, function(cb) {
		var checkDir = path.join(cwd, candidates[i]);
		fs.exists(checkDir, function(exists) {
			if (exists === true)
				baseDir = checkDir;

			i++;
			cb();
		});
	}, function() {
		if (_.isUndefined(baseDir))
			baseDir = cwd;

		callback(null, baseDir);
	});
};

module.exports.fileHash = function(filePath, callback) {
  var hash = crypto.createHash('sha1');
  hash.setEncoding('hex');

	var stream;
	if (_.isString(filePath))
		stream = fs.createReadStream(filePath);
	else
		stream = filePath;

	var errorEmitted;
  stream.on('end', function() {
		if (errorEmitted === true)
			return;

    hash.end();
    callback(null, hash.read());
  });

	stream.on('error', function(err) {
		errorEmitted = true;
		callback(err);
	});

  stream.pipe(hash);
};

module.exports.pickOrgQuestion = function(orgs, message) {
	var choices = _.map(orgs, function(org) {
		return {
			name: org.name,
			value: org.orgId
		};
	});

	// Question to choose which organization the app belongs
	return {
		type: 'list',
		name: 'orgId',
		choices: choices,
		message: message
	};
};
