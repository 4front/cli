var assert = require('assert');
var async = require('async');
var sinon = require('sinon');
var shortid = require('shortid');
var _ = require('lodash');
var path = require('path');
var parseUrl = require('url').parse;
var rimraf = require('rimraf');
var log = require('../lib/log');
var fs = require('fs');
var request = require('request');
var inquirer = require('inquirer');
var deploy = require('../commands/deploy');
var os = require('os');
var mockSpawn = require('./mock-spawn');
var mockInquirer = require('./mock-inquirer');

require('dash-assert');

describe('create-app', function() {
  var self;

	beforeEach(function(done) {
    self = this;

    this.program = {
      profile: {
        name: 'default',
        url: 'https://apphost.com/',
        jwt: {
          token: '23523454'
        }
      },
      virtualApp: {
        appId: shortid.generate()
      },
      virtualAppConfig: {
        baseDir: {
          release: os.tmpdir()
        }
      }
    };

    this.mockAnswers = {
      appName: 'test-app',
      platformUrl: 'https://apphost.com',
      username: 'username',
      password: 'password'
    };

    this.mockInquirer = require('./mock-inquirer')(this.mockAnswers);

    sinon.stub(log, 'write', _.noop());

    // Stub the PUT api call to activate the version
    sinon.stub(request, 'put', function(options, callback) {
      callback(null, {statusCode: 200}, _.extend(options.json, {
        active: true
      }));
    });

    // Stub the POST api calls to deploy a file and create a new version.
    sinon.stub(request, 'post', function(options, callback) {
      // Mock the create app post request
      if (options.url.indexOf('/deploy')) {
        callback(null, {statusCode: 201});
      }
      else {
        callback(null, _.extend(options.json, {
          appId: self.program.virtualApp.appId,
          versionId: shortid.generate()
        }));
      }
    });

    sinon.stub(inquirer, 'prompt', this.mockInquirer.prompt);
    sinon.stub(childProcess, 'spawn', mockSpawn);

    rimraf(path.join(os.tmpdir(), 'test-app'), done);
	});

  afterEach(function() {
    request.post.restore();
    request.head.restore();
    request.get.restore();
    inquirer.prompt.restore();
    log.write.restore();
    childProcess.spawn.restore();
  });

});
