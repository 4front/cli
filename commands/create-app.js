var chalk = require('chalk');
var async = require('async');
var request = require('request');
var _ = require('lodash');
// var zlib = require('zlib');
var tar = require('tar');
var fs = require('fs');
var urljoin = require('url-join');
var path = require('path');
var inquirer = require('inquirer');
var spawn = require('../lib/spawn');
var api = require('../lib/api');
var log = require('../lib/log');
// var npmConfig = require('../lib/npmConfig');
var helper = require('../lib/helper');

require("simple-errors");

module.exports = function(program, done) {
	// if (program.githubRepo) {
	// 	program.githubRepo = helper.parseGithubRepo(program.githubRepo);
	// 	if (program.githubRepo === false) {
	// 		return done("Invalid github-repo option");
	// 	}
	// }

	program = _.defaults(program || {}, {
		templatesUrl: 'https://raw.githubusercontent.com/aerobatic/markdown-content/master/metadata/appTemplates.json',
		// githubUrl: 'https://github.com',
		baseDir: process.cwd()
	});

	log.messageBox("Create a new 4front app");

	collectInput(function(err, answers) {
		if (err) return done(err);

		// Print a blank line at the end of the questionaire
		log.blankLine();

		if (answers.confirmExistingDir === false)
			return done("Please re-run '4front create-app' from the root of the " +
				"directory where your existing app code resides.");

		var tasks = [], appDir;
		if (answers.startingMode === 'scratch' || program.githubRepo) {
			// Create a new directory corresponding to the app name
			appDir = path.join(program.baseDir, answers.appName);
			tasks.push(function(cb) {
				log.info("Making app directory %s", appDir);
				fs.mkdir(appDir, cb);
			});
		}
		else
			appDir = program.baseDir;

		log.debug("Setting appDir to %s", appDir);

		if (answers.template === 'none') {
			// Make a new package.json from scratch
			tasks.push(function(cb) {
				createBlankStart(answers, appDir, cb);
			});
		}
		else if (answers.template) {
			tasks.push(function(cb) {
				unpackTemplate(answers.template.githubRepo, null, appDir, cb);
			});
		}
		else if (program.githubRepo) {
			tasks.push(function(cb) {
				unpackTemplate(program.githubRepo, program.githubBranch, appDir, cb);
			});
		}

		tasks.push(function(cb) {
			npmInstall(appDir, cb);
		});

		tasks.push(function(cb) {
			bowerInstall(appDir, cb);
		});

		var createdApp = null;
		// Call the API to create the app.
		tasks.push(function(cb) {
			invokeCreateAppApi(answers, function(err, app) {
				if (err) return cb(err);
				createdApp = app;
				cb(null);
			});
		});

		// Update the package.json
		// tasks.push(function(cb) {
		// 	npmConfig(appDir, createdApp, cb);
		// });

		async.series(tasks, function(err) {
			if (err) return done(err);

			var message = "App created successfully at:\n" + createdApp.url +
				"\n\n";

			if (answers.existing === true)
				message += "To start developing run:\n$ 4front serve -o";
			else
				message += "To start developing run:\n$ cd " + createdApp.name +
				"\n\nThen:\n$ 4front serve -o";

			message +=
				"\n\nWhen you are ready to deploy, simply run:\n$ 4front deploy";
			log.messageBox(message);

			done(null, createdApp);
		});
	});

	function collectInput(callback) {
		async.parallel({
			templates: loadStarterTemplates,
			organizations: loadOrganizations
		}, function(err, results) {
			if (err) return callback(err);

			debugger;
			if (results.organizations.length == 0)
				return callback(
					"You need to belong to an organization to create a new app. Visit " + urljoin(program.platformUrl, '/portal/orgs/create') + " to get started."
				);

			promptQuestions(results, callback);
		});
	}

	function loadStarterTemplates(callback) {
		log.debug("fetching app templates");
		api(program, {
			method: 'GET',
			path: '/system/templates'
		}, function(err, templates) {
			if (err) return callback(err);
			callback(null, templates);
		});
	}

	function loadOrganizations(callback) {
		// Get the user's organizations
		log.debug("fetching organizations");
		api(program, {
			method: 'GET',
			path: '/profile/orgs'
		}, function(err, orgs) {
			if (err) return callback(err);
			callback(null, orgs);
		});
	}

	function promptQuestions(lookups, callback) {
		var questions = [];

		var orgChoices = [];
		_.each(lookups.organizations, function(org) {
			orgChoices.push({
				name: org.name,
				value: org.orgId
			});
		});

		// Question to choose which organization the app belongs
		if (_.isArray(lookups.organizations) && lookups.organizations.length > 0) {
			questions.push({
				type: 'list',
				name: 'orgId',
				choices: orgChoices,
				message: "Which organization does this app belong?"
			});
		}

		questions.push({
			type: 'list',
			name: 'startingMode',
			choices: [{
				name: 'Starting from scratch',
				value: 'scratch'
			}, {
				name: 'Existing code',
				value: 'existing'
			}],
			default: null,
			when: function() {
				// If a GitHub repo was passed in from the command line we are
				// by definition starting from scratch.
				return !program.githubRepo;
			},
			message: "Are you starting this app from existing code or from scratch?"
		});

		// For existing code apps, have dev confirm that the current directory
		// is where their app code is located.
		questions.push({
			type: 'confirm',
			name: 'confirmExistingDir',
			message: 'Is this directory ' + program.baseDir +
				' the location of your existing code?',
			when: function(answers) {
				return answers.startingMode === 'existing';
			}
		});

		// Prompt user for which app template to start from
		questions.push({
			type: 'list',
			message: 'Select app template to start from',
			name: 'templateUrl',
			when: function(answers) {
				return answers.startingMode === 'scratch';
			},
			choices: buildTemplateChoices(lookups.templates)
		});

		inquirer.prompt(questions, function(answers) {
			if (answers.confirmExistingDir === false)
				return callback(answers);

			collectAppName(function(err, appName) {
				if (err) return callback(err);

				answers.appName = appName;
				callback(null, answers);
			})
		});
	}

	function collectAppName(callback) {
		log.messageBox(
			"Please choose a name for your app which will be used as\nthe URL, i.e. http://<app_name>.aerobaticapp.com>.\nNames may only contain lowercase letters, numbers, \ndashes, and underscores."
		);

		var question = {
			type: 'input',
			message: 'App name',
			name: 'appName',
			validate: function(input) {
				if (!/^[a-z0-9-_]+$/.test(input))
					return "Invalid app name";
				else
					return true;
			}
		};

		var appName = null;

		// Keep prompting for an appname until one is chosen that doesn't already exist.
		async.until(function() {
			return appName != null;
		}, function(cb) {
			inquirer.prompt([question], function(answers) {
				appNameExists(answers.appName, function(err, exists) {
					if (exists)
						console.log(chalk.red(">>") + " App name \"" + answers.appName +
							"\" is already taken. Please choose another name.");
					else
						appName = answers.appName;

					cb();
				});
			});
		}, function(err) {
			if (err) return callback(err);
			callback(null, appName);
		});
	}

	function buildTemplateChoices(templates) {
		var choices = [];
		choices.push({
			name: 'None',
			value: 'none'
		});

		templates.forEach(function(template, i) {
			if (template.published !== false)
				choices.push({
					name: template.name,
					value: template.url
				});
		});

		return choices;
	}

	function npmInstall(appDir, callback) {
		fs.exists(path.join(appDir, 'package.json'), function(exists) {
			if (!exists) {
				return callback("No package.json file exists in app directory");
			}

			// If th node_modules directory already exists, assume npm install already run
			if (fs.exists(path.join(appDir, 'node_modules')))
				return callback();

			log.info("Installing npm dependencies in %s", appDir);
			spawn('npm', ['install'], {
				cwd: appDir,
				inheritStdio: true
			}, callback);
		});
	}

	function bowerInstall(appDir, callback) {
		fs.exists(path.join(appDir, 'bower.json'), function(exists) {
			if (!exists) {
				log.debug("No bower.json file exists in app directory");
				return callback();
			}

			log.info("Installing bower dependencies");
			spawn('bower', ['install'], {
				cwd: appDir,
				inheritStdio: true
			}, callback);
		});
	}

	// function unpackTemplate(githubRepo, githubBranch, appDir, callback) {
	// 	if (_.isEmpty(githubBranch) === true)
	// 		githubBranch = 'master';
	//
	// 	// Download, unzip, and extract the template from GitHub repo.
	// 	var archiveUrl = program.githubUrl + '/' + githubRepo + '/archive/' +
	// 		githubBranch + '.tar.gz';
	// 	log.info("Unpacking template %s", archiveUrl);
	//
	// 	request(archiveUrl)
	// 		.pipe(zlib.createGunzip())
	// 		.pipe(tar.Extract({
	// 			path: appDir,
	// 			strip: 1
	// 		}))
	// 		.on('error', function(err) {
	// 			return callback(err);
	// 		})
	// 		.on('end', callback);
	// }

	function createBlankStart(answers, appDir, callback) {
		// Create the bare minimum app code required to run the simulator
		// which consists of a package.json with a name attribute and
		// a boilerplate index.html file.
		async.parallel([
			function(cb) {
				var packageJson = {
					name: answers.appName,
					_virtualApp: {}
				};

				fs.writeFile(path.join(appDir, 'package.json'),
					JSON.stringify(packageJson, null, 2), cb);
			},
			function(cb) {
				var blankHtml = "<html>\n" +
					"\t<head>\n" +
					"\t\t<title>Blank 4front App</title>\n" +
					"\t</head>\n" +
					"\t<body>\n" +
					"\t\t<h1>Blank 4front App</h1>\n" +
					"\t</body>"
				"</html>";

				fs.writeFile(path.join(appDir, 'index.html'), blankHtml, cb);
			}
		], callback);
	}

	function invokeCreateAppApi(answers, callback) {
		var appData = {
			name: answers.appName
		};

		if (answers.orgId)
			appData.orgId = answers.orgId;

		var options = {
			method: 'POST',
			path: '/apps',
			json: appData
		};

		log.info("Invoking 4front API to create app");
		var request = api(program, options, function(err, app) {
			if (err) return callback(err);

			log.debug("api post to /api/apps succeeded");
			callback(null, app);
		});
	}

	// Check if the specified app name is already in use by an app.
	function appNameExists(appName, callback) {
		var options = {
			method: 'HEAD',
			path: '/apps/' + appName
		};

		log.debug("checking if app name exists");
		api(program, options, function(err, body, statusCode) {
			if (err) return callback(err);

			return callback(null, statusCode === 200);
		});
	}
};
