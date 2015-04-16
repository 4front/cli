var path = require('path');
var fs = require('fs');
var log = require('./log');

require('simple-errors');

// Start each app out with the minimal router required to
// serve a static html site.
var defaultRouter = [{
	module: 'html-page',
	options: {
	}
}];

// Write the _virtualApp config section to package.json. If file doesn't exist
// create a new package.json from scratch.
module.exports.update = function(appDir, app, callback) {
	// If there isn't a package.json file, create one. Otherwise modify it adding the aerobatic section.
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
			// If the package.json file already exits, modify it by adding an _aerobatic section
			log.debug("Updating file %s", packageJsonPath);
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
					packageJson.version = "0.0.1";

				packageJson['_virtualApp'] = {
					appId: app.appId,
					router: defaultRouter
				};
				fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2),
					callback);
			});
		}
	});
};

module.exports.load = function(program, callback) {
  var packageJsonPath = path.join(program.baseDir, 'package.json');

  fs.exists(packageJsonPath, function(exists) {
    if (!exists)
      return callback(new Error("File " + packageJsonPath + " does not exist. Run 'npm init' to create it followed by '4front init'."));

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
        return callback("Missing _virtualApp section in package.json file. Try running '4front init'.");

      var config = json._virtualApp;

      if (!config.appId)
        return callback(new Error("Missing appId in _virtualApp section of package.json. Try running '4front init'."));

      // Copy certain NPM standard attributes to the _aerobatic section.
      _.extend(config, {
        version: json.version,
        scripts: json.scripts || {}
      });

      callback(null, config);
    });
  });
};
