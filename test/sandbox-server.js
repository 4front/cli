var supertest = require('supertest');
var assert = require('assert');
var shortid = require('shortid');
var request = require('request');
var through = require('through2');
var log = require('../lib/log');
var _ = require('lodash');
var sinon = require('sinon');
var path = require('path');
var helper = require('../lib/helper');
var sandboxServer = require('../lib/sandbox-server');

require('dash-assert');

describe('sandboxServer', function() {
  var self;

  before(function() {
    sinon.stub(log, 'write', _.noop());
  });

  beforeEach(function() {
    self = this;

    this.program = {
      profile: {
        name: 'default',
        endpoint: 'https://apphost.com',
        jwt: {
          token: '23523454'
        }
      },
      cwd: path.join(__dirname, './fixtures/sample-app'),
      baseDir: path.join(__dirname, './fixtures/sample-app/app'),
      virtualApp: {
        appId: shortid.generate(),
        name: 'appname'
      },
      virtualHost: 'apphost.com'
    };

    sinon.stub(request, 'post', function(options, callback) {
      // Mock the create app post request
      if (options.url.indexOf('/dev/' + self.program.virtualApp.appId + '/upload') !== -1) {
        // callback(null, {statusCode: 201});
        // Create a dummy write stream
        return through(function(chunk, enc, cb) {
          cb();
        }, function() {
          callback(null, {statusCode: 200});
        });
      } else if (options.url.indexOf('/dev/' + self.program.virtualApp.appId + '/notfound') !== -1) {
        callback(null, {statusCode: 200});
      }
    });
  });

  afterEach(function() {
    request.post.restore();
  });

  after(function() {
    log.write.restore();
  });

  it('serves static files', function(done) {
    var server = sandboxServer(this.program);
    supertest(server)
      .get('/js/app.js')
      .expect(200)
      .expect('Content-Type', /application\/javascript/)
      .expect(function(res) {
        assert.equal(res.text, '// app.js\n');
      })
      .end(done);
  });

  it('serves node_modules from root of app', function(done) {
    var server = sandboxServer(this.program);
    supertest(server)
      .get('/node_modules/some-module/module.js')
      .expect(200)
      .expect('Content-Type', /application\/javascript/)
      .expect(function(res) {
        assert.equal(res.text, '// module.js\n');
      })
      .end(done);
  });

  it('serves bower_components from root of app', function(done) {
    var server = sandboxServer(this.program);
    supertest(server)
      .get('/bower_components/component/component.js')
      .expect(200)
      .expect('Content-Type', /application\/javascript/)
      .expect(function(res) {
        assert.equal(res.text, '// component.js\n');
      })
      .end(done);
  });

  it('missing file returns 404', function(done) {
    var server = sandboxServer(this.program);
    supertest(server)
      .get('/js/missing.js')
      .expect(404)
      .expect(function() {
        assert.isFalse(request.post.called);
      })
      .end(done);
  });

  describe('/sandbox route', function() {
    beforeEach(function(done) {
      helper.fileHash(path.join(this.program.baseDir, 'index.html'), function(err, hash) {
        if (err) return done(err);

        self.hash = hash;
        done();
      });
    });

    it('hash is different', function(done) {
      var server = sandboxServer(this.program);
      var redirectUrl = 'https://appname--local.apphost.com/';

      supertest(server)
        .get('/sandbox/index.html?hash=not_a_real_hash&return=' + encodeURIComponent(redirectUrl))
        .expect(302)
        .expect(function(res) {
          var apiUploadUrl = self.program.profile.endpoint + '/api/dev/' + self.program.virtualApp.appId + '/upload/index.html';
          assert.ok(request.post.calledWith(sinon.match({url: apiUploadUrl})));

          assert.equal(res.headers.location, redirectUrl);
        })
        .end(done);
    });

    it('hash value is the same', function(done) {
      var server = sandboxServer(this.program);
      var redirectUrl = 'https://appname--local.apphost.com/';

      supertest(server)
        .get('/sandbox/index.html?hash=' + this.hash + '&return=' + encodeURIComponent(redirectUrl))
        .expect(302)
        .expect(function(res) {
          assert.isFalse(request.post.called);
          assert.equal(res.headers.location, redirectUrl);
        })
        .end(done);
    });

    it('missing file without custom 404', function(done) {
      var server = sandboxServer(this.program);
      var redirectUrl = 'https://appname--local.apphost.com/missing';

      supertest(server)
        .get('/sandbox/missing.html?return=' + encodeURIComponent(redirectUrl))
        .expect(302)
        .expect(function() {
          assert.isTrue(request.post.calledWith(sinon.match({
            url: 'https://apphost.com/api/dev/' + self.program.virtualApp.appId + '/notfound/missing.html'
          })));
        })
        .end(done);
    });

    it('missing file with custom404 query parameter', function(done) {
      var server = sandboxServer(this.program);
      var redirectUrl = 'https://appname--local.apphost.com/missing';

      supertest(server)
        .get('/sandbox/missing.html?custom404=404.html&return=' + encodeURIComponent(redirectUrl))
        .expect(302)
        .expect(function() {
          assert.isTrue(request.post.calledWith(sinon.match({
            url: 'https://apphost.com/api/dev/' + self.program.virtualApp.appId + '/upload/404.html'
          })));
        })
        .end(done);
    });

    it('missing custom 404 page', function(done) {
      var server = sandboxServer(this.program);
      var redirectUrl = 'https://appname--local.apphost.com/missing';

      supertest(server)
        .get('/sandbox/missing.html?custom404=missing404.html&return=' + encodeURIComponent(redirectUrl))
        .expect(302)
        .expect(function() {
          assert.isTrue(request.post.calledWith(sinon.match({
            url: 'https://apphost.com/api/dev/' + self.program.virtualApp.appId + '/notfound/missing.html'
          })));
        })
        .end(done);
    });

    it('missing favicon', function(done) {
      var server = sandboxServer(this.program);

      supertest(server)
        .get('/favicon.ico')
        .expect(302)
        .expect(function(res) {
          assert.equal(res.headers.location, 'http://appname--local.apphost.com/favicon.ico?default=1');
        })
        .end(done);
    });
  });
});
