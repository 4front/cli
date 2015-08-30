var path = require('path');
var accepts = require('accepts');

require('simple-errors');

module.exports = {
  error: function(err, req, res, next) {
    if (!err.status)
      err.status = 500;

    res.statusCode = err.status || 500;

    var errorJson = Error.toJson(err);
		if (res.status !== 500)
      errorJson.stack = null;

    res.set('Cache-Control', 'no-cache');
    res.statusCode = err.status;

    var accept = accepts(req);
    switch (accept.type(['json', 'html'])) {
      case 'json':
        res.json(errorJson);
        break;
      case 'html':
        var errorView = path.join(__dirname, '../views/error.jade');
        res.render(errorView, errorJson);
        break;
      default:
        // the fallback is text/plain, so no need to specify it above
        res.setHeader('Content-Type', 'text/plain')
        res.write(JSON.stringify(errorJson));
        break;
    }
	}
}
