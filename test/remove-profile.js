var assert = require('assert');
var async = require('async');
var sinon = require('sinon');
var fs = require('fs');
var _ = require('lodash');
var path = require('path');
var log = require('../lib/log');
var fs = require('fs');
var removeProfile = require('../commands/remove-profile');
var os = require('os');

require('dash-assert');

describe('remove-profile', function() {
  var self;

	beforeEach(function() {
    self = this;

    this.program = {
      globalConfigPath: path.join(os.tmpdir(), '.4front.json'),
      globalConfig: {
        profiles: [{
          name: 'test',
          url: 'http://4front.test'
        }]
      }
    };
  });

  before(function() {
    sinon.stub(log, 'write', _.noop());
  });

  after(function() {
    log.write.restore();
  });

  afterEach(function(done) {
    fs.unlink(this.program.globalConfigPath, function() {
      done();
    });
  });

  it('removes profile', function(done) {
    this.program.profileName = 'test';

    removeProfile(this.program, function(err) {
      var globalConfig = JSON.parse(fs.readFileSync(self.program.globalConfigPath));
      assert.equal(globalConfig.profiles.length, 0);
      done();
    });
  });

  it('returns error if profile name does not exist', function(done) {
    this.program.profileName = 'missing';

    removeProfile(this.program, function(err) {
      assert.matchesPattern(err, /no registered profile named missing/);
      done();
    });
  });

  it('returns error if profile name missing', function(done) {
    removeProfile(this.program, function(err) {
      assert.matchesPattern(err, /Please provide a profile name/);
      done();
    });
  });
});
