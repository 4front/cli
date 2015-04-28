var _ = require('lodash');
var async = require('async');
var formatUrl = require('url').format;
var api = require('../lib/api');
var querystring = require('querystring');
var openBrowser = require('open');
var log = require('../lib/log');
var helper = require('../lib/helper');
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
    baseDirs: {
    },
    buildType: 'debug'
  });

  log.debug("running dev command");

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

      log.debug("setting baseDir to %s", baseDir);
      program.baseDir = baseDir;
    });
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
    log.debug("uploading the app manifest");

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
    // Start the localhost server
    server = sandboxServer(program).listen(program.port, cb);
  });

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

  function determineBaseDir(callback) {
		var baseDir;
		if (_.isObject(program.virtualAppManifest.baseDir)) {
			buildDirName = program.virtualAppManifest.baseDir[program.buildType];
      if (!buildDirName)
        return callback(Error.create("No baseDir specified for buildType " + program.buildType));

      var baseDir = path.join(program.cwd, buildDirName);
      fs.exists(baseDir, function(exists) {
        if (exists === false)
          return callback(Error.create("The specified baseDir " + buildDirName + " for buildType " + program.buildType + " does not exist."));

        log.debug('setting baseDir to %s', baseDir);
        program.baseDir = baseDir;
        return callback(null);
      });
		}
		// If there was no explicit baseDir specified in package.json, fallback to convention.
		else {
			var baseDirConventions = {
				debug: ['src', 'app'],
				release: ['dist', 'build']
			};

			helper.takeFirstExistsPath(program.cwd, baseDirConventions[program.buildType], function(err, baseDir) {
        if (err) return callback(err);

        log.debug('setting baseDir to %s', baseDir);
        program.baseDir = baseDir;
        callback(null);
      });
    }
	}

  function buildSandboxUrl() {
    var devOptions = {
      buildType: program.buildType,
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
