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
var childProcess = require('child_process');
var request = require('request');
var inquirer = require('inquirer');
var createApp = require('../commands/create-app');
var os = require('os');
var debug = require('debug')('4front:cli:create-app-test');
var mockSpawn = require('./mock-spawn');
var mockInquirer = require('./mock-inquirer');

require('dash-assert');

var sampleTemplate = path.resolve(__dirname, "./fixtures/sample-app-template.zip");
var sampleTemplateWithRoot = path.resolve(__dirname, "./fixtures/sample-app-with-root-dir.zip");

describe('create-app', function() {
  var self;

	beforeEach(function(done) {
    self = this;

    this.program = {
      profile: {
        name: 'default',
        platformUrl: 'https://apphost.com/',
        jwt: {
          token: '23523454'
        }
      },
      baseDir: os.tmpdir()
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

    sinon.stub(log, 'write', _.noop());

    sinon.stub(request, 'get', function(options, callback) {
      var urlPath = parseUrl(options.url).pathname;
      switch (urlPath) {
        case '/api/platform/starter-templates':
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
        case '/sample-app-with-root-dir.zip':
          // Return the readStream directly. The way this call is made
          // request is not passing in a callback.
          return fs.createReadStream(sampleTemplateWithRoot);

        default:
          throw new Error("Unexpected request " + urlPath);
      }
    });

    sinon.stub(request, 'head').yields(null, {statusCode:404});

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

  it('collect input', function(done) {
    _.extend(this.mockAnswers, {
      templateUrl: 'blank',
      startingMode: 'scratch'
    });

    createApp(this.program, function(err) {
      if (err) return done(err);

      assert.isTrue(request.get.calledWith(
        sinon.match({url: 'https://apphost.com/api/profile/orgs'})))

      assert.isTrue(request.get.calledWith(
        sinon.match({url: 'https://apphost.com/api/platform/starter-templates'})))

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
        templateUrl: "http://github.com/sample-app-template.zip"
      });

      createApp(this.program, function(err, createdApp) {
        if (err) return done(err);

        var appDir = path.join(self.program.baseDir, self.mockAnswers.appName);

        assert.isFalse(self.mockInquirer.wasAsked('startingMode'));

        assert.isTrue(request.get.calledWith(
          sinon.match({url: self.program.templateUrl})));

        // Assert that both npm and bower install were run
        assert.isTrue(childProcess.spawn.calledWith('npm', ['install'], sinon.match({cwd: appDir})));
        assert.isTrue(childProcess.spawn.calledWith('bower', ['install'], sinon.match({cwd: appDir})));

        // verify that the extracted contents from the template zip are present
        ['index.html', 'js/app.js', 'css/styles.css', 'package.json'].forEach(function(file) {
          var filePath = path.join(appDir, file);
          assert.isTrue(fs.existsSync(filePath));
        });

        var packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json')));
        assert.equal(packageJson['_virtualApp'].appId, createdApp.appId);

        done();
      });
    });

    it('uses template specified at prompt', function(done) {
      _.extend(this.mockAnswers, {
        startingMode: 'scratch',
        templateUrl: 'http://github.com/sample-app-template.zip'
      });

      createApp(this.program, function(err) {
        if (err) return done(err);

        assert.isTrue(self.mockInquirer.wasAsked('templateUrl'));
        assert.isTrue(request.get.calledWith(
          sinon.match({url: self.mockAnswers.templateUrl})));

        done();
      });
    });

    it('skips root directory in zip archive', function(done) {
      _.extend(this.mockAnswers, {
        startingMode: 'scratch',
        templateUrl: 'http://github.com/sample-app-with-root-dir.zip'
      });

      createApp(this.program, function(err) {
        if (err) return done(err);

        var appDir = path.join(self.program.baseDir, self.mockAnswers.appName);

        // verify that the extracted contents from the template zip are present
        ['index.html', 'js/app.js'].forEach(function(file) {
          var filePath = path.join(appDir, 'app', file);

          debug('check if %s exists', filePath);
          assert.isTrue(fs.existsSync(filePath));
        });

        done();
      });
    });
  });

  it('returns error when app directory already exists', function(done) {
    _.extend(this.mockAnswers, {
      appName: shortid.generate(),
      startingMode: 'scratch',
      templateUrl: 'blank'
    });

    fs.mkdirSync(path.join(self.program.baseDir, this.mockAnswers.appName));

    createApp(this.program, function(err) {
      assert.isNotNull(err);
      assert.ok(/already exists/.test(err));
      done();
    });
  });

  it('creates index.html when no template chosen', function(done) {
    _.extend(this.mockAnswers, {
      startingMode: 'scratch',
      templateUrl: 'blank'
    });

    createApp(this.program, function(err, createdApp) {
      if (err) return done(err);

      var appDir = path.join(self.program.baseDir, self.mockAnswers.appName);

      ['index.html', 'package.json'].forEach(function(file) {
        var filePath = path.join(appDir, file);
        assert.isTrue(fs.existsSync(filePath));
      });

      // Look at the package.json
      var packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json')));
      assert.isObject(packageJson['_virtualApp']);
      assert.equal(packageJson['_virtualApp'].appId, createdApp.appId);

      done();
    });
  });

  it('continues to ask for appName until one available', function(done) {
    request.head.restore();

    var headStub = sinon.stub(request, 'head');
    headStub.onCall(0).yields(null, {statusCode: 200});
    headStub.onCall(1).yields(null, {statusCode: 200});
    // On the 3rd call yield a 404 indicating the app name is available
    headStub.onCall(2).yields(null, {statusCode: 404});

    createApp(this.program, function(err) {
      if (err) return done(err);

      // The appName question should have been asked 3 times
      assert.equal(self.mockInquirer.askedCount('appName'), 3);

      done();
    });
  });
});
