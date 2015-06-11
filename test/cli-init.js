var assert = require('assert');
var sinon = require('sinon');
var shortid = require('shortid');
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var request = require('request');
var inquirer = require('inquirer');
var log = require('../lib/log');
var mockInquirer = require('./mock-inquirer');
var cliInit = require('../lib/cli-init');
var os = require('os');

require('dash-assert');

describe('cliInit', function() {
	before(function() {
		sinon.stub(log, 'write', _.noop());
	});

	after(function() {
		log.write.restore();
	});

	beforeEach(function() {
    this.user = {
			userId: shortid.generate(),
			jwt: {
				token: 'adfasdfasdfasdf',
				expires: Date.now() + (1000 * 60 * 30)
			}
		};

    this.mockAnswers = {
      endpoint: 'https://apphost.com',
      username: 'username',
      password: 'password',
			identityProvider: 'ActiveDirectory'
    };

    this.mockInquirer = require('./mock-inquirer')(this.mockAnswers);

    sinon.stub(request, 'post').yields(null, {statusCode: 200}, this.user);

		sinon.stub(request, 'get', function(options, callback) {
			if (options.path.indexOf('/apps/') == 0)
				callback(null, {statusCode: 200}, {
					appId: _.last(options.path.split('/'))
				});
			else
				callback(new Error("Unexpected get request " + options.url));
		});

    sinon.stub(inquirer, 'prompt', this.mockInquirer.prompt);
		sinon.stub()

		this.commandOptions = {
			loadVirtualApp: false,
			loadManifest: false,
			requireAuth: true
		};

		this.program = {
			globalConfigPath: path.join(os.tmpdir(), '.4front.json')
		};
	});

	afterEach(function(done) {
		request.post.restore();
		request.get.restore();
    inquirer.prompt.restore();

    fs.unlink(this.program.globalConfigPath, function(err) {
			done();
		});
	});

	it('missing global config file', function(done) {
    var self = this;

		cliInit(this.program, this.commandOptions, function(err) {
			assert.isTrue(self.mockInquirer.wasAsked('endpoint'));
			assert.isTrue(self.mockInquirer.wasAsked('identityProvider'));
			assert.isTrue(self.mockInquirer.wasAsked('username'));
			assert.isTrue(self.mockInquirer.wasAsked('password'));

			assert.equal(self.program.profile.endpoint, self.mockAnswers.endpoint);

			assert.isMatch(request.post.args[0][0], {
				method: 'POST',
				json: {
					username: 'username',
					password: 'password'
				},
				path: '/profile/login'
			});

			var globalConfig = JSON.parse(fs.readFileSync(self.program.globalConfigPath).toString());

			assert.deepEqual(globalConfig.profiles[0], {
				endpoint: self.mockAnswers.endpoint,
				name: 'default',
				default: true,
				jwt: self.user.jwt,
				identityProvider: self.mockAnswers.identityProvider
			});

			done();
		});
	});

	it('corrupt global config file', function(done) {
    var self = this;
		fs.writeFileSync(this.program.globalConfigPath, "invalid json");

		cliInit(this.program, this.commandOptions, function(err) {
			assert.isTrue(self.mockInquirer.wasAsked('endpoint'));
			assert.isTrue(self.mockInquirer.wasAsked('identityProvider'));
			assert.isTrue(self.mockInquirer.wasAsked('username'));
			assert.isTrue(self.mockInquirer.wasAsked('password'));
			assert.isTrue(request.post.called);
      done();
		});
	});

	it('uses the specified profile', function(done) {
    var self = this;
		fs.writeFileSync(this.program.globalConfigPath, JSON.stringify({
			profiles: [{
				name: 'host1',
				endpoint: "https://host1.com",
			}, {
				name: 'host2',
				endpoint: "https://host2.com",
				identityProvider: 'BitBucket'
			}]
		}, null, 2));

		this.program.profile = 'host2';
		cliInit(this.program, this.commandOptions, function(err) {
			assert.equal(self.program.profile.endpoint, 'https://host2.com');

			assert.isTrue(request.post.calledWith(sinon.match({
				json: {
					username: self.mockAnswers.username,
					password: self.mockAnswers.password,
					identityProvider: 'BitBucket'
				}
			})));

			done();
		});
	});

	it('default profile is used if none specified', function(done) {
    var self = this;
		fs.writeFileSync(this.program.globalConfigPath, JSON.stringify({
			profiles: [{
				name: 'host1',
				endpoint: "https://host1.com"
			}, {
				name: 'host2',
				endpoint: "https://host2.com",
				default: true
			}]
		}, null, 2));

		cliInit(this.program, this.commandOptions, function(err) {
			assert.equal(self.program.profile.endpoint, 'https://host2.com');

			done();
		});
	});

	it('first profile used as fallback', function(done) {
    var self = this;
		fs.writeFileSync(this.program.globalConfigPath, JSON.stringify({
			profiles: [{
				name: 'host1',
				endpoint: "https://host1.com"
			}, {
				name: 'host2',
				endpoint: "https://host2.com"
			}]
		}, null, 2));

		cliInit(this.program, this.commandOptions, function(err) {
			assert.equal(self.program.profile.endpoint, 'https://host1.com');

			done();
		});
	});

	it('expired token still requires user to login', function(done) {
    var self = this;
		// Write config file with an expired jwt
		fs.writeFileSync(this.program.globalConfigPath, JSON.stringify({
			profiles: [{
				endpoint: "https://host1.com",
				jwt: _.extend(this.jwt, {
					expires: Date.now() - 1000
				})
			}]
		}, null, 2));

		cliInit(this.program, this.commandOptions, function(err) {
			if (err) return done(err);

			// login api should still be called
			assert.isTrue(self.mockInquirer.wasAsked('username'));
			assert.isTrue(self.mockInquirer.wasAsked('password'));
			assert.isTrue(request.post.called);

			done();
		});
	});

	it('valid token skips login', function(done) {
    var self = this;
		_.extend(this.user.jwt, {
			expires: Date.now() + (1000 * 60)
		});

		fs.writeFileSync(this.program.globalConfigPath, JSON.stringify({
			profiles: [{
				endpoint: "https://host1.com",
				jwt: self.user.jwt
			}]
		}, null, 2));

		cliInit(this.program, this.commandOptions, function(err) {
			if (err) return done(err);

			// login api should still be called
			assert.isFalse(self.mockInquirer.wasAsked('username'));
			assert.isFalse(self.mockInquirer.wasAsked('password'));
			assert.isFalse(request.post.called);
			assert.deepEqual(self.program.profile.jwt, self.user.jwt);

			done();
		});
	});

	describe('load virtual app', function() {
		var self;

		beforeEach(function(done) {
			self = this;
			writeValidGlobalConfig(this);

			this.appId = shortid.generate();

			this.tmpAppDir = path.join(os.tmpdir(), this.appId);

			// Write a valid package.json in the app directory
			fs.mkdir(this.tmpAppDir, function(err) {
				var packageJson = {
					_virtualApp: {
						appId: self.appId
					}
				};

				fs.writeFileSync(path.join(self.tmpAppDir, 'package.json'), JSON.stringify(packageJson));
				done();
			});

			this.program.cwd = this.tmpAppDir;
			_.extend(this.commandOptions, {
				loadVirtualApp: true,
				loadManifest: true
			});
		});

		afterEach(function(done) {
			fs.unlink(this.tmpAppDir, function() {
				done();
			});
		});

		it('loads virtualAppManifest and virtualApp', function(done) {
			cliInit(this.program, this.commandOptions, function(err) {
				if (err) return done(err);

				assert.isTrue(request.get.calledWith(sinon.match({path: '/apps/' + self.appId})));
				assert.equal(self.program.virtualAppManifest.appId, self.appId);
				assert.equal(self.program.virtualApp.appId, self.appId);

				done();
			});
		});

		it('allows appId to be overridden', function(done) {
			this.program.appId = shortid.generate();

			cliInit(this.program, this.commandOptions, function(err) {
				if (err) return done(err);

				assert.isTrue(request.get.calledWith(sinon.match({path: '/apps/' + self.program.appId})));
				assert.equal(self.program.virtualAppManifest.appId, self.program.appId);
				assert.equal(self.program.virtualApp.appId, self.program.appId);

				done();
			});
		});
	});

	function writeValidGlobalConfig(self) {
		fs.writeFileSync(self.program.globalConfigPath, JSON.stringify({
			profiles: [{
				endpoint: "https://host1.com",
				jwt: self.user.jwt
			}]
		}, null, 2));
	}
});
