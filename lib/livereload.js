var tinylr = require('tiny-lr');
var Gaze = require('gaze').Gaze;
var log = require('./log');

var CSS_EXTENSIONS = ['.css', '.styl', '.scss', '.sass', '.less'];

module.exports = function(options, callback) {
  // Defaulting to poll mode as native was observed to fail silently even
  // though it is supposed to automatically fallback to polling. Allow
  // this to be overridden in package.json in the _aerobatic section.
  var gazeOptions = {
    maxListeners: 100,
    mode: 'poll', // program.watchMode === 'auto' ? 'auto' : 'poll',
    cwd: options.baseDir
  };

  var liveReloadOptions = {
    liveCSS: true, liveImg: true
  };

  if (options.https)
    _.extend(liveReloadOptions, options.https);

  var liveReloadServer = tinylr(liveReloadOptions);

  // Make sure to call listen on a new line rather than chain it to the factory function
  // since the listen function does not return the server reference.
  liveReloadServer.listen(options.liveReloadPort, function() {
    log.info("LiveReload listening on port %s", options.liveReloadPort);

    liveReloadServer.on('close', function() {
      watcher.close();
    });

    new Gaze("**/*", gazeOptions, function(err, watcher) {
      if (err) return callback(err);

      this.on('all', function(filePath) {
        log.info("LiveReload triggered by change to %s", filePath);

        // if this is a css file or something that compiles to css,
        // try and just refresh the css without a full page reload.
        var ext = path.extname(filePath);
        if (_.contains(CSS_EXTENSIONS, ext))
          tinylr.changed('*.css');
        else
          tinylr.changed();
      });

      this.on('error', function(err) {
        log.warn("Watch error %s", err.message);
      });

      callback(null, liveReloadServer);
    });
  });
};
