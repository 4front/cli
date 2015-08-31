var express = require('express');
var bodyParser = require('body-parser');
var _ = require('lodash');
var path = require('path');

module.exports = function(program) {
  var listeners = [];
  var router = express.Router();

  router.get('/listen', function(req, res, next) {
    listeners.push(res);
  });

  // The gulp/grunt task invokes this endpoint to notify
  // listeners which files have changed.
  router.post('/notify', bodyParser.json(), function(req, res, next) {
    // Normalize the file path to be relative to the baseDir.
    changedPaths = _.map(req.body.files, function(fullPath) {
      // Chop the baseDir off the full file path.
      return path.relative(program.baseDir, fullPath);
    });

    // Send response to all registered listeners with the list of files
    // that have changed.
    listeners.forEach(function(listener) {
      listener.json(changedPaths);
    });

    listeners = [];
    res.end();
  });

  return router;
};
