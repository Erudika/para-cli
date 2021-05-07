/*
 * Copyright 2013-2021 Erudika. https://erudika.com
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

/* eslint-disable padding-line-between-statements */
/* eslint-disable max-params */
/* eslint-disable function-call-argument-newline */
/* eslint-disable spaced-comment */
/* eslint-disable capitalized-comments */
/* eslint complexity: ["error", 21] */
/* eslint indent: ["error", "tab"] */
/* eslint object-curly-spacing: ["error", "always"] */

'use strict';
import { statSync, readFileSync } from 'fs';
import { relative, basename } from 'path';
import { TextEncoder } from 'util';
var encoder = new TextEncoder('utf-8');
import striptags from 'striptags';
import { Parser } from 'htmlparser2';
import { createInterface } from 'readline';
import jsonwebtoken from 'jsonwebtoken';
import { lookup } from 'mime-types';
import { sync } from 'globby';
import chalk from 'chalk';
import { Promise } from 'rsvp';
import { ParaClient, ParaObject, Pager } from 'para-client-js';

const { cyan, red, yellow, green } = chalk;
const { sign } = jsonwebtoken;
var MAX_FILE_SIZE = 350 * 1024;
var defaultConfig = { accessKey: '', secretKey: '', endpoint: 'https://paraio.com' };

const _defaultConfig = defaultConfig;
export { _defaultConfig as defaultConfig };

export function setup(config) {
	var rl = createInterface({
		input: process.stdin,
		output: process.stdout
	});
	var that = this;
	rl.question(cyan.bold('Para Access Key: '), function (accessKey) {
		rl.question(cyan.bold('Para Secret Key: '), function (secretKey) {
			rl.question(cyan.bold('Para Endpoint: '), function (endpoint) {
				var access = accessKey || config.get('accessKey');
				var secret = secretKey || config.get('secretKey');
				that.newJWT(access, secret, endpoint, config);
				var pc = new ParaClient(access, secret, { endpoint: endpoint || defaultConfig.endpoint });
				that.ping(pc, config);
				rl.close();
			});
		});
	});
}

export function createAll(pc, input, flags) {
	if (!input[1]) {
		fail('No files specified.');
	}

	var files = sync(input[1], { realpath: true });
	var totalSize = 0;
	var totalObjects = 0;
	var batches = [[]];
	var batchId = 0;
	var batchSize = 0;

	for (var i = 0; i < files.length; i++) {
		var file = files[i];
		var stats = statSync(file);
		var filePath = relative(flags.cwd || '.', file);
		var fileType = lookup(file) || 'text/plain';
		var fileBody = '';
		var id;

		if (!stats || !stats.isFile()) {
			console.error(red('✖'), yellow(file), 'is not a file.');
			continue;
		}

		if (fileType.match(/text\/.*/)) {
			totalObjects++;
			totalSize += stats.size;
			batchSize += stats.size;
			fileBody = readFile(file);
			var json = {};
			if (fileType === 'text/html') {
				json = parseHTML(fileBody);
			} else {
				json = { text: striptags(fileBody).replace(/[\s]+/gi, ' ') };
			}

			if (flags.sanitize) {
				json.text = json.text.replace(/^[0-9\p{L}\s]+/giu, ' ').replace(/[\s]+/gi, ' ');
			}

			id = (i === 0 && flags.id) ? flags.id : (json.url || filePath);
			console.log(green('✔'), 'Creating', yellow(id));
			var textEncoded = encoder.encode(json.text);
			//batchSize += textEncoded.length;
			if (textEncoded.length > MAX_FILE_SIZE) {
				console.log(red('!'), yellow('File is larger than',
					MAX_FILE_SIZE / 1024, 'KB - splitting into chunks...'));
				sendFileChunk(1, textEncoded, json, id, flags, 0, MAX_FILE_SIZE, pc);
			} else {
				if (batchSize > MAX_FILE_SIZE) {
					batchId++;
					batches[batchId] = [];
					console.log(yellow('*'), 'Batch', yellow(batchId), 'is', Math.round(batchSize / 1024), 'KB.');
					batchSize = 0;
				}

				addObjectsToBatch(batches[batchId], json, id, flags);
				console.log(green('✔'), 'Creating', yellow(id));
			}
		} else if (fileType === 'application/json') {
			totalObjects++;
			id = (i === 0 && flags.id) ? flags.id : filePath;
			totalSize += stats.size;
			batchSize += stats.size;
			if (batchSize > MAX_FILE_SIZE) {
				batchId++;
				batches[batchId] = [];
				console.log(yellow('*'), 'Batch', yellow(batchId), 'is', Math.round(batchSize / 1024), 'KB.');
				batchSize = 0;
			}

			addObjectsToBatch(batches[batchId], JSON.parse(readFile(file)), id, flags);
			console.log(green('✔'), 'Creating', yellow(id));
		} else {
			console.error(red('✖'), 'Skipping', yellow(file), '- isn\'t JSON, HTML nor text.');
		}
	}

	for (var k = 0; k < batches.length; k++) {
		var objectsList = batches[k];
		if (objectsList.length > 0) {
			pc.createAll(objectsList).then(function (data) {
				console.log(green('✔'), 'Created', data.length, 'objects.');
			}).catch(function (err) {
				fail('Failed to create documents:', err);
			});
		}
	}

	console.log(green('✔'), 'Created', totalObjects, 'objects with a total size of', Math.round(totalSize / 1024), 'KB.');
}

