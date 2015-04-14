var assert = require('assert');
var sinon = require('sinon');
var shortid = require('shortid');
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
      newInstanceUrl: 'https://apphost.com',
      username: 'username',
      password: 'password'
    }

    this.inquirer = mockInquirer(this.mockAnswers);

    this.loginResponse = {
      user: {
        userId: shortid.generate()
      },
      token: 'adfasdfasdfasdf',
      expires: Date.now() + (1000 * 60 * 30)
    };

    this.loginOptions = {
      configFilePath: configFilePath,
      inquirer: this.inquirer,
      api: {
        login: sinon.spy(function(username, password, callback){
          callback(null, self.loginResponse);
        })
      }
    };
  });

  it('missing config file', function(done) {
    login(this.loginOptions, function(err, jwt) {
      assert.isTrue(self.inquirer.wasAsked('newInstanceUrl'));
      assert.isFalse(self.inquirer.wasAsked('instanceUrl'));
      assert.isTrue(self.inquirer.wasAsked('username'));
      assert.isTrue(self.inquirer.wasAsked('password'));
      assert.isTrue(self.loginOptions.api.login.calledWith('username', 'password'));

      var config = JSON.parse(fs.readFileSync(configFilePath).toString());

      assert.equal(config.instances[0].url, self.mockAnswers.newInstanceUrl);
      assert.deepEqual(config.instances[0].jwt, jwt);

      done();
    });
  });

  it('corrupt config file', function(done) {
    fs.writeFileSync(configFilePath, "invalid json");

    login(this.loginOptions, function(err, jwt) {
      assert.isTrue(self.inquirer.wasAsked('newInstanceUrl'));
      assert.isTrue(self.inquirer.wasAsked('username'));
      assert.isTrue(self.inquirer.wasAsked('password'));
      assert.isTrue(self.loginOptions.api.login.calledWith('username', 'password'));

      var config = JSON.parse(fs.readFileSync(configFilePath).toString());

      assert.equal(config.instances[0].url, self.mockAnswers.newInstanceUrl);
      assert.deepEqual(config.instances[0].jwt, jwt);

      done();
    });
  });

  it('existing config file with multiple instances prompts user to choose', function(done) {
    fs.writeFileSync(configFilePath, JSON.stringify({
      instances: [
        {
          url: "https://host1.com"
        },
        {
          url: "https://host2.com"
        }
      ]
    }, null, 2));

    this.mockAnswers.instanceUrl = 'https://host1.com';
    login(this.loginOptions, function(err, jwt) {
      assert.isTrue(self.inquirer.wasAsked('instanceUrl'));
      assert.isFalse(self.inquirer.wasAsked('newInstanceUrl'));
      done();
    });
  });

  it('expired token still requires user to login', function(done) {
    done();
  });

  it('valid token skips login', function(done) {
    done();
  });
});
