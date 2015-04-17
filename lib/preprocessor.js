var path = require('path');
var _ = require('lodash');
var stream = require('stream');
var util = require('util');
var childProcess = require('duplex-child-process');

var standardPreprocessors = {
  coffee: 'coffee',
  jade: 'jade',
  styl: 'stylus',
  // browserify: 'browserify ${filename}',
  scss: 'sass ${filename}'
};

// Pipe a stream through a preprocessor CLI
module.exports = function(filePath) {
  // Assume that the name of the executable is the same as the
  // file extension.
  var processor = path.extname(filePath).substr(1);

  // var args = standardPreprocessors[processor];

  return childProcess.spawn(processor, [], {stdio: 'pipe', env: process.env});
};
