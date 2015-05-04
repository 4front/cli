var supertest = require('supertest');
var assert = require('assert');
var shortid = require('shortid');
var request = require('request');
var stream = require('stream');
var fs = require('fs');
var through = require('through2');
var log = require('../lib/log');
var _ = require('lodash');
var sinon = require('sinon');
var os = require('os');
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
				url: 'https://apphost.com',
				jwt: {
					token: '23523454'
				}
			},
			cwd: path.join(__dirname, './fixtures/sample-app'),
			baseDir: path.join(__dirname, './fixtures/sample-app/app'),
      virtualApp: {
        appId: shortid.generate()
      }
		};

		sinon.stub(request, 'post', function(options, callback) {
			// Mock the create app post request
			if (options.url.indexOf('/dev/' + self.program.virtualApp.appId + '/upload')) {
        // callback(null, {statusCode: 201});
				// Create a dummy write stream
        return through(function(chunk, enc, cb) {
          cb();
        }, function() {
          callback(null, {statusCode: 200});
        });
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
			fs.stat(path.join(this.program.baseDir, 'index.html'), function(err, stats) {
				if (err) return done(err);

				self.lastModified = stats.mtime.getTime();
				done();
			});
		});

		it('last modified time is in the past', function(done) {
			var server = sandboxServer(this.program);
			var redirectUrl = 'https://appname--dev.apphost.com/';

			supertest(server)
				.get('/sandbox/index.html?mtime=' + (this.lastModified - 1000) + '&return=' + encodeURIComponent(redirectUrl))
				.expect(302)
				.expect(function(res) {
          var apiUploadUrl = self.program.profile.url + '/api/dev/' + self.program.virtualApp.appId + '/upload/index.html'
					assert.ok(request.post.calledWith(sinon.match({url: apiUploadUrl})));

          assert.equal(res.headers.location, redirectUrl);
				})
				.end(done);
		});

    it('last-modified value is the same', function(done) {
      var server = sandboxServer(this.program);
			var redirectUrl = 'https://appname--dev.apphost.com/';

      supertest(server)
				.get("/sandbox/index.html?mtime=" + this.lastModified + "&return=" + encodeURIComponent(redirectUrl))
				.expect(302)
				.expect(function(res) {
					assert.isFalse(request.post.called);
          assert.equal(res.headers.location, redirectUrl);
				})
				.end(done);
    });
	});
});