export function readAll(pc, flags) {
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
		fail('Must specify object id(s).');
	}
}

export function updateAll(pc, input, flags) {
	if (!input[1]) {
		fail('No files specified.');
	}

	var files = sync(input[1], { realpath: true });
	var updateList = [];

	for (var i = 0; i < files.length; i++) {
		var file = files[i];
		var stats = statSync(file);
		var fileType = lookup(file) || 'text/plain';
		var defaultId = relative(flags.cwd || '.', file);

		if (fileType !== 'application/json') {
			console.error(red('✖'), yellow(file), 'skipped because it is not a JSON file');
			continue;
		}

		if (!stats || !stats.isFile()) {
			console.error(red('✖'), yellow(file), 'is not a file.');
			continue;
		}

		var fileJSON = JSON.parse(readFile(file));
		var id = (fileJSON.id || defaultId);
		addObjectsToBatch(updateList, fileJSON, id, flags);
		console.log(green('✔'), 'Updating', yellow(id));
	}

	pc.updateAll(updateList).then(function () {
		console.log(green('✔'), 'Updated', updateList.length, 'files.');
	}).catch(function (err) {
		fail('Failed to read object:', err);
	});
}

export function deleteAll(pc, input, flags) {
	if (flags.id || input[1]) {
		var deleteIds = sync(input[1] || ' ', { realpath: true });
		if (deleteIds.length === 0) {
			deleteIds = flags.id instanceof Array ? flags.id : [String(flags.id)];
		}

		for (var i = 0; i < deleteIds.length; i++) {
			deleteIds[i] = basename(String(deleteIds[i]));
		}

		pc.deleteAll(deleteIds).then(function () {
			console.log(green('✔'), 'Deleted objects "', deleteIds, '" from Para.');
		}).catch(function (err) {
			fail('Failed to delete objects:', err);
		});
	} else {
		fail('No files specified.');
	}
}

export function newKeys(pc, config) {
	pc.newKeys().then(function (keys) {
		config.set('secretKey', keys.secretKey);
		console.log(green('✔'), 'New JWT generated and saved in', yellow(config.path));
	}).catch(function (err) {
		fail('Failed to generate new secret key:', err);
	});
}

export function newJWT(accessKey, secretKey, endpoint, config) {
	if (!accessKey || accessKey.length < 3 || !secretKey || secretKey.length < 6) {
		fail('Invalid credentials.');
	}

	var now = Math.round(new Date().getTime() / 1000);
	var sClaim = JSON.stringify({
		exp: now + (7 * 24 * 60 * 60),
		iat: now,
		nbf: now - 5, // allow for 5 seconds time difference in clocks
		appid: accessKey
	});
	config.set('accessKey', accessKey);
	config.set('secretKey', secretKey);
	config.set('endpoint', endpoint || config.get('endpoint'));
	config.set('jwt', sign(sClaim, secretKey, { algorithm: 'HS256' }));
	console.log(green('✔'), 'New JWT generated and saved in', yellow(config.path));
}

export function newApp(pc, input, flags) {
	if (!input[1]) {
		fail('App name not specified.');
	}

	var appid = input[1];
	var req = pc.invokeGet('_setup/' + appid, { name: (flags.name || appid), shared: (flags.shared || false) });
	pc.getEntity(req).then(function (resp) {
		if (resp && resp.secretKey) {
			console.log(green('✔'), 'App created:');
			console.log(JSON.stringify(resp, null, 2));
		} else {
			console.log(green('✔'), yellow('App "' + appid + '" already exists.'));
		}
	}).catch(function (err) {
		fail('Failed to create app:', err);
	});
}

export function ping(pc, config) {
	pc.me().then(function (mee) {
		pc.getServerVersion().then(function (ver) {
			console.log(green('✔'), 'Connected to Para server ' + cyan.bold('v' + ver),
				'on ' + cyan(pc.endpoint) + '. Authenticated as:',
				cyan(mee.type + ' ' + mee.name + ' (' + mee.id + ')'));
		}).catch(function () {
			fail('Connection failed. Run "para-cli setup" or check the configuration file', yellow(config.path));
		});
	}).catch(function () {
		fail('Connection failed. Run "para-cli setup" or check the configuration file', yellow(config.path));
	});
}

export function me(pc, config) {
	pc.me().then(function (mee) {
		console.log(JSON.stringify(mee, null, 2));
	}).catch(function () {
		fail('Connection failed. Server might be down. Check the configuration file', yellow(config.path));
	});
}

