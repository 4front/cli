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
	var instanceUrl;

	seriesTasks.push(function(cb) {
		fs.exists(options.configFilePath, function(err, exists) {
			if (err) return cb(err);

			// The file exists, now make sure it is valid JSON.
			fs.readFile(configFilePath, function(err, data) {
				if (err) return cb(err);

				try {
					configJson = JSON.parse(data);
				}
				catch (jsonErr) {
					configJson = {};
					debug("Config file %s is corrupt", options.configFilePath);
				}
			});
		});
	});

	seriesTasks.push(function(cb) {
		// If there are no instances setup, prompt the user to set one up.
		if (_.isEmpty(configJson.instances)) {
			// Run the initalization flow
			prompt.message("No 4front instances have been configured. \n" +
				"Please enter the URL of your instance:");

			options.prompt.question({
				type: "input",
				message: "Instance URL:"
			}, function(err, answer) {
				if (err) return cb(err);

				// Make the new instance the default
				configJson.instances = [{
					url: answer,
					default: true
				}];
				cb();
			});
		}
	});

	// Prompt for which 4front instance to use
	seriesTasks.push(function(cb) {
		// If there is only one instance, automatically use it.
		if (configJson.instances.length === 1) {
			instance = configJson.instances[0];
			cb();
		}

		options.prompt.questions([{
			type: 'list',
			name: 'instanceUrl',
			choices: _.map(configJson.instances, 'url'),
			message: 'Select instance:',
			default: _.find(configJson.instances, {
				default: true
			})
		}], function(answers) {
			instance = _.find(configJson.instances, {
				url: answers.instanceUrl
			});
			cb();
		});
	});

	// Prompt for the username and password
	seriesTasks.push(function(cb) {
		// See if we have a login token
		if (_.isObject(instance.jwt) === false)
			return cb();

		// If the JWT is expired, force user to login again.
		if (_.isNumber(instance.jwt.expires) === false ||
			Date.now() > instance.jwt.expires)
			return cb();

		token = instance.jwt.token;
		cb();
	});

	seriesTasks.push(function(cb) {
		if (token) return cb();

		// Prompt for login
		options.prompt([{
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

				user = user;
			});
		});
	});

	async.series(seriesTasks, function(err) {
		if (err) return callback(err);

		// Save the configJson file with any changes
		fs.writeFile(configFilePath, JSON.stringify(configJson), function(err) {
			if (err) return callback(err);

			// Return the json web token back
			callback(null, instance.jwt);
		});
	});
};
