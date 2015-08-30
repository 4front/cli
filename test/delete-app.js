var assert = require('assert');
var async = require('async');
var sinon = require('sinon');
var shortid = require('shortid');
var _ = require('lodash');
var log = require('../lib/log');
var fs = require('fs');
var request = require('request');
var inquirer = require('inquirer');
var deleteApp = require('../commands/delete-app');

require('dash-assert');

describe('delete-app', function() {
  var self;

	beforeEach(function() {
    self = this;

    this.appName = 'test-app';

    this.program = {
      profile: {
        name: 'default',
        endpoint: 'https://apphost.com/',
        jwt: {
          token: '23523454'
        }
      },
      virtualApp: {
        appId: shortid.generate(),
        name: this.appName
      }
    };

    this.mockAnswers = {
      appName: self.appName
    };

    this.mockInquirer = require('./mock-inquirer')(this.mockAnswers);

    sinon.stub(inquirer, 'prompt', this.mockInquirer.prompt);
    sinon.stub(request, 'del').yields(null, {statusCode:201});
  });

  afterEach(function() {
    request.del.restore();
    inquirer.prompt.restore();
  });

  before(function() {
    sinon.stub(log, 'write', _.noop());
  });

  after(function() {
    log.write.restore();
  });

  it('deletes app when name matches', function(done) {
    deleteApp(this.program, function(err) {
      if (err) return done(err);

      assert.isTrue(request.del.calledWith(
        sinon.match({url: 'https://apphost.com/api/apps/' + self.program.virtualApp.appId})))

      done();
    });
  });

  it('throws error when entered app name does not match', function(done) {
    this.mockAnswers.appName = "foo";

    deleteApp(this.program, function(err) {
      assert.ok(err);
      assert.ok(/app name you entered does not match/.test(err.message));
      assert.isFalse(request.del.called);

      done();
    });
  });
});
