var assert = require('assert');
var async = require('async');
var sinon = require('sinon');
var express = require('express');
var http = require('http');
var shortid = require('shortid');
var _ = require('lodash');
var path = require('path');
var parseUrl = require('url').parse;
var rimraf = require('rimraf');
var log = require('../lib/log');
var fs = require('fs');
var request = require('request');
var inquirer = require('inquirer');
var mockInquirer = require('./mock-inquirer');
var createApp = require('../commands/create-app');
var os = require('os');

require('dash-assert');

var sampleTemplate = path.resolve(__dirname, "./fixtures/sample-app-template.zip");

describe('create-app', function() {
  var self;

	beforeEach(function(done) {
    self = this;

    this.program = {
      platformUrl: 'https://apphost.com/',
      jwt: {
        token: '23523454'
      }
    };

    this.mockAnswers = {
      appName: 'test-app',
      platformUrl: 'https://apphost.com',
      username: 'username',
      password: 'password'
    };

    this.mockInquirer = require('./mock-inquirer')(this.mockAnswers);
    this.mockOrgs = [{orgId: '1', name: 'org 1'}, {orgId: '2', name: 'org 2'}];
    this.mockTemplates = [{name: 'template1', url:'http://github.com/repo.tar.gz'}];

    // sinon.stub(log, 'writeln', _.noop());
    sinon.stub(log, 'write', _.noop());

    sinon.stub(request, 'get', function(options, callback) {
      var urlPath = parseUrl(options.url).pathname;
      switch (urlPath) {
        case '/api/platform/app-templates':
          return callback(null, {statusCode: 200}, self.mockTemplates);
          break;
        case '/api/profile/orgs':
          return callback(null, {statusCode: 200}, self.mockOrgs);
          break;
        case '/sample-app-template.zip':
          // Return the readStream directly. The way this call is made
          // request is not passing in a callback.
          return fs.createReadStream(sampleTemplate);
          break;

        default:
          throw new Error("Unexpected request " + urlPath);
      }
    });

    sinon.stub(request, 'head', function(options, callback) {
      callback(null, {statusCode:404}, null);
    });

    sinon.stub(request, 'post', function(options, callback) {
      // Mock the create app post request
      if (options.url.indexOf('/apps')) {
        callback(null, {statusCode: 201}, {
          appId: options.json.appId,
          name: options.json.name,
          url: 'https://' + options.json.name + '.apphost.com'
        });
      }
    });

    sinon.stub(inquirer, 'prompt', this.mockInquirer.prompt);

    rimraf(path.join(os.tmpdir(), 'test-app'), done);
	});

  afterEach(function() {
    request.post.restore();
    request.head.restore();
    request.get.restore();
    inquirer.prompt.restore();
    log.write.restore();
  });

  it('collect input', function(done) {
    _.extend(this.mockAnswers, {
      appName: 'test-app',
      templateUrl: 'none',
      startingMode: 'scratch'
    });

    createApp(this.program, function(err) {
      if (err) return done(err);

      assert.isTrue(request.get.calledWith(
        sinon.match({url: 'https://apphost.com/api/profile/orgs'})))

      assert.isTrue(request.get.calledWith(
        sinon.match({url: 'https://apphost.com/api/platform/app-templates'})))

      assert.isTrue(request.head.calledWith(
        sinon.match({url: 'https://apphost.com/api/apps/test-app'})))

      assert.isTrue(self.mockInquirer.wasAsked('orgId'))
      assert.isTrue(self.mockInquirer.wasAsked('appName'));
      assert.isTrue(self.mockInquirer.wasAsked('startingMode'));
      assert.isTrue(self.mockInquirer.wasAsked('templateUrl'));
      assert.isFalse(self.mockInquirer.wasAsked('confirmExistingDir'));
      done();
    });
  });

  describe('downloads starter template', function() {
    it('uses command line template arg', function(done) {
      _.extend(this.program, {
        templateUrl: "http://github.com/sample-app-template.zip",
        baseDir: os.tmpdir()
      });

      createApp(this.program, function(err) {
        if (err) return done(err);

        assert.isFalse(self.mockInquirer.wasAsked('startingMode'));

        // verify that the extracted contents from the template zip are present
        async.eachSeries(['index.html', 'js/app.js', 'css/styles.css'], function(file, cb) {
          var filePath = path.join(self.program.baseDir, self.mockAnswers.appName, file);

          fs.exists(filePath, function(exists) {
            assert.isTrue(exists);
            cb();
          });
        }, done);
      });
    });
  });
});