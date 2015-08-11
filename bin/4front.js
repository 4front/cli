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
var debug = require('debug')('4front:cli');
var cliInit = require('../lib/cli-init');
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
	.option('--app-id [appId]', 'Set appId (in place of the one defined in package.json)')

// Create new application
program
	.option('--template-url [templateUrl]',
		'URL to a zip file containing the code to scaffold the new app from.')
	.command('create-app')
	.description('Create a new 4front app')
	.action(commandAction('create-app', {
		requireAuth: true,
		loadVirtualApp: false,
		loadManifest: false
	}));

program
	.command('delete-app')
	.description('Delete an existing 4front app')
	.action(commandAction('delete-app', {
		requireAuth: true,
		loadVirtualApp: true,
		loadManifest: true
	}));

// List the applications for an organization
program
	.command('list-apps')
	.description('List the applications for an organization')
	.action(commandAction('list-apps', {
		requireAuth: true,
		loadVirtualApp: false,
		loadManifest: false
	}));

// Create a new organization
program
	.option('--org-name [orgName]', "The name of the organization")
	.command('create-organization')
	.description("Create a new organization")
	.action(commandAction("create-org", {
		requireAuth: true,
		loadManifest: false,
		loadVirtualApp: false
	}));

// Add a new profile
program
	.option('--endpoint [endpoint]', "The url endpoint for the 4front instance")
	.option('--profile-name [name]', "The name of the 4front profile")
	.command('add-profile')
	.description("Register a new profile")
	.action(commandAction('add-profile', {
		requireAuth: false,
		loadManifest: false,
		loadVirtualApp: false
	}));

program
	.option('--profile-name [profileName]', "The name of the profile to remove")
	.command('remove-profile')
	.description('Remove a profile from the 4front config')
	.action(commandAction('remove-profile', {
		requireAuth: false,
		loadManifest: false,
		loadVirtualApp: false
	}));

program
	.command('bind-app')
	.description('Bind the current directory to an existing 4front app')
	.action(commandAction('appBind', {
		loadManifest: false
	}));

// Set an environment variable
program
	.option('--key [key]')
	.option('--value [value]')
	.option('--virtual-env [virtualEnv]')
	.option('--encrypt')
	.command('set-env')
	.description('Set an environment variable')
	.action(commandAction('env', {
		requireAuth: true,
		loadManifest: true,
		loadVirtualApp: true,
		subCommand: 'set'
	}));

// List the environment variables
program
	.command('list-env')
	.description('List the environment variables')
	.action(commandAction('env', {
		requireAuth: true,
		loadManifest: true,
		loadVirtualApp: true,
		subCommand: 'list'
	}));

// Launch the developer sandbox
program
	.option('-o, --open', 'Open a browser to the local server')
	.option('--release', 'Run in release mode')
	.option('--port <n>', 'Port number to listen on', parseInt)
	.option('-l, --liveReload', 'Inject livereload script into html pages')
	.command('dev')
	.description("Start the developer sandbox environment")
	.action(commandAction('dev-sandbox', {
		requireAuth: true,
		loadVirtualApp: true,
		loadManifest: true
	}));

// Deploy app
program
	.option('--unattended', 'Run in unattended mode')
	.option('--version-name [versionName]', 'Version name')
	.option('-m, --message [message]', 'Version message')
	.option('-f, --force', 'Force all production traffic to the new version')
	.command('deploy')
	.description('Deploy a new version of the app')
	.action(commandAction('deploy', {
		requireAuth: true,
		loadVirtualApp: true,
		loadManifest: true
	}));

program
	.command('login')
	.description("Login to 4front to generate a new JWT in the .4front.json file")
	.action(commandAction('login', {
		requireAuth: true,
		forceLogin: true,
		loadVirtualApp: false,
		loadManifest: false
	}));

// Set the default profile
program
	.command('default-profile')
	.action(commandAction('default-profile'));

program.command('*')
	.action(function() {
		log.error("Invalid command " + process.argv.slice(2));
	});

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
			cwd: process.cwd(),
			subCommand: commandOptions.subCommand
		});

		if (program.release)
			program.build = 'release';

		cliInit(program, commandOptions, function(err) {
			if (err) {
				if (err.status === 401)
					log.error("Invalid credentials");
				else
					log.error(err);

				return process.exit(1);
			}

			// Run the command
			debug("run command %s", name);
			require('../commands/' + name)(program, function(err, onKill) {
				if (err) {
					debug("error returned from command %o", err);
					if (err instanceof Error)
						log.error(err);
					else if (_.isString(err))
						log.error(err);

					process.exit(1);
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
