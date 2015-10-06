var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var log = require('./log');
var debug = require('debug')('4front:cli');

require('simple-errors');

// Default router contains a single instance of the webpage
// middleware with the default options.
var defaultRouter = [
	{
		module: 'webpage'
	}
];

// Write the _virtualApp config section to package.json. If file doesn't exist
// create a new package.json from scratch.
module.exports.update = function(appDir, app, callback) {
	// If there isn't a package.json file, create one. Otherwise modify
	// it adding the aerobatic section.
	var packageJsonPath = path.join(appDir, 'package.json');
	fs.exists(packageJsonPath, function(exists) {
		if (!exists) {
			log.info("Writing file %s", packageJsonPath);
			fs.writeFile(packageJsonPath, JSON.stringify({
				name: app.name,
				version: "0.0.1",
				_virtualApp: {
					appId: app.appId,
					router: defaultRouter
				}
			}, null, 2), callback);
		}
		else {
			// If the package.json file already exits, modify it by adding a _virtualApp section
			debug("Updating file %s", packageJsonPath);
			fs.readFile(packageJsonPath, function(err, json) {
				if (err) return callback(err);

				var packageJson;
				try {
					packageJson = JSON.parse(json);
				}
				catch (e) {
					return callback(Error.create("package.json is invalid"));
				}

				packageJson.name = app.name;
				if (!packageJson.version)
					packageJson.version = "1.0.0";

				if (_.isObject(packageJson._virtualApp) === false)
					packageJson._virtualApp = {};

				packageJson._virtualApp.appId = app.appId;
				if (_.isArray(packageJson._virtualApp.router) === false)
					packageJson._virtualApp.router = defaultRouter;

				fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2),
					callback);
			});
		}
	});
};

module.exports.load = function(program, callback) {
  var packageJsonPath = path.join(program.cwd, 'package.json');

  fs.exists(packageJsonPath, function(exists) {
    if (!exists)
      return callback(new Error("File " + packageJsonPath + " does not exist. " +
				"Run 'npm init' to create it followed by '4front init'."));

    fs.readFile(packageJsonPath, function(err, contents) {
      if (err) return callback(err);

      var json;
      try {
        json = JSON.parse(contents);
      }
      catch (e) {
        return callback("File " + packageJsonPath + " is not valid JSON");
      }

      if (!json._virtualApp)
        return callback("Missing _virtualApp section in package.json file. " +
					"Try running '4front init'.");

      var config = json._virtualApp;

			// Allow the appId to be overridden via a command argument
			if (program.appId)
				config.appId = program.appId;

      if (!config.appId)
        return callback(new Error("Missing appId in _virtualApp section of package.json. " +
					"Try running '4front init'."));

			if (_.isObject(json.scripts) === false)
				json.scripts= {};

      // Look for any script keys that match the pattern name:buildType, i.e.
			// build:release or build:debug.
			// Create a new script that points to the buildType specific command with the simple name
			// like "build". That way we can run "npm run-script build" and run the command that is
			// relevant for the current build type.
			_.each(_.keys(json.scripts), function(scriptKey) {
				if (scriptKey.slice(-1 * (program.buildType.length + 1)) === (":" + program.buildType)) {
					json.scripts[scriptKey.split(':')[0]] = scriptKey;
				}
				else {
					json.scripts[scriptKey] = scriptKey;
				}
			});

			debugger;

      _.extend(config, {
        version: json.version,
        scripts: json.scripts || {}
      });

      callback(null, config);
    });
  });
};
