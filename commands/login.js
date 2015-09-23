var log = require('../lib/log');

require("simple-errors");

module.exports = function(program, done) {
  // There's actually nothing to do here as it all was handled in cli-init
  log.success("Login succeeded");
  done();
};
