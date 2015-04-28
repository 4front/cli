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
        appId: shortid.generate()
      },
      virtualAppConfig: {
        scripts: {}
      },
      cwd: path.join(os.tmpdir(), 'test-app')
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
      debugger;
      // Mock the create app post request
      if (options.url.indexOf('/deploy') > 0) {
        // Create a dummy write stream
        return through(function(chunk, enc, cb) {
          debug('faux write chunk %s', chunk);
          cb();
        }, function() {
          callback(null, {statusCode: 201});
        });

				// var writeStream = new stream.Writable();
				// writeStream._write = function(chunk, encoding, done) {
				// 	done();
				// };
				// return writeStream;
        // callback(null, {statusCode: 201});
      }
      else {
        debug("mock create version api call");
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
    log.write.restore();
  });

  it('deploys new version', function(done) {
    deploy(this.program, function(err) {
      if (err) return done(err);

      done();
    });
  });
});