function promiseWhile(results, fn) {
	return new Promise(function (resolve, _reject) {
		function loop() {
			return Promise.resolve(fn()).then(function (result) {
				if (result && result.length > 0) {
					results = results.concat(result);
					return loop();
				}
				resolve();
			});
		}
		loop();
	});
}

export function search(pc, input, flags) {
	var p = new Pager(flags.page, flags.sort, flags.desc, flags.limit);
	if (flags.lastKey) {
		p.lastKey = flags.lastKey;
	}

	if (flags.page && flags.page === 'all') {
		var results = [];
		p.sortby = '_docid';
		p.page = 1;

		promiseWhile(results, function () {
			return pc.findQuery(getType(flags.type), String(input[1]) || '', p);
		}).then(function () {
			console.log(JSON.stringify(results, null, 2));
		}).catch(function (err) {
			fail('Search failed.', err);
		});
	} else {
		pc.findQuery(getType(flags.type), String(input[1]) || '', p).then(function (resp) {
			console.log(JSON.stringify(resp, null, 2));
		}).catch(function (err) {
			fail('Search failed.', err);
		});
	}
}

export function appSettings(pc, config) {
	pc.appSettings().then(function (settings) {
		console.log(JSON.stringify(settings, null, 2));
	}).catch(function () {
		fail('Connection failed. Check the configuration file', yellow(config.path));
	});
}

export function rebuildIndex(pc, config, flags) {
	pc.rebuildIndex(flags.destinationIndex).then(function (response) {
		console.log(JSON.stringify(response, null, 2));
	}).catch(function (err) {
		fail('Reindex failed.', err);
	});
}

function sendFileChunk(chunkId, textEncoded, json, id, flags, start, end, pc, decoder) {
	if (start > 0 && textEncoded[start] !== 32) {
		for (var i = 0; i < 100 && start - i >= 0; i++) {
			if (textEncoded[start - i] === 32) {
				start = start - i + 1;
				break;
			}
		}
	}

	if (end >= textEncoded.length) {
		end = textEncoded.length;
	}

	if (textEncoded[end] !== 32) {
		for (var j = 0; j < 100 && end - j >= 0; j++) {
			if (textEncoded[end - j] === 32) {
				end -= j;
				break;
			}
		}
	}

	if (typeof decoder === 'undefined') {
		decoder = new TextDecoder();
	}

	var chunk = textEncoded.slice(start, end);
	var text = decoder.decode(chunk);
	var obj = getParaObject(Object.assign({}, json, { text: text }), id + '_chunk' + chunkId, flags);
	if (text && text.trim().length > 0) {
		obj.chunkid = chunkId;
		pc.create(obj).then(function () {
			console.log(green('✔'), 'Created object chunk', yellow(chunkId), 'with size',
				Math.round(chunk.length / 1024), 'KB.');
			if (end < textEncoded.length) {
				sendFileChunk(++chunkId, textEncoded, json, id, flags, start + MAX_FILE_SIZE, end + MAX_FILE_SIZE, pc, decoder);
			}
		}).catch(function (err) {
			fail('Failed to create chunk:', err);
		});
	}
}

function addObjectsToBatch(list, json, id, flags) {
	var objects = (json instanceof Array) ? json : [json];
	for (var i = 0; i < objects.length; i++) {
		list.push(getParaObject(objects[i], id, flags));
	}

	return objects;
}

function getParaObject(json, id, flags) {
	var pobj = new ParaObject();
	if (flags && flags.type) {
		pobj.setType(getType(flags.type));
	}

	id = String(id);
	if (flags && flags.encodeId === 'false') {
		pobj.setId(id);
	} else {
		pobj.setId(Buffer.from(id || '').toString('base64'));
	}

	pobj.setName(id);
	pobj.setFields(json);
	return pobj;
}

function getType(type) {
	if (type && type.trim().length > 0) {
		return type.replace(/[^\w\s]/giu, ' ').replace(/[\s]+/gi, '-');
	}

	return null;
}

function parseHTML(file) {
	var title = null;
	var url = null;
	var text = '';
	var inScript = false;
	var inAnchor = false;
	var parser = new Parser({
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
	}, { decodeEntities: true });
	parser.write(file);
	parser.end();
	return {
		name: title,
		url: url,
		text: (text || '').replace(/[\s]+/gi, ' ')
	};
}

function readFile(filePath) {
	return readFileSync(filePath, { encoding: 'utf8' });
}

function fail(msg, err) {
	var errMsg = err && err.response && err.response.body && err.response.body.message ? err.response.body.message : err || '';
	var code = err && err.response && err.response.status ? '(' + err.response.status + ' ' + err.response.res.statusMessage + ')' : '';
	console.error(red('✖'), msg || 'Forgive me, I have failed you!', red(errMsg), red(code));
	process.exitCode = 1;
}
