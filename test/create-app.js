var assert = require('assert');
var sinon = require('sinon');
var shortid = require('shortid');
var _ = require('lodash');
var path = require('path');
var log = require('../lib/log');
var fs = require('fs');
var request = require('request');
var inquirer = require('inquirer');
var mockInquirer = require('./mock-inquirer');
var createApp = require('../commands/create-app');
var os = require('os');

require('dash-assert');

describe('create-app', function() {
  var self;

	beforeEach(function() {
    self = this;

    this.program = {
      platformUrl: 'https://apphost.com/',
      jwt: {
        token: '23523454'
      }
    };

    this.mockAnswers = {
      platformUrl: 'https://apphost.com',
      username: 'username',
      password: 'password'
    };

    this.mockInquirer = require('./mock-inquirer')(this.mockAnswers);
    this.mockOrgs = [{orgId: '1', name: 'org 1'}, {orgId: '2', name: 'org 2'}];

    this.logStub = sinon.stub(log);

    sinon.stub(request, 'get', function(options, callback) {
      switch (options.path) {
        case '/system/templates':
          return callback(null, {statusCode: 200}, self.mockTemplates);
          break;
        case '/profile/orgs':
          return callback(null, {statusCode: 200}, self.mockOrgs);
          break;
        default:
          throw new Error("Unexpected request " + options.path);
      }
    });

    sinon.stub(request, 'head', function(options, callback) {
      callback(null, {statusCode:404}, null);
    });

    sinon.stub(request, 'post', function(options, callback) {
      // Mock the create app post request
      if (options.url.indexOf('/apps')) {
        callback(null, {statusCode: 201}, self.mockOrgs);
      }
    });

    sinon.stub(inquirer, 'prompt', this.mockInquirer.prompt);
	});

  afterEach(function() {
    request.post.restore();
    request.head.restore();
    request.get.restore();
    inquirer.prompt.restore();
  });

  it('collect input', function(done) {
    this.mockTemplates = [{name: 'template1', url:'http://github.com/repo.tar.gz'}];

    _.extend(this.mockAnswers, {
      appName: 'test-app',
      templateUrl: this.mockTemplates[0].url,
      startingMode: 'scratch'
    });

    createApp(this.program, function(err) {
      if (err) return done(err);

      assert.isTrue(request.get.calledWith(
        sinon.match({url: 'https://apphost.com/api/profile/orgs'})))

      assert.isTrue(request.get.calledWith(
        sinon.match({url: 'https://apphost.com/api/system/templates'})))

      assert.isTrue(request.head.calledWith(
        sinon.match({url: 'https://apphost.com/api/apps/test-app'})))

      assert.isTrue(self.mockInquirer.wasAsked('orgId'))
      assert.isTrue(self.mockInquirer.wasAsked('appName'));
      assert.isTrue(self.mockInquirer.wasAsked('startingMode'));
      assert.isTrue(self.mockInquirer.wasAsked('templateUrl'));
      done();
    });
  });
});
