var http = require('http');
var https = require('https');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var async = require('async');
var formatUrl = require('url').format;
var api = require('../lib/api');
var querystring = require('querystring');
var openBrowser = require('open');
var basedir = require('../lib/basedir');
var log = require('../lib/log');
var debug = require('debug')('4front:cli:dev-sandbox');
var helper = require('../lib/helper');
var sandboxServer = require('../lib/sandbox-server');
var spawn = require('../lib/spawn');
var basedir = require('../lib/basedir');

module.exports = function(program, done) {
  _.defaults(program, {
    port: 3000,
    liveReload: program.virtualAppManifest.liveReload === true,
    cwd: process.cwd(),
    buildType: 'debug'
  });

  debug("running dev-sandbox command");

  if (program.release === true)
    program.buildType = 'release';

  // Verify that the build type is valid.
  if (_.contains(['debug', 'release'], program.buildType) === false) {
    return done("Invalid build-type option value. Valid values are 'debug' and 'release'.");
  }

  var asyncTasks = [];

  // If serving in release mode, run the build step first.
  asyncTasks.push(function(cb) {
    if (program.buildType === 'release' && program.virtualAppManifest.scripts.build)
      spawn('npm', ['run-script', 'build'], cb);
    else
      cb();
  });

  // Determine which directory should be the base from which relative
  // file paths are resolved from. A common convention is to have a directory
  // like 'app' for raw source files and 'release' for build assets.
  // Do this after the previous step in case the release directory is
  // created for the first time by the build script.
  asyncTasks.push(function(cb) {
    basedir(program, function(err, baseDir) {
      if (err) return cb(err);

      debug("setting baseDir to %s", baseDir);
      program.baseDir = baseDir;
      cb();
    });
  });

  asyncTasks.push(function(cb) {
    // The build command will be build:debug or build:release
    var npmBuildCommand = 'build:' + program.buildType;

    if (program.virtualAppManifest.scripts[npmBuildCommand]) {
      log.debug("Found npm watch script");
      spawn('npm', ['run-script', npmBuildCommand], cb);
    }
    else
      cb();
  });

  asyncTasks.push(function(cb) {
    if (program.virtualAppManifest.scripts.watch) {
      log.debug("Found npm watch script");
      spawn('npm', ['run-script', 'watch'], {waitForExit: false}, cb);
    }
    else
      cb();
  });

  asyncTasks.push(function(cb) {
    debug("uploading the app manifest");

    // Upload the app manifest
    var requestOptions = {
			method: 'post',
			path: '/dev/' + program.virtualApp.appId + '/manifest',
      body: _.omit(program.virtualAppManifest, 'scripts', 'appId')
		};

		api(program, requestOptions, cb);
  });

  var server;
  var sandboxUrl = buildSandboxUrl();

  asyncTasks.push(function(cb) {
    var localhost = sandboxServer(program);

    if (program.virtualApp.requireSsl) {
      // Using the same SSL cert from the grunt server task
      httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, '../certs', 'server.key')).toString(),
        cert: fs.readFileSync(path.join(__dirname, '../certs', 'server.crt')).toString(),
        ca: fs.readFileSync(path.join(__dirname, '../certs', 'ca.crt')).toString(),
        passphrase: 'grunt',
        rejectUnauthorized: false
      };

      https.createServer(httpsOptions, localhost).listen(program.port, cb);
    }
    else
      localhost.listen(program.port, cb);
  });

  if (program.liveReload) {
    asyncTasks.push(function(cb) {
      // Put in an artificial delay to give time for external livereload server
      // to be listening.
      debug("delay 2 seconds to give time for livereload to be initialized");
      setTimeout(cb, 2000);
    });
  }

  async.series(asyncTasks, function(err) {
    if (err) return done(err);

    // Display a message that the app is ready for development at the sandboxUrl.
    log.messageBox("The dev sandbox was launched in your browser with url:");
    log.writeln(sandboxUrl);

    openBrowser(sandboxUrl);
    done(null, function() {
      if (server)
        server.stop();
    });
  });

  function buildSandboxUrl() {
    var devOptions = {
      buildType: program.buildType,
      token: program.profile.jwt.token,
      port: program.port || 3000
    };

    if (program.liveReload === true) {
      devOptions.liveReload = 1;
    }

    return formatUrl({
      protocol: program.virtualApp.requireSsl === true ? 'https' : 'http',
      host: program.virtualApp.name + '--dev.' + program.virtualHost,
      pathname: '/__login',
      query: devOptions
    });
  }
};
