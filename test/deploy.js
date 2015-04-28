var assert = require('assert');
var async = require('async');
var sinon = require('sinon');
var shortid = require('shortid');
var _ = require('lodash');
var path = require('path');
var parseUrl = require('url').parse;
var rimraf = require('rimraf');
var through = require('through2');
var log = require('../lib/log');
var fs = require('fs');
var request = require('request');
var inquirer = require('inquirer');
var debug = require('debug')('4front:cli:test');
var deploy = require('../commands/deploy');
var os = require('os');
var childProcess = require('child_process');
var mockSpawn = require('./mock-spawn');
var mockInquirer = require('./mock-inquirer');

require('dash-assert');

describe('deploy', function() {
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
        appId: shortid.generate(),
        trafficControlEnabled: false
      },
      virtualAppManifest: {
        scripts: {}
      },
      cwd: path.join(os.tmpdir(), 'test-app')
    };

    this.mockAnswers = {};

    this.mockInquirer = require('./mock-inquirer')(this.mockAnswers);

    sinon.stub(log, 'write', _.noop());
    sinon.stub(childProcess, 'spawn', mockSpawn);

    // Stub the PUT api call to activate the version
    sinon.stub(request, 'put', function(options, callback) {
      callback(null, {statusCode: 200}, _.extend({}, options.json, {
        complete: true
      }));
    });

    // Stub the POST api calls to deploy a file and create a new version.
    sinon.stub(request, 'post', function(options, callback) {
      // Mock the create app post request
      if (options.url.indexOf('/deploy') > 0) {
        // Create a dummy write stream
        return through(function(chunk, enc, cb) {
          cb();
        }, function() {
          callback(null, {statusCode: 201});
        });
      }
      else {
        callback(null, {statusCode: 201}, _.extend(options.json, {
          appId: self.program.virtualApp.appId,
          versionId: shortid.generate()
        }));
      }
    });

    sinon.stub(inquirer, 'prompt', this.mockInquirer.prompt);

    async.series([
      function(cb) {
        rimraf(self.program.cwd, cb);
      },
      function(cb) {
        fs.mkdir(self.program.cwd, cb);
      },
      function(cb) {
        fs.writeFile(path.join(self.program.cwd, 'index.html'), '<html>', cb);
      },
      function(cb) {
        fs.writeFile(path.join(self.program.cwd, 'app.js'), '// app.js', cb);
      }
    ], done);
	});

  afterEach(function() {
    request.post.restore();
    request.put.restore();
    inquirer.prompt.restore();
    childProcess.spawn.restore();
    log.write.restore();
  });

  it('deploys new version', function(done) {
    _.extend(this.mockAnswers, {
      name: 'version-name',
      message: 'foo',
      runBuild: false
    });

    deploy(this.program, function(err) {
      if (err) return done(err);

      assert.ok(self.mockInquirer.wasAsked('name'));
      assert.ok(self.mockInquirer.wasAsked('message'));
      assert.isFalse(self.mockInquirer.wasAsked('runBuildStep'));

      assert.ok(request.post.calledWith(sinon.match({
        url: sinon.match('/versions'),
        json: sinon.match({
          name: 'version-name',
          message: 'foo'
        })
      })));

      assert.ok(request.post.calledWith(sinon.match({
        url: sinon.match('/deploy/index.html')
      })));

      assert.ok(request.post.calledWith(sinon.match({
        url: sinon.match('/deploy/app.js'),
        headers: sinon.match({
          'Content-Type': 'application/gzip'
        })
      })));

      assert.ok(request.put.calledWith(sinon.match({
        url: sinon.match('/complete')
      })));

      done();
    });
  });

  it('does not ask to force traffic if trafficControl not enabled', function(done) {
    self.program.virtualApp.trafficControlEnabled = false;
    deploy(this.program, function(err) {
      assert.isFalse(self.mockInquirer.wasAsked('force'));
      done();
    });
  });

  it('asks to force traffic if trafficControl enabled', function(done) {
    self.program.virtualApp.trafficControlEnabled = true;
    deploy(this.program, function(err) {
      assert.isTrue(self.mockInquirer.wasAsked('force'));
      done();
    });
  });

  it('sends forceAllTrafficToNewVersion parameter', function(done) {
    self.program.virtualApp.trafficControlEnabled = true;
    this.mockAnswers.force = true;

    deploy(this.program, function(err) {
      debugger;
      assert.isTrue(self.mockInquirer.wasAsked('force'));

      assert.ok(request.put.calledWith(sinon.match({
        url: sinon.match('/complete'),
        json: sinon.match({
          forceAllTrafficToNewVersion: true
        })
      })));

      done();
    });
  });

  it('runs npm build', function(done) {
    self.program.virtualAppManifest.scripts.build = 'gulp build';
    self.mockAnswers.runBuildStep= true;

    deploy(this.program, function(err) {
      if (err) return done(err);

      assert.isTrue(childProcess.spawn.calledWith('npm', ['run-script', 'build'],
        sinon.match({cwd: self.program.cwd})));
        
      done();
    });
  });
});
