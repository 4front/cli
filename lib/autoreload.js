var express = require('express');
var bodyParser = require('body-parser');

module.exports = function() {
  var listeners = [];
  var router = express.Router();

  router.get('/listen', function(req, res, next) {
    listeners.push(res);
  });

  // The gulp/grunt task invokes this endpoint to notify
  // listeners which files have changed.
  router.post('/notify', bodyParser.json(), function(req, res, next) {
    // Send response to all registered listeners with the list of files
    // that have changed.
    listeners.forEach(function(listener) {
      listener.json(req.body.files);
    });

    listeners = [];
    res.end();
  });

  return router;
};
