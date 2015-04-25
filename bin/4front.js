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
var cliInit = require('../lib/cli-init');
var virtualAppConfig = require('../lib/virtual-app-config');
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

program.version(pkg.version)
	.option('--debug', 'Emit debug messages')
	.option('--token [token]', 'JSON web token')
	.option('--profile [profileName]', 'Name of the profile')

// Create new application
program
	.option('--template-url [templateUrl]',
		'URL to a zip file containing the code to scaffold the new app from.')
	.command('create-app')
	.description('Create a new 4front app')
	.action(commandAction('create-app', {
		requireAuth: true,
		loadVirtualApp: false,
		loadVirtualAppConfig: false
	}));

// List the applications for an organization
program
	.command('list-apps')
	.description('List the applications for an organization')
	.action(commandAction('list-apps', {
		requireAuth: true,
		loadVirtualApp: false,
		loadVirtualAppConfig: false
	}));


// Add a new profile
program
	.option('--profile-url [profileUrl]', "The url of the 4front instance")
	.command('add-profile')
	.description("Register a new profile")
	.action(commandAction('add-profile', {
		requireAuth: false,
		loadVirtualAppConfig: false,
		loadVirtualApp: false
	}));

program
	.option('--profile-name [profileName]', "The name of the profile to remove")
	.command('remove-profile')
	.description('Remove a profile from the 4front config')
	.action(commandAction('remove-profile', {
		requireAuth: false,
		loadVirtualAppConfig: false,
		loadVirtualApp: false
	}));

program
	.command('bind-app')
	.description('Bind the current directory to an existing 4front app')
	.action(commandAction('appBind', {
		loadVirtualAppConfig: false
	}));

// Launch the developer sandbox
program
	.option('-o, --open', 'Open a browser to the local server')
	.option('--release', 'Run in release mode')
	.option('--port [portNumber]', 'Port number to listen on')
	.command('sandbox')
	.description("Start the developer sandbox environment")
	.action(commandAction('dev', {
		requireAuth: true,
		loadVirtualApp: true,
		loadVirtualAppConfig: true
	}));

// Deploy app
program
	.option('-x, --unattended', 'Run in unattended mode')
	.option('--version-name [versionName]', 'Version name')
	.option('-m, --message [message]', 'Version message')
	.option('-f, --force', 'Force all production traffic to the new version')
	.option('--appId [appId]',
		'Set appId (in place of the one defined in package.json')
	.command('deploy')
	.description('Deploy a new version of the app')
	.action(commandAction('deploy', {
		requireAuth: true,
		loadVirtualApp: true,
		loadVirtualAppConfig: true
	}));

// Set the default profile
program
	.command('default-profile')
	.action(commandAction('default-profile'));

program.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp();
}

process.on('exit', function(code) {
	log.debug("Exiting");
});

function commandAction(name, commandOptions) {
	// Extend any options from program to options.
	return function() {

		_.defaults(program, {
			globalConfigPath: path.join(osenv.home(), '.4front.json'),
			build: 'debug',
			cwd: process.cwd()
		});

		if (program.release)
			program.build = 'release';

		cliInit(program, commandOptions, function(err) {
			if (err) {
				log.error(err);
				return process.exit();
			}

			// Run the command
			require('../commands/' + name)(program, function(err, onKill) {
				if (err) {
					if (err instanceof Error)
						log.error(Error.publicMessage(err));
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
