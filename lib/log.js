var chalk = require('chalk');
var util = require('util');
var _ = require('lodash');
var printf = require('printf');

var log = module.exports = function(options) {
	_.defaults(options, {
		process: '4front',
		status: 'info',
		color: 'green'
	});

	if (_.isString(options.message))
		options.message = options.message.split('\n');

	options.message.forEach(function(line) {
		module.exports.write(printf("%-8s", options.process));
		// module.exports.write();

		var padding = _.map(_.range(6 - options.status.toString().length),
			function() {
				return ' '
			}).join('');

		module.exports.write(chalk[options.color](options.status) + padding);

		if (options.messageColor)
			module.exports.write(chalk[options.messageColor](line));
		else
			module.exports.write(line);

		writeln('');
	});
};

module.exports.debug = function() {
	if (process.env.DEBUG === '1')
		log({
			message: util.format.apply(this, arguments),
			status: 'debug',
			color: 'magenta'
		});
};

module.exports.error = function() {
	log({
		message: util.format.apply(this, arguments),
		status: 'ERR!',
		color: 'bgRed',
		messageColor: 'red'
	});
};

module.exports.warn = function() {
	log({
		message: util.format.apply(this, arguments),
		status: 'WARN',
		color: 'yellow'
	});
}

module.exports.info = function() {
	log({
		message: util.format.apply(this, arguments),
		status: 'info',
		color: 'green'
	});
};

module.exports.success = function() {
	log({
		message: chalk.green.bold(util.format.apply(this, arguments)),
		status: 'OK!',
		color: 'bgGreen'
	});
};

module.exports.http = function(statusCode, urlPath) {
	writeln("4front " + chalk.green(statusCode) + " " + urlPath);
};

module.exports.blankLine = function() {
	writeln('');
};

module.exports.messageBox = function(message, options) {
	options = _.defaults(options || {}, {
		width: 60
	});

	if (_.isString(message))
		message = message.split('\n');

	var top = chalk.yellow('┌' + fill('─', options.width) + '┐');
	var bottom = chalk.yellow('└' + fill('─', options.width) + '┘');
	var side = chalk.yellow('│');

	writeln('\n' + top);
	message.forEach(function(line) {
		module.exports.writeln(side + ' ' + line + fill(' ', options.width - line.length -
			1) + side);
	});
	writeln(bottom);
};

function writeln(line) {
	module.exports.write(line + '\n');
}

module.exports.writeln = writeln;

module.exports.write = function(msg) {
	process.stdout.write(msg);
};

function fill(str, count) {
	if (count < 0)
		return;

	return Array(count + 1).join(str);
}
