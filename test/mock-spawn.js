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
  this.stdout = new MockEmitter();
  this.stderr = new MockEmitter();
};

function MockEmitter() {}

util.inherits(MockEmitter, EventEmitter);
util.inherits(MockSpawn, EventEmitter);
