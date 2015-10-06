var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var debug = require('debug')('4front:cli:basedir');

require('simple-errors');

module.exports = function(options, callback) {
  var baseDir;

  if (_.isString(options.virtualAppManifest.baseDir)) {
    debug('using basedir from package.json');
    mkdirp(options.virtualAppManifest.baseDir, function(err) {
      if (err) return callback(err);

      return callback(null, options.virtualAppManifest.baseDir);
    });
  } else if (_.isObject(options.virtualAppManifest.baseDir)) {
    debug('using build-specific basedir from package.json');
    var buildDirName = options.virtualAppManifest.baseDir[options.buildType];
    if (!buildDirName) {
      return callback(Error.create('No baseDir specified for buildType ' + options.buildType));
    }

    baseDir = path.join(options.cwd, buildDirName);
    mkdirp(baseDir, function(err) {
      if (err) return callback(err);

      return callback(null, baseDir);
    });
  } else {
    // If there was no explicit baseDir specified in package.json, fallback to convention.
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
      if (exists === true) {
        baseDir = checkDir;
      }

      i++;
      cb();
    });
  }, function() {
    if (_.isUndefined(baseDir)) {
      baseDir = cwd;
    }

    callback(null, baseDir);
  });
}
