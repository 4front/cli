var os = require('os');
var fs = require('fs');
var path = require('path');
var request = require('request');
var async = require('async');
var unzip = require('unzip2');
var ncp = require('ncp').ncp;
var debug = require('debug')('4front:cli:template');

module.exports.extract = function(url, destDir, callback) {
  var tempDir = path.join(os.tmpdir(), new Date().getTime().toString());
  debug("downloading zip to %s", tempDir);

  var sourceDir;
  async.series([
    function(cb) {
      // make a temp directory to download the zip to
      fs.mkdir(tempDir, cb);
    },
    function(cb) {
      // download the zip to the tmp directory
      request.get({url: url, strictSSL: false})
        .pipe(unzip.Extract({path: tempDir}))
        .on('error', function(err) {
          return cb(err);
        })
        // unzip emits the close event once contents are fully extracted to disk
        .on('close', cb);
    },
    function(cb) {
      // Look at the contents of the extracted zip. If there is a single
      // directory at the root, discard it and advance to it's own contents.
      fs.readdir(tempDir, function(err, files) {
        if (files.length === 1) {
          // If the root of the extracted contents is a single directory,
          // then make the extractRoot that directory.
          fs.stat(path.join(tempDir, files[0]), function(_err, stats) {
            if (_err) return cb(_err);

            if (stats.isDirectory() === true)
              sourceDir = path.join(tempDir, files[0]);

            return cb();
          });
        }
        else
          cb();
      });
    },
    function(cb) {
      if (!sourceDir)
        sourceDir = tempDir;

      debug("copying from %s to %s", sourceDir, destDir);
      // Now recursively copy to the destination directory
      ncp(sourceDir, destDir, cb);
    }
  ], callback);
};
