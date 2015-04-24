var assert = require('assert');
var async = require('async');
var sinon = require('sinon');
var fs = require('fs');
var _ = require('lodash');
var path = require('path');
var parseUrl = require('url').parse;
var rimraf = require('rimraf');
var log = require('../lib/log');
var fs = require('fs');
var addProfile = require('../commands/add-profile');
var os = require('os');

require('dash-assert');

describe('add-profile', function() {
  var self;

	beforeEach(function() {
    self = this;

    this.program = {
      globalConfigPath: path.join(os.tmpdir(), '.4front.json'),
      globalConfig: {
        profiles: []
      }
    };
  });

  afterEach(function(done) {
    fs.unlink(this.program.globalConfigPath, function() {
      done();
    });
  });

  before(function() {
    sinon.stub(log, 'write', _.noop());
  });

  after(function() {
    log.write.restore();
  });

  it('adds first profile', function(done) {
    this.program.profileName = 'production';
    this.program.profileUrl = 'https://4frontapps.com';

    addProfile(this.program, function(err) {
      var globalConfig = JSON.parse(fs.readFileSync(self.program.globalConfigPath));
      assert.deepEqual(globalConfig.profiles[0], {
        name: self.program.profileName,
        url: self.program.profileUrl,
        default: true
      });

      done();
    });
  });

  it('returns error if profile name missing', function(done) {
    addProfile(this.program, function(err) {
      assert.matchesPattern(err, /Please provide a profile name/);
      done();
    });
  });

  it('returns error if profile url missing', function(done) {
    this.program.profileName = 'production';

    addProfile(this.program, function(err) {
      assert.matchesPattern(err, /Please provide a profile url/);
      done();
    });
  });

  it('returns error if profile name already exists', function(done) {
    this.program.globalConfig.profiles.push({
      name: 'production',
      url: 'https://4frontapps.com'
    });

    this.program.profileName = 'production';
    this.program.profileUrl = 'https://4frontapps.com';

    addProfile(this.program, function(err) {
      assert.matchesPattern(err, /There is already a profile/);
      done();
    });
  });
});
