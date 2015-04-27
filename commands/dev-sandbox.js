var _ = require('lodash');
var async = require('async');
var formatUrl = require('url').format;
var api = require('../lib/api');
var querystring = require('querystring');
var openBrowser = require('open');
var log = require('../lib/log');
var sandboxServer = require('../lib/sandbox-server');
var spawn = require('../lib/spawn');

module.exports = function(program, done) {
  debugger;

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

  log.debug("running dev command");

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
    log.debug("uploading the app manifest");

    // Upload the app manifest
    var requestOptions = {
			method: 'post',
			path: '/dev/' + program.virtualApp.appId + '/manifest',
      body: _.omit(program.virtualAppConfig, 'scripts', 'appId')
		};

		api(program, requestOptions, cb);
  });

  var server;
  var sandboxUrl = buildSandboxUrl();

  asyncTasks.push(function(cb) {
    // Start the localhost server
    server = sandboxServer(program).listen(program.port, function(err) {
      if (err) return cb(err);

      // openBrowser(sandboxUrl);

      cb();
    });
  });

  async.series(asyncTasks, function(err) {
    if (err) return done(err);

    // Display a message that the app is ready for development at the sandboxUrl.
    log.messageBox("The dev sandbox ready at the following url:");
    log.writeln(sandboxUrl);

    done(null, function() {
      if (server)
        server.stop();
    });
  });

  function buildSandboxUrl() {
    debugger;
    var devOptions = {
      buildType: program.build,
      token: program.profile.jwt.token,
      port: program.port || 3000
    };

    if (program.liveReload) {
      devOptions.liveReload = 1;
      devOptions.liveReloadPort = program.liveReloadPort;
    }

    return formatUrl({
      protocol: program.virtualApp.requireSsl === true ? 'https' : 'http',
      host: program.virtualApp.name + '--dev.' + program.virtualHost,
      query: {_dev: querystring.stringify(devOptions)}
    });
  }
};
