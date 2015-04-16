#!/usr/bin/env node

var program = require('commander');
var chalk = require('chalk');
var inquirer = require('inquirer');
var osenv = require('osenv');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var async = require('async');
var log = require('../lib/log');
var updateNotifier = require('update-notifier');
var shortid = require('shortid');
var login = require('../lib/login');
var virtualAppConfig = require('virtual-app-config');
var pkg = require('../package.json');

require('simple-errors');

// Limit any generated IDs to alpha-numeric characters
shortid.characters(
	'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$-');

updateNotifier({
	packageName: pkg.name,
	packageVersion: pkg.version,
	updateCheckInterval: 1000 * 60 * 60 * 2 // Check for updates every 2 hours
}).notify();

program.configFilePath: path.join(osenv.home(), '.4front');

program.version(require('../package.json').version)
	.option('-d, --debug', 'Emit debug messages')
	.option('--token [token]', 'JSON web token')
	.option('-p, --port [portNumber]', 'Port number to listen on')
	.option('--profile [profileName]', 'Specify which profile to use')

program
	.option('--template-url [templateUrl]',
		'GitHub repo to scaffold a new app from. Specify owner/repoName')
	.command('create-app')
	.description('Create a new 4front app')
	.action(commandAction('create-app', {
		loadVirtualAppConfig: false
	}));

program
	.command('bind-app')
	.description('Bind the current directory to an existing Aerobatic app')
	.action(commandAction('appBind', {
		loadVirtualAppConfig: false
	}));

program
	.option('-o, --open', 'Open a browser to the local server')
	.option('--release', 'Run in release mode')
	.command('sandbox')
	.description("Start the developer sandbox environment")
	.action(commandAction('sandbox'));

program
// .option('-o, --open', 'Open a browser to the simulator host')
	.command('sim')
	.description("Run the simulator server")
	.action(commandAction('serve', {
		simulator: true
	}));

program
	.option('-x, --unattended', 'Run in unattended mode')
	.option('--version-name [versionName]', 'Version name')
	.option('-m, --message [message]', 'Version message')
	.option('-f, --force', 'Force all production traffic to the new version')
	.option('--appId [appId]',
		'Set appId (in place of the one defined in package.json')
	.command('deploy')
	.description('Deploy a new version of the app')
	.action(commandAction('deploy'));

// Set the default profile
program
	.command('default-profile')
	.action(commandAction('default-profile'));

program
	.command('*')
	.action(function(env) {
		log.error("Not a valid command. Type 'yoke -h' for help.")
		process.exit();
	});

program.parse(process.argv);

process.on('exit', function(code) {
	log.info("Exiting");
});

function commandAction(name, options) {
	// Extend any options from program to options.
	return function() {
		_.defaults(options, {
			requireAuth: true,
			loadVirtualAppConfig: true,
			loadVirtualApp: true
		});

		var initTasks = [];
		if (requireAuth === true) {
			tasks.push(function(cb) {
				login(program, function(err, jwt) {
					if (err) return cb(err);

					// Save the JWT for use in subsequent API calls.
					program.jwt = jwt;
					cb();
				});
			});
		}

		if (options.loadVirtualAppConfig === true) {
			initTasks.push(function(cb) {
				log.debug("loading virtual app config from package.json");
				virtualAppConfig.load(program, function(err, config) {
					if (err) return cb(err);

					program.virtualAppConfig = config;
					cb();
				});
			});
		}

		if (options.loadVirtualAppConfig && options.loadVirtualApp) {
			initTasks.push(function(cb) {
				log.debug("invoking api to fetch the virtual app");
				api(program, {method: 'GET', '/apps/' + program.virtualAppConfig.appId}, function(err, app) {
					if (err) return cb(err);

					if (!app)
						return cb("Application " + program.appId + " could not be found.");

					program.virtualApp = app;
				})
			});
		}

		async.series(initTasks, function(err) {
			if (err) {
				log.error(err);
				return process.exit();
			}

			// Run the command
			require('../commands/' + name)(program, function(err, onKill) {
				if (err) {
					if (err instanceof Error)
						log.error(err.stack || err.toString());
					else if (_.isString(err))
						log.error(err);

					process.exit();
				}

				// Don't shutdown the process if keepAlive is specified.
				//TODO: Could we print a message in the bottom bar with a message for how to stop?
				if (!_.isFunction(onKill))
					process.exit();
				else {
					// Wait for SIGINT to cleanup the command
					process.on('exit', function() {
						onKill();
					});
				}
			});
		});
	};
}
