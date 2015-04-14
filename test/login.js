var assert = require('assert');
var sinon = require('sinon');
var shortid = require('shortid');
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var mockInquirer = require('./mock-inquirer');
var login = require('../lib/login');
var os = require('os');

require('dash-assert');

describe('login', function() {
  var self;
  var configFilePath = path.join(os.tmpdir(), '.4front');

  beforeEach(function() {
    self = this;

    try {
      fs.unlinkSync(configFilePath);
    }
    catch (err){}

    this.mockAnswers = {
      platformUrl: 'https://apphost.com',
      username: 'username',
      password: 'password'
    }

    this.inquirer = mockInquirer(this.mockAnswers);

    this.jwt = {
      user: {
        userId: shortid.generate()
      },
      token: 'adfasdfasdfasdf',
      expires: Date.now() + (1000 * 60 * 30)
    };

    this.program = {
      configFilePath: configFilePath,
      inquirer: this.inquirer,
      api: {
        login: sinon.spy(function(username, password, callback){
          callback(null, self.jwt);
        })
      }
    };
  });

  it('missing config file', function(done) {
    login(this.program, function(err, jwt) {
      assert.isTrue(self.inquirer.wasAsked('platformUrl'));
      assert.isTrue(self.inquirer.wasAsked('username'));
      assert.isTrue(self.inquirer.wasAsked('password'));
      assert.isTrue(self.program.api.login.calledWith('username', 'password'));

      assert.equal(self.program.platformUrl, self.mockAnswers.platformUrl);

      var config = JSON.parse(fs.readFileSync(configFilePath).toString());

      assert.deepEqual(config.profiles[0], {
        platformUrl: self.mockAnswers.platformUrl,
        name: 'default',
        default: true,
        jwt: self.jwt
      });

      // assert.equal(config.profiles[0].platformUrl, self.mockAnswers.platformUrl);
      //
      // assert.deepEqual(config.profiles[0].jwt, jwt);

      done();
    });
  });

  it('corrupt config file', function(done) {
    fs.writeFileSync(configFilePath, "invalid json");

    login(this.program, function(err, jwt) {
      assert.isTrue(self.inquirer.wasAsked('platformUrl'));
      assert.isTrue(self.inquirer.wasAsked('username'));
      assert.isTrue(self.inquirer.wasAsked('password'));
      assert.isTrue(self.program.api.login.calledWith('username', 'password'));
      done();
    });
  });

  it('uses the specified profile', function(done) {
    fs.writeFileSync(configFilePath, JSON.stringify({
      profiles: [
        {
          name: 'host1',
          platformUrl: "https://host1.com"
        },
        {
          name: 'host2',
          platformUrl: "https://host2.com"
        }
      ]
    }, null, 2));

    this.program.profile = 'host2';
    login(this.program, function(err, jwt) {
      assert.equal(self.program.platformUrl, 'https://host2.com');

      done();
    });
  });

  it('default profile is used if none specified', function(done) {
    fs.writeFileSync(configFilePath, JSON.stringify({
      profiles: [
        {
          name: 'host1',
          platformUrl: "https://host1.com"
        },
        {
          name: 'host2',
          platformUrl: "https://host2.com",
          default: true
        }
      ]
    }, null, 2));

    login(this.program, function(err, jwt) {
      assert.equal(self.program.platformUrl, 'https://host2.com');

      done();
    });
  });

  it('first profile used if no default and no option specified', function(done) {
    fs.writeFileSync(configFilePath, JSON.stringify({
      profiles: [
        {
          name: 'host1',
          platformUrl: "https://host1.com"
        },
        {
          name: 'host2',
          platformUrl: "https://host2.com"
        }
      ]
    }, null, 2));

    login(this.program, function(err, jwt) {
      assert.equal(self.program.platformUrl, 'https://host1.com');

      done();
    });
  });

  it('expired token still requires user to login', function(done) {
    // Write config file with an expired jwt
    fs.writeFileSync(configFilePath, JSON.stringify({
      profiles: [
        {
          platformUrl: "https://host1.com",
          jwt: _.extend(self.jwt, {
            expires: Date.now() - 1000
          })
        }
      ]
    }, null, 2));

    login(this.program, function(err, jwt) {
      // login api should still be called
      assert.isTrue(self.inquirer.wasAsked('username'));
      assert.isTrue(self.inquirer.wasAsked('password'));
      assert.isTrue(self.program.api.login.called);

      done();
    });
  });

  it('valid token skips login', function(done) {
    _.extend(self.jwt, {
      expires: Date.now() + (1000 * 60)
    });

    fs.writeFileSync(configFilePath, JSON.stringify({
      profiles: [
        {
          platformUrl: "https://host1.com",
          jwt: self.jwt
        }
      ]
    }, null, 2));

    login(this.program, function(err, jwt) {
      // login api should still be called
      assert.isFalse(self.inquirer.wasAsked('username'));
      assert.isFalse(self.inquirer.wasAsked('password'));
      assert.isFalse(self.program.api.login.called);
      assert.deepEqual(jwt, self.jwt);

      done();
    });
  });
});
