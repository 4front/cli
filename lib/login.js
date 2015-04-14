var async = require('async');
var _ = require('lodash');
var fs = require('fs');
var debug = require('debug')('4front-cli:login');
var inquirer = require('inquirer');

require('simple-errors');

// Ensure the user is logged in.
module.exports = function(options, callback) {
	var seriesTasks = [];
	var configJson;
	var instance;

	seriesTasks.push(function(cb) {
		fs.exists(options.configFilePath, function(exists) {
			if (!exists) {
				debug("config file %s does not exist", options.configFilePath);
				configJson = {};
				return cb();
			}

			// The file exists, now make sure it is valid JSON.
			fs.readFile(options.configFilePath, function(err, data) {
				if (err) return cb(err);

				try {
					configJson = JSON.parse(data.toString());
				}
				catch (jsonErr) {
					configJson = {};
					debug("Config file %s is corrupt", options.configFilePath);
				}
				cb();
			});
		});
	});

	seriesTasks.push(function(cb) {
		debug("prompt for instance");

		// If there is already at least one configured instance
		if (_.isEmpty(configJson.instances) === false)
			return cb();

		// Run the initalization flow
		// prompt.message("No 4front instances have been configured. \n" +
		// 	"Please enter the URL of your instance:");

		debug("no configured instances, prompt for one");
		options.inquirer.prompt([{
			type: "input",
			name: "newInstanceUrl",
			message: "Instance URL:"
		}], function(answers) {
			// Make the new instance the default
			configJson.instances = [{
				url: answers.newInstanceUrl,
				default: true
			}];

			cb();
		});
	});

	// Prompt for which 4front instance to use
	seriesTasks.push(function(cb) {
		debug("prompt to pick instance from list");

		debugger;
		// If there is only one instance, automatically use it.
		if (configJson.instances.length === 1) {
			instance = configJson.instances[0];
			return cb();
		}

		options.inquirer.prompt([{
			type: 'list',
			name: 'instanceUrl',
			choices: _.map(configJson.instances, 'url'),
			message: 'Select instance:',
			default: _.find(configJson.instances, {
				default: true
			})
		}], function(answers) {
			debugger;
			instance = _.find(configJson.instances, {
				url: answers.instanceUrl
			});
			cb();
		});
	});

	// Check for an existing JWT in the config
	seriesTasks.push(function(cb) {
		debug("check for existing jwt");

		// See if we have a login token
		if (_.isObject(instance.jwt) === false)
			return cb();

		// If the JWT is expired, force user to login again.
		if (_.isNumber(instance.jwt.expires) === false ||
			Date.now() > instance.jwt.expires) {
			instance.jwt = null;
		}

		cb();
	});

	seriesTasks.push(function(cb) {
		debug("prompt for credentials");

		// If we already have a valid JWT, don't force user
		// to login again.
		if (instance.jwt) return cb();

		// Prompt for login
		options.inquirer.prompt([{
			type: 'input',
			name: 'username',
			message: 'Username:',
		}, {
			type: 'password',
			name: 'password',
			message: 'Password:'
		}], function(answers) {
			// Make the api login call.
			options.api.login(answers.username, answers.password, function(err, jwt) {
				if (err) return cb(err);

				// Write the JWT to the configFile for future logins
				instance.jwt = jwt;
				cb();
			});
		});
	});

	async.series(seriesTasks, function(err) {
		if (err) return callback(err);

		// Save the configJson file with any changes
		fs.writeFile(options.configFilePath, JSON.stringify(configJson, null, 2), function(err) {
			if (err) return callback(err);

			debugger;
			// Return the json web token back
			callback(null, instance.jwt);
		});
	});
};
