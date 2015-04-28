var chalk = require('chalk');
var util = require('util');
var async = require('async');
var request = require('request');
var inquirer = require('inquirer');
var _ = require('lodash');
var fs = require('fs');
var os = require('os');
var zlib = require('zlib');
var path = require('path');
var glob = require("glob");
var urljoin = require('url-join');
var open = require('open');
var shortid = require('shortid');
var debug = require('debug')('4front:cli:deploy');
var spawn = require('../lib/spawn');
var api = require('../lib/api');
var log = require('../lib/log');
var basedir = require('../lib/basedir');
var helper = require('../lib/helper');

require("simple-errors");

var compressExtensions = ['.css', '.js', '.json', '.txt', '.svg'];

module.exports = function(program, done) {
  // Create a new version object
  var newVersion, asyncTasks = [], inputAnswers = {};

  // Force buildType to be release
  program.buildType = 'release';

  // Determine the baseDir
  asyncTasks.push(function(cb) {
    basedir(program, function(err, baseDir) {
      if (err) return cb(err);

      debug('setting baseDir to %s', baseDir);
      program.baseDir = baseDir;
      cb();
    });
  });

  asyncTasks.push(collectVersionInputs);

  // Run "npm run-script build"
  asyncTasks.push(function(cb) {
    if (inputAnswers.runBuildStep === true)
      spawn('npm', ['run-script', 'build'], cb);
    else
      cb();
  });

  asyncTasks.push(function(cb) {
    var globOptions = {
      cwd: program.baseDir,
      dot: false,
      nodir: true
    };

    debug('globbing up files');
    glob("**/*.*", globOptions, function(err, matches) {
      if (err) return cb(err);
      deployFiles = matches;
      cb();
    });
  });

  asyncTasks.push(createNewVersion);
  asyncTasks.push(deployFiles);
  asyncTasks.push(activateVersion);

  async.series(asyncTasks, function(err) {
    debugger;
    if (err) return done(err);

    log.success("New version %s deployed and available at: %s", newVersion.versionId, newVersion.previewUrl);
    if (program.open === true)
      open(newVersion.previewUrl);

    done();
  });

  function collectVersionInputs(callback) {
    // Perform an unattended deployment, possibly from a CI process.
    if (program.unattended === true) {
      log.debug("Running in unattended mode");
      // Assuming that a CI process would have already run the build step.
      _.extend(inputAnswers, {
        runBuildStep: false,
        name: program.versionName,
        message: program.message
      });

      return callback();
    }

    log.messageBox("Deploy a new version of the app.");

    // Use inquirer to collect input.
    questions = [
      {
        type: 'input',
        name: 'version',
        message: 'Version name (leave blank to auto-generate):',
        validate: validateVersionName
      },
      {
        type: 'input',
        name: 'message',
        message: 'Message (optional):'
      },
      {
        type: 'confirm',
        name: 'runBuildStep',
        message: 'Run "npm run-script build?"',
        when: function() {
          return _.isEmpty(program.virtualAppConfig.scripts.build) === false;
        },
        default: true
      },
      // TODO: Allow organization to disallow this.
      {
        type: 'confirm',
        name: 'force',
        message: 'Immediately direct all traffic to this new version?',
        default: program.virtualApp.trafficControlEnabled === true ? true : false,
        when: function(answers) {
          return program.virtualApp.trafficControlEnabled === true;
        }
      }
    ];

    inquirer.prompt(questions, function(answers) {
      _.extend(inputAnswers, answers);
      callback();
    });
  }

  function validateVersionName(name) {
    if (_.isEmpty(name))
      return true;

    if (/^[a-z\.\_\-0-9]{5,20}$/i.test(name) !== true)
      return "Version " + name + " can only consist of letters, numbers, dashes, periods, or underscores and must be between 5 and 20 characters";
    return true;
  }

  function deployFiles(callback) {
    // PUT each file individually
    var uploadCount = 0;

    async.each(deployFiles, function(file, cb) {
      var fullPath = path.join(program.baseDir, file);
      // var relativePath = path.relative(program.cwd, fullPath);

      // Ensure the slashes are forward in the relative path
      var uploadPath = urljoin(newVersion.versionId, file.replace(/\\/g, '/'));
      uploadCount++;

      // var compress = shouldCompress(file);
      compress = false;
      uploadFile(fullPath, uploadPath, compress, cb);
    }, function(err) {
      if (err) return callback(err);
        // return callback(Error.create("Error deploying source files", {}, err));

      debug('Done uploading %s files', uploadCount);
      callback();
    });
  }

  function shouldCompress(filePath) {
    return _.contains(compressExtensions, path.extname(filePath));
  }

  function uploadFile(filePath, uploadPath, compress, callback) {
    debug("Start upload of " + filePath);

    var requestOptions = {
      path: urljoin('apps', program.virtualApp.appId, 'versions',
        newVersion.versionId, 'deploy', uploadPath),
      headers: {},
      method: 'POST'
    };

    function upload(file) {
      log.info('Deploying file /%s', uploadPath);
      fs.stat(file, function(err, stat) {
        if (err) return callback(err);

        requestOptions.headers['Content-Length'] = stat.size;
        fs.createReadStream(file)
          .pipe(api(program, requestOptions, callback));
      });
    }

    if (compress === true) {
      log.info('Compressing file ' + filePath);
      debug('Compressing file ' + filePath);
      requestOptions.headers['Content-Type'] = 'application/gzip';

      // Use a random file name to avoid chance of collisions
      var gzipFile = path.join(os.tmpdir(), shortid.generate() + path.extname(filePath) + '.gz');

      log.debug("Writing to gzipFile %s", gzipFile);
      debug("Writing to gzipFile %s", gzipFile);
      fs.createReadStream(filePath)
        .pipe(zlib.createGzip())
        .pipe(fs.createWriteStream(gzipFile))
        .on('error', function(err) {
          return callback(err);
        })
        .on('finish', function() {
          debug('done writing gzip file')
          return upload(gzipFile);
        });
    }
    else {
      upload(filePath);
    }
  }

  function activateVersion(callback) {
    var versionData = {};

    if (program.force === true) {
      versionUpdateData.forceAllTrafficToNewVersion = '1';
      if (program.virtualApp.trafficControlEnabled === true)
        log.info(chalk.yellow('Forcing all traffic to the new version.'));
    }

    var requestOptions = {
      method: 'POST',
      path: '/apps/' + program.virtualApp.appId + '/versions/' + newVersion.versionId + '/activate',
      json: versionData
    };

    api(program, requestOptions, function(err, version) {
      if (err) return callback(err);
      newVersion = version;
      callback();
    });
  }

  // Create the new version in a non-ready state.
  function createNewVersion(callback) {
    // Create the new version
    log.info('Creating new version');

    var requestOptions = {
      method: 'POST',
      path: '/apps/' + program.virtualApp.appId + '/versions',
      json: {
        name: inputAnswers.name,
        message: inputAnswers.message,
        manifest: program.virtualAppConfig
      }
    };

    api(program, requestOptions, function(err, version) {
      debug("new version created");
      if (err) return callback(err);
      newVersion = version;
      callback();
    });
  }
};
