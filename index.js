/*
 * Copyright 2013-2016 Erudika. http://erudika.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * For issues and patches go to: https://github.com/erudika
 */

'use strict';
var fs = require('fs');
var path = require('path');
var striptags = require('striptags');
var htmlparser = require('htmlparser2');
var jwt = require('jsonwebtoken');
var mime = require('mime-types');
var globby = require('globby');
var chalk = require('chalk');
var ParaClient = require('para-client-js');

var ParaObject = ParaClient.ParaObject;
var Pager = ParaClient.Pager;
var MAX_FILE_SIZE = 400 * 1024;

exports.createAll = function (pc, input, flags) {
	if (!input[1]) {
		fail('No files specified.');
	}

	var files = globby.sync(input[1], {realpath: true});
	var totalSize = 0;
	var createList = [];

	for (var i = 0; i < files.length; i++) {
		var file = files[i];
		var stats = fs.statSync(file);
		var filePath = path.relative(flags.cwd || '.', file);
		var fileType = mime.lookup(file) || 'text/plain';
		var fileBody = '';
		var id;

		if (!stats || !stats.isFile() || stats.size > MAX_FILE_SIZE) {
			console.error(chalk.red('✖'), chalk.yellow(file),
				'is not a file or is too big (max. ', (MAX_FILE_SIZE / 1024), 'KB).');
			continue;
		}

		if (fileType.match(/text\/.*/)) {
			totalSize += stats.size;
			fileBody = readFile(file);
			var json = {};
			if (fileType === 'text/html') {
				json = parseHTML(fileBody);
			} else {
				json = {text: striptags(fileBody).replace(/[\s]+/gi, ' ')};
			}
			if (flags.sanitize) {
				json.text = json.text.replace(/[^\w\s]/gi, ' ').replace(/[\s]+/gi, ' ');
			}
			id = (i === 0 && flags.id) ? flags.id : (json.url || filePath);
			getParaObjects(createList, json, id, flags);
			console.log(chalk.green('✔'), 'Creating', chalk.yellow(id));
		} else if (fileType === 'application/json') {
			id = (i === 0 && flags.id) ? flags.id : filePath;
			totalSize += stats.size;
			getParaObjects(createList, JSON.parse(readFile(file)), id, flags);
			console.log(chalk.green('✔'), 'Creating', chalk.yellow(id));
		} else {
			console.error(chalk.red('✖'), 'Skipping', chalk.yellow(file), '- isn\'t JSON, HTML nor text.');
		}
	}

	pc.createAll(createList).then(function () {
		console.log(chalk.green('✔'), 'Created', createList.length,
			'objects with total size of', Math.round(totalSize / 1024), 'KB.');
	}).catch(function (err) {
		fail('Failed to create documents:', err);
	});
};

exports.readAll = function (pc, flags) {
	if (flags.id) {
		var readIds = flags.id;
		if (!(readIds instanceof Array)) {
			readIds = [readIds];
		}
		pc.readAll(readIds).then(function (data) {
			console.log(JSON.stringify(data, null, 2));
		}).catch(function (err) {
			fail('Failed to read object:', err);
		});
	} else {
		fail('Must specify object id.');
	}
};

exports.updateAll = function (pc, input, flags) {
	if (!input[1]) {
		fail('No files specified.');
	}

	var files = globby.sync(input[1], {realpath: true});
	var updateList = [];

	for (var i = 0; i < files.length; i++) {
		var file = files[i];
		var stats = fs.statSync(file);
		var fileType = mime.lookup(file) || 'text/plain';
		var defaultId = path.relative(flags.cwd || '.', file);

		if (fileType !== 'application/json') {
			console.error(chalk.red('✖'), chalk.yellow(file), 'skipped because it is not a JSON file');
			continue;
		}

		if (!stats || !stats.isFile() || stats.size > MAX_FILE_SIZE) {
			console.error(chalk.red('✖'), chalk.yellow(file),
				'is not a file or is too big (max. ' + (MAX_FILE_SIZE / 1024) + ' KB).');
			continue;
		}
		var fileJSON = JSON.parse(readFile(file));
		var id = (fileJSON.id || defaultId);
		getParaObjects(updateList, fileJSON, id, flags);
		console.log(chalk.green('✔'), 'Updating', chalk.yellow(id));
	}

	pc.updateAll(updateList).then(function () {
		console.log(chalk.green('✔'), 'Updated', updateList.length, 'files.');
	}).catch(function (err) {
		fail('Failed to read object:', err);
	});
};

