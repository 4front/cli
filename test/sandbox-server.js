var supertest = require('supertest');
var assert = require('assert');
var shortid = require('shortid');
var request = require('request');
var stream = require('stream');
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
			platformUrl: 'https://apphost.com',
			cwd: path.join(__dirname, './fixtures/sample-app'),
			baseDir: path.join(__dirname, './fixtures/sample-app/app'),
			jwt: {
				token: '23523454'
			},
      virtualApp: {
        appId: shortid.generate()
      }
		};

		sinon.stub(request, 'post', function(options, callback) {
			// Mock the create app post request
			if (options.url.indexOf('/dev/upload')) {
        callback(null, {statusCode: 201});
				// Create a dummy write stream
				// var writeStream = new stream.Writable();
				// writeStream._write = function(chunk, encoding, done) {
				// 	done();
				// };
				// return writeStream;
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
			.end(done);
	});

	describe('html-page route', function() {
		it('sha value different', function(done) {
			var server = sandboxServer(this.program);
			var redirectUrl = 'https://appname--dev.apphost.com/';

			supertest(server)
				.get('/html-page/index.html?hash=asdfasdf&return=' + encodeURIComponent(redirectUrl))
				.expect(302)
				.expect(function(res) {
          var apiUploadUrl = self.program.platformUrl + '/api/dev/' + self.program.virtualApp.appId + '/upload/index.html'
					assert.ok(request.post.calledWith(sinon.match({url: apiUploadUrl})));

          assert.equal(res.headers.location, redirectUrl);
				})
				.end(done);
		});

    it('sha value is the same', function(done) {
      var server = sandboxServer(this.program);
			var redirectUrl = 'https://appname--dev.apphost.com/';

      helper.getFileHash(path.join(this.program.baseDir, 'index.html'), function(hash) {
        supertest(server)
  				.get("/html-page/index.html?hash=" + hash + "&return=" + encodeURIComponent(redirectUrl))
  				.expect(302)
  				.expect(function(res) {
  					assert.isFalse(request.post.called);
            assert.equal(res.headers.location, redirectUrl);
  				})
  				.end(done);
      });
    });
	});
});
