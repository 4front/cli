var _ = require('lodash');
var async = require('async');
var api = require('../lib/api');
var spawn = require('../lib/spawn');

module.exports = function(program, done) {
  _.defaults(program, {
    port: 3000,
    liveReload: true,
    // Intentionally not using standard livereload port to avoid collisions if
    // the app is also using a browser livereload plugin.
    liveReloadPort: 35728,
    cwd: process.cwd(),
    baseDirs: {},
    build: 'debug'
  });

  if (program.release === true)
    program.build = 'release';

  // Verify that the build type is valid.
  if (_.contains(['debug', 'release'], program.build) === false) {
    return done("Invalid build option value. Valid values are 'debug' and 'release'.");
  }

  var asyncTasks = [];

  // If serving in release mode, run the build step first.
  asyncTasks.push(function(cb) {
    if (program.build === 'release' && program.virtualAppConfig.scripts.build)

      spawn('npm', ['run-script', 'build'], cb);
    else
      cb();
  });

  asyncTasks.push(function(cb) {
    if (program.virtualAppConfig.scripts.watch) {
      log.debug("Found npm watch script");
      spawn('npm', ['run-script', 'watch'], {waitForExit: false}, cb);
    }
    else
      cb();
  });

  asyncTasks.push(function(cb) {
    // Start the localhost server
    startLocalServer(function(localhostUrl) {
      if (program.simulator === true) {
        sandboxUrl = buildSandboxUrl();
        log.info("App running in developer sandbox at %s", sandboxUrl);
      }

      // Open a browser tab with the localhost URL
      if (program.open)
        openBrowser(sandboxUrl);

      cb();
    });
  });
});
