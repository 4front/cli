var path = require('path');
var _ = require('lodash');
var stream = require('stream');
var util = require('util');
var childProcess = require('duplex-child-process');

var standardPreprocessors = {
  coffee: 'coffee ${filename}',
  jade: 'jade',
  styl: 'stylus < ${filename}',
  browserify: 'browserify ${filename}',
  scss: 'sass ${filename}'
};

// Pipe a stream through a preprocessor CLI
module.exports = function(filePath) {
  var processor = path.extname(filePath).substr(1);
  var args = standardPreprocessors[processor];

  return childProcess.spawn('jade', [], {stdio: 'pipe', env: process.env});
};
