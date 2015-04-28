var chalk = require('chalk');
var util = require('util');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var fs = require('fs');
var os = require('os');
var zlib = require('zlib');
var path = require('path');
var glob = require("glob");
var urljoin = require('url-join');
var open = require('open');
var shortid = require('shortid');
var spawn = require('../lib/spawn');
var api = require('../lib/api');
var log = require('../lib/log');
var basedir = require('../lib/basedir');
var helper = require('../lib/helper');

require("simple-errors");

var compressExtensions = ['.html', '.css', '.js', '.json', '.txt', '.svg'];

module.exports = function(program, done) {
  // Create a new version object
  var newVersion, asyncTasks = [];

  // Force buildType to be release
  program.buildType = 'release';

  // Determine the baseDir
  asyncTasks.push(function(cb) {
    basedir(program, function(err, baseDir) {
      if (err) return cb(err);
      program.baseDir = baseDir;
    });
  });

  asyncTasks.push(function(cb) {
    collectVersionInputs(cb);
  });

  // Run "npm run-script build"
  asyncTasks.push(function(cb) {
    if (runBuildStep === true)
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

    glob("**/*.*", globOptions, function(err, matches) {
      if (err) return cb(err);
      deployFiles = matches;
    });
  });

  asyncTasks.push(createNewVersion);
  asyncTasks.push(deployFiles);
  asyncTasks.push(activateVersion);

  async.series(asyncTasks, function(err) {
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
      runBuildStep = false;
      versionData.name = program.versionName;
      versionData.message = program.message;

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
          return _.isEmpty(program.npmScripts.build) === false;
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

    program.inquirer.prompt(questions, function(answers) {
      runBuildStep = answers.runBuildStep;

      // If trafficControl is not enabled on the app, then always force traffic
      // to the new version.
      program.force = program.virtualApp.trafficControlEnabled !== true ? true : answers.force;
      versionData.name = answers.version;
      versionData.message = answers.message;

      log.blankLine();
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
      var filePath = path.relative(program.cwd, path.join(deployFiles.baseDir, file));

      // Ensure the slashes are forward in the relative path
      var relativePath = file.replace(/\\/g, '/');

      var uploadPath = urljoin(versionData.versionId, relativePath);
      uploadCount++;

      var compress = shouldCompress(file);
      uploadFile(filePath, uploadPath, compress, cb);
    }, function(err) {
      if (err)
        return callback(Error.create("Error deploying source files", {}, err));

      log.info('Done uploading %s files', uploadCount);
      callback();
    });
  }

  function shouldCompress(filePath) {
    // Don't compress any of the pages that are served from the app platform rather than the CDN.
    var platformFiles = ['index.html', 'login.html', 'robots.txt', 'sitemap.xml'];
    if (_.contains(platformFiles, filePath) === true) {
      log.debug("Do not compress file %s", filePath);
      return false;
    }

    return _.contains(compressExtensions, path.extname(filePath));
  }

  function uploadFile(filePath, uploadPath, compress, callback) {
    log.debug("Start upload of " + filePath);

    var requestOptions = {
      path: urljoin('apps', program.virtualApp.appId, 'versions',
        newVersion.versionId, 'deploy', uploadPath),
      headers: {},
      method: 'POST'
    };

    function upload(file) {
      log.info('Deploying file /%s', uploadPath);
      fs.stat(file, function(err, stat) {
        requestOptions.headers['Content-Length'] = stat.size;
        return fs.createReadStream(file)
          .pipe(api(program, requestOptions, callback));
      });
    }

    if (compress === true) {
      log.info('Compressing file ' + filePath);
      requestOptions.headers['Content-Type'] = 'application/gzip';

      // Use a random file name to avoid chance of collisions
      var gzipFile = path.join(os.tmpdir(), shortid.generate() + path.extname(filePath) + '.gz');

      log.debug("Writing to gzipFile %s", gzipFile);
      fs.createReadStream(filePath)
        .pipe(zlib.createGzip())
        .pipe(fs.createWriteStream(gzipFile))
        .on('error', function(err) {
          return callback(err);
        })
        .on('finish', function() {
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
  function createNewVersion(name, message, callback) {
    // Create the new version
    log.info('Creating new version');

    var requestOptions = {
      method: 'POST',
      path: '/apps/' + program.virtualApp.appId + '/versions',
      json: {
        name: name,
        message: message,
        manifest: program.virtualAppConfig
      }
    };

    api(program, requestOptions, function(err, version) {
      if (err) return callback(err);
      newVersion = version;
      callback();
    });
  }
};
