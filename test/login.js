var assert = require('assert');
var sinon = require('sinon');
var shortid = require('shortid');
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var request = require('request');
var inquirer = require('inquirer');
var mockInquirer = require('./mock-inquirer');
var login = require('../lib/login');
var os = require('os');

require('dash-assert');

describe('login', function() {
	beforeEach(function() {
    this.jwt = {
			user: {
				userId: shortid.generate()
			},
			token: 'adfasdfasdfasdf',
			expires: Date.now() + (1000 * 60 * 30)
		};

    this.mockAnswers = {
      platformUrl: 'https://apphost.com',
      username: 'username',
      password: 'password'
    };

    this.mockInquirer = require('./mock-inquirer')(this.mockAnswers);

    sinon.stub(request, 'post').yields(null, {statusCode: 200}, this.jwt);
    sinon.stub(inquirer, 'prompt', this.mockInquirer.prompt);

		this.program = {
			configFilePath: path.join(os.tmpdir(), shortid.generate() + '.json')
		};
	});

	afterEach(function(done) {
		request.post.restore();
    inquirer.prompt.restore();

    fs.unlink(this.program.configFilePath, done);
	});

	it('missing config file', function(done) {
    var self = this;

		login(this.program, function(err, jwt) {
			assert.isTrue(self.mockInquirer.wasAsked('platformUrl'));
			assert.isTrue(self.mockInquirer.wasAsked('username'));
			assert.isTrue(self.mockInquirer.wasAsked('password'));

			assert.equal(self.program.platformUrl, self.mockAnswers.platformUrl);

			assert.isMatch(request.post.args[0][0], {
				method: 'POST',
				json: {
					username: 'username',
					password: 'password'
				},
				path: '/profile/login'
			});

			var config = JSON.parse(fs.readFileSync(self.program.configFilePath).toString());

			assert.deepEqual(config.profiles[0], {
				platformUrl: self.mockAnswers.platformUrl,
				name: 'default',
				default: true,
				jwt: self.jwt
			});

			done();
		});
	});

	it('corrupt config file', function(done) {
    var self = this;
		fs.writeFileSync(this.program.configFilePath, "invalid json");

		login(this.program, function(err, jwt) {
			assert.isTrue(self.mockInquirer.wasAsked('platformUrl'));
			assert.isTrue(self.mockInquirer.wasAsked('username'));
			assert.isTrue(self.mockInquirer.wasAsked('password'));
			assert.isTrue(request.post.called);
      done();
		});
	});

	it('uses the specified profile', function(done) {
    var self = this;
		fs.writeFileSync(this.program.configFilePath, JSON.stringify({
			profiles: [{
				name: 'host1',
				platformUrl: "https://host1.com"
			}, {
				name: 'host2',
				platformUrl: "https://host2.com"
			}]
		}, null, 2));

		this.program.profile = 'host2';
		login(this.program, function(err, jwt) {
			assert.equal(self.program.platformUrl, 'https://host2.com');

			done();
		});
	});

	it('default profile is used if none specified', function(done) {
    var self = this;
		fs.writeFileSync(this.program.configFilePath, JSON.stringify({
			profiles: [{
				name: 'host1',
				platformUrl: "https://host1.com"
			}, {
				name: 'host2',
				platformUrl: "https://host2.com",
				default: true
			}]
		}, null, 2));

		login(this.program, function(err, jwt) {
			assert.equal(self.program.platformUrl, 'https://host2.com');

			done();
		});
	});

	it('first profile used as fallback', function(done) {
    var self = this;
		fs.writeFileSync(this.program.configFilePath, JSON.stringify({
			profiles: [{
				name: 'host1',
				platformUrl: "https://host1.com"
			}, {
				name: 'host2',
				platformUrl: "https://host2.com"
			}]
		}, null, 2));

		login(this.program, function(err, jwt) {
			assert.equal(self.program.platformUrl, 'https://host1.com');

			done();
		});
	});

	it('expired token still requires user to login', function(done) {
    var self = this;
		// Write config file with an expired jwt
		fs.writeFileSync(this.program.configFilePath, JSON.stringify({
			profiles: [{
				platformUrl: "https://host1.com",
				jwt: _.extend(this.jwt, {
					expires: Date.now() - 1000
				})
			}]
		}, null, 2));

		login(this.program, function(err, jwt) {
			// login api should still be called
			assert.isTrue(self.mockInquirer.wasAsked('username'));
			assert.isTrue(self.mockInquirer.wasAsked('password'));
			assert.isTrue(request.post.called);

			done();
		});
	});

	it('valid token skips login', function(done) {
    var self = this;
		_.extend(this.jwt, {
			expires: Date.now() + (1000 * 60)
		});

		fs.writeFileSync(this.program.configFilePath, JSON.stringify({
			profiles: [{
				platformUrl: "https://host1.com",
				jwt: this.jwt
			}]
		}, null, 2));

		login(this.program, function(err, jwt) {
			// login api should still be called
			assert.isFalse(self.mockInquirer.wasAsked('username'));
			assert.isFalse(self.mockInquirer.wasAsked('password'));
			assert.isFalse(request.post.called);
			assert.deepEqual(jwt, self.jwt);

			done();
		});
	});
});
