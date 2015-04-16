var assert = require('assert');
var preprocessor = require('../lib/preprocessor');
var sbuff = require('simple-bufferstream');
var path = require('path');

describe('preprocessor', function() {
  it('processes jade', function(done) {

    sbuff("html\n\ttitle")
      .pipe(preprocessor('file.jade'))
      .once('readable', function() {
        var html = this.read().toString();
        assert.equal(html, "<html><title></title></html>");
        done();
      });
  });
});