exports.deleteAll = function (pc, input, flags) {
	if (flags.id || input[1]) {
		var deleteIds = globby.sync(input[1] || ' ', {realpath: true});
		if (deleteIds.length === 0) {
			deleteIds = flags.id instanceof Array ? flags.id : [String(flags.id)];
		}
		for (var i = 0; i < deleteIds.length; i++) {
			deleteIds[i] = path.basename(String(deleteIds[i]));
		}
		pc.deleteAll(deleteIds).then(function () {
			console.log(chalk.green('✔'), 'Deleted objects "', deleteIds, '" from Para.');
		}).catch(function (err) {
			fail('Failed to delete objects:', err);
		});
	} else {
		fail('No files specified.');
	}
};

exports.newKeys = function (pc, config) {
	pc.newKeys().then(function (keys) {
		config.set('secretKey', keys.secretKey);
		console.log(chalk.green('✔'), 'New JWT generated and saved in', chalk.yellow(config.path));
	}).catch(function (err) {
		fail('Failed to generate new secret key:', err);
	});
};

exports.newJWT = function (config) {
	var now = Math.round(new Date().getTime() / 1000);
	var sClaim = JSON.stringify({
		exp: now + (7 * 24 * 60 * 60),
		iat: now,
		nbf: now - 5, // allow for 5 seconds time difference in clocks
		appid: config.get('accessKey')
	});
	config.set('jwt', jwt.sign(sClaim, config.get('secretKey'), {algorithm: 'HS256'}));
	console.log(chalk.green('✔'), 'New JWT generated and saved in', chalk.yellow(config.path));
};

exports.ping = function (pc, config) {
	pc.me().then(function (me) {
		console.log(chalk.green('✔'), 'Authenticated as:', chalk.cyan(me.type + ' ' + me.name + ' (' + me.id + ')'));
	}).catch(function () {
		fail('Connection failed. Check the configuration file', chalk.yellow(config.path));
	});
};

exports.me = function (pc, config) {
	pc.me().then(function (me) {
		console.log(JSON.stringify(me, null, 2));
	}).catch(function () {
		fail('Connection failed. Check the configuration file', chalk.yellow(config.path));
	});
};

exports.search = function (pc, input, flags) {
	var p = new Pager(flags.page, flags.sort, flags.desc, flags.limit);
	pc.findQuery(null, String(input[1]) || '', p).then(function (resp) {
		console.log(JSON.stringify(resp, null, 2));
	}).catch(function (err) {
		fail('Search failed.', err);
	});
};

function getParaObjects(list, json, id, flags) {
	var objects = (json instanceof Array) ? json : [json];
	for (var i = 0; i < objects.length; i++) {
		var pobj = new ParaObject();
		if (flags && flags.type) {
			pobj.setType(flags.type.replace(/[^\w\s]/gi, ' ').replace(/[\s]+/gi, '-'));
		}
		if (flags && flags.encodeId === 'false') {
			pobj.setId(id);
		} else {
			pobj.setId(Buffer.from(id || '').toString('base64'));
		}
		pobj.setName(id);
		pobj.setFields(objects[i]);
		list.push(pobj);
	}
	return objects;
}

function parseHTML(file) {
	var title = null;
	var url = null;
	var text = '';
	var inScript = false;
	var inAnchor = false;
	var parser = new htmlparser.Parser({
		onopentag: function (tag, attribs) {
			if (tag === 'meta' && attribs.property === 'og:title') {
				title = attribs.content;
			}
			if (tag === 'meta' && attribs.property === 'og:url') {
				url = attribs.content;
			}
			inScript = tag === 'script';
			inAnchor = (tag === 'a' && attribs.href && !attribs.href.match(/^http/i));
		},
		ontext: function (txt) {
			if (!inScript && !inAnchor) {
				text += txt;
			}
		},
		onclosetag: function () {
			inScript = false;
			inAnchor = false;
		}
	}, {decodeEntities: true});
	parser.write(file);
	parser.end();
	return {
		name: title,
		url: url,
		text: (text || '').replace(/[\s]+/gi, ' ')
	};
}

function readFile(filePath) {
	return fs.readFileSync(filePath, {encoding: 'utf8'});
}

function fail(msg, err) {
	console.error(chalk.red('✖'), msg || 'Forgive me, I have failed you!', err ? chalk.red(err) : '');
	throw String('✖');
}
