var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var path = require('path');

require('simple-errors');

module.exports = function(options, callback) {
	var baseDir;
	if (_.isObject(options.virtualAppConfig.baseDir)) {
		buildDirName = options.virtualAppConfig.baseDir[options.buildType];
    if (!buildDirName)
      return callback(Error.create("No baseDir specified for buildType " + options.buildType));

    var baseDir = path.join(options.cwd, buildDirName);
    fs.exists(baseDir, function(exists) {
      if (exists === false)
        return callback(Error.create("The specified baseDir " + buildDirName + " for buildType " + options.buildType + " does not exist."));

      callback(null, baseDir);
    });
	}
	// If there was no explicit baseDir specified in package.json, fallback to convention.
	else {
		var baseDirConventions = {
			debug: ['src', 'app'],
			release: ['dist', 'build']
		};

		takeFirstExistsPath(options.cwd,
      baseDirConventions[options.buildType], callback);
  }
};

function takeFirstExistsPath(cwd, candidates, callback) {
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
}
