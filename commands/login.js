var chalk = require('chalk');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var api = require('../lib/api');
var log = require('../lib/log');
var debug = require('debug')('4front:cli:login');
var helper = require('../lib/helper');

require("simple-errors");

module.exports = function(program, done) {
  // There's actually nothing to do here as it all was handled in cli-init
  log.success("Login succeeded");
  done();
};
