var assert = require('assert');
var sinon = require('sinon');
var inquirer = require('inquirer');
var request = require('request');
var _ = require('lodash');
var parseUrl = require('url').parse;
var listApps = require('../commands/list-apps');
var log = require('../lib/log');

require('dash-assert');

describe('list-apps', function() {
  var self;

  beforeEach(function() {
    self = this;

    this.mockAnswers = {};
    this.program = {
      profile: {
        endpoint: 'https://apphost.com/',
        jwt: {
          token: '23523454'
        }
      }
    };

    this.orgs = [];
    this.apps = [];

    this.mockInquirer = require('./mock-inquirer')(this.mockAnswers);
    sinon.stub(inquirer, 'prompt', this.mockInquirer.prompt);

    sinon.stub(request, 'get', function(options, callback) {
      var urlPath = parseUrl(options.url).pathname;
      switch (urlPath) {
        case '/api/profile/orgs':
          return callback(null, {statusCode: 200}, self.orgs);
          break;
        case '/api/orgs/1/apps':
          return callback(null, {statusCode: 200}, self.apps);
          break;
        default:
          throw new Error("Unexpected request " + urlPath);
      }
    });

    sinon.stub(log, 'write', _.noop());
    sinon.stub(console, 'log', _.noop());
  });

  afterEach(function() {
    request.get.restore();
    inquirer.prompt.restore();
    log.write.restore();
    console.log.restore();
  });

  it('prompts for org', function(done) {
    this.orgs = [{orgId: '1'}, {orgId: '2'}];
    this.mockAnswers.orgId = '1';

    listApps(this.program, function(err) {
      if (err) return done(err);
      assert.ok(self.mockInquirer.wasAsked('orgId'));

      assert.isTrue(request.get.calledWith(
        sinon.match({url: 'https://apphost.com/api/profile/orgs'})));

      assert.isTrue(request.get.calledWith(
        sinon.match({url: 'https://apphost.com/api/orgs/1/apps'})));

      done();
    });
  });

  it('does not prompt for orgId if only one org', function(done) {
    this.orgs = [{orgId: '1'}];

    listApps(this.program, function(err) {
      if (err) return done(err);
      assert.isFalse(self.mockInquirer.wasAsked('orgId'));

      done();
    });
  });

  it('displays message if user not member of any orgs', function(done) {
    listApps(this.program, function(err) {
      if (err) return done(err);
      log.write.calledWith(sinon.match("You don't belong to any organizations"));

      done();
    });
  });
});
