// var spawn = require('child_process').spawn;
var childProcess = require('child_process');
var _ = require('lodash');
var log = require('./log');

// Execute a child process.
module.exports = function(cmd, args, options, callback) {
  if (_.isFunction(options)) {
    callback = options;
    options = {};
  }

  _.defaults(options, {
    waitForExit: true,
    cwd: process.cwd,
    inheritStdio: false
  });

  var spawnOptions = {
    cwd: options.cwd,
    stdio: options.inheritStdio ? 'inherit' : 'pipe'
  };

  log.debug("Spawning child process %s %s", cmd, args)

  var spawned;
  if (process.platform === "win32")
    spawned = childProcess.spawn(process.env.comspec || "cmd.exe", [ "/c", cmd ].concat(args), spawnOptions);
  else
    spawned = childProcess.spawn(cmd, args, spawnOptions);

  spawned.on('error', function(err) {
    return callback(err);
  });

  if (options.inheritStdio !== true) {
    spawned.stdout.on('data', function(data) {
      var message = fixChildProcessOut(data.toString());
      if (_.isEmpty(message) === false) {
        // Sometimes we need to send error output back in stdout but want
        // to make it look like an error.
        if (/\[ERROR\]/.test(message))
          log({process: cmd, status: 'ERR!', color:'bgRed', message: data.toString()});
        else
          log({process: cmd, message: message});
      }
    });

    spawned.stderr.on('data', function(data) {
      log({process: cmd, status: 'ERR!', color:'bgRed', message: data.toString()});
    });
  }

  if (options.waitForExit === true) {
    spawned.on('exit', function(code, signal) {
      if (code !== 0)
        return callback(Error.create("Error returned from " + cmd, {code: code}));

      callback();
    });
  }
  else
    callback();
};

function fixChildProcessOut(msg) {
  // Strip off any trailing linebreaks
  // u001b[4mRunning "watch" task\u001b[24m

  // Strip off unicode formatting codes
  msg = msg.replace(/\u001b\[\d+m/g, "");
  msg = msg.replace(/^>>/, "");
  msg = msg.trim(msg);
  return msg.trim(msg);
}
