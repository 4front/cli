var assert = require('assert');
var async = require('async');
var shortid = require('shortid');
var sinon = require('sinon');
var _ = require('lodash');
var path = require('path');
var log = require('../lib/log');
var request = require('request');
var debug = require('debug')('4front:cli:test');
var envCommand = require('../commands/env');
var mockSpawn = require('./mock-spawn');

require('dash-assert');

describe('env', function() {
  var self;

  beforeEach(function() {
    self = this;

    this.program = {
      virtualApp: {
        appId: shortid.generate()
      },
      virtualAppManifest: {
        scripts: {}
      },
      profile: {
        url: 'https://apphost.com/',
        jwt: {
          token: '23523454'
        }
      }
    };

    sinon.stub(console, 'log', _.noop());
  });

  afterEach(function() {
    console.log.restore();
  });

  describe("set", function() {
    beforeEach(function() {
      this.program.subCommand = 'set';

      // Stub the PUT api call to activate the version
      sinon.stub(request, 'put', function(options, callback) {
        callback(null, {statusCode: 200}, _.extend({}, options.json));
      });
    });

    afterEach(function() {
      request.put.restore();
    });

    it('sets global env variable', function(done) {
      _.extend(this.program, {
        key: 'API_KEY',
        value: 'some_value'
      });

      envCommand(this.program, function(err) {
        if (err) return done(err);

        assert.isTrue(request.put.calledWith(sinon.match({
          url: sinon.match('/apps/' + self.program.virtualApp.appId + '/env/' + self.program.key),
          json: {value: self.program.value}
        })));

        done();
      });
    });

    it('sets virtual env specific variable', function(done) {
      _.extend(this.program, {
        key: 'API_KEY',
        value: 'some_value',
        virtualEnv: 'production'
      });

      envCommand(this.program, function(err) {
        if (err) return done(err);

        assert.isTrue(request.put.calledWith(sinon.match({
          url: sinon.match('/apps/' + self.program.virtualApp.appId + '/env/production/' + self.program.key),
          json: {value: self.program.value}
        })));

        done();
      });

      it('sets encrypted value', function(done) {
        _.extend(this.program, {
          key: 'API_KEY',
          value: 'some_value',
          encrypted: true,
          virtualEnv: 'production'
        });

        envCommand(this.program, function(err) {
          if (err) return done(err);

          assert.isTrue(request.put.calledWith(sinon.match({
            url: sinon.match('/apps/' + self.program.virtualApp.appId + '/env/production/' + self.program.key),
            json: {value: self.program.value, encrypted: true}
          })));

          done();
        });
      });
    });

    it('invalid env variable key', function(done) {
      _.extend(this.program, {
        key: '$invalid%key',
        value: 'some_value'
      });

      envCommand(this.program, function(err) {
        assert.isNotNull(err);
        assert.isTrue(/Environment variable keys can only contain letters/.test(err));

        done();
      });
    });
  });

  // Test listing the environment variables
  describe('list', function() {
    beforeEach(function() {
      this.program.subCommand = 'list';
      this.env = {
        _global: {
          KEY1: 'key1'
        },
        production: {
          KEY2: 'key2'
        }
      };

      sinon.stub(request, 'get', function(options, callback) {
        callback(null, {statusCode: 200}, self.env);
      });
    });

    it('lists env variables', function(done) {
      envCommand(this.program, function(err) {
        if (err) return done(err);

        assert.isTrue(request.get.calledWith(sinon.match({
          url: sinon.match('/apps/' + self.program.virtualApp.appId + '/env')
        })));

        assert.isTrue(console.log.calledWith(JSON.stringify(self.env, null, 2)));
        done();
      });
    });
  });

  describe('delete env variable', function() {
    beforeEach(function() {
      this.program.subCommand = 'del';

      sinon.stub(request, 'del', function(options, callback) {
        callback(null, {statusCode: 200});
      });
    });

    afterEach(function() {
      request.del.restore();
    });

    it('invokes DELETE api for global', function(done) {
      this.program.key = 'KEY1';

      envCommand(this.program, function(err) {
        if (err) return done(err);

        assert.isTrue(request.del.calledWith(sinon.match({
          url: sinon.match('/apps/' + self.program.virtualApp.appId + '/env/KEY1')
        })));

        done();
      });
    });

    it('invokes api for virtual env specific value', function(done) {
      this.program.key = 'KEY2';
      this.program.virtualEnv = 'test';

      envCommand(this.program, function(err) {
        if (err) return done(err);

        assert.isTrue(request.del.calledWith(sinon.match({
          url: sinon.match('/apps/' + self.program.virtualApp.appId + '/env/test/KEY2')
        })));

        done();
      });
    });

    it('returns error for invalid key', function(done) {
      _.extend(this.program, {
        key: '$invalid%key',
        value: 'some_value'
      });

      envCommand(this.program, function(err) {
        assert.isNotNull(err);
        assert.isTrue(/Environment variable keys can only contain letters/.test(err));

        done();
      });
    });
  });
});
