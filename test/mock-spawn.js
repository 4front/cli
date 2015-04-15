var util = require('util');
var EventEmitter = require('events').EventEmitter;

module.exports = function(cmd, args, options) {
  var spawn = new MockSpawn();
  setTimeout(function() {
    spawn.emit('exit', 0);
  }, 100);

  return spawn;
};

function MockSpawn() {
};

util.inherits(MockSpawn, EventEmitter);
