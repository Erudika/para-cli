/*
 * Copyright 2013-2026 Erudika. https://erudika.com
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

/* global console, process, Buffer */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { URL } from 'node:url';
import { TextEncoder } from 'node:util';
import input from '@inquirer/input';
import password from '@inquirer/password';
import chalk from 'chalk';
import { globbySync } from 'globby';
import { Parser } from 'htmlparser2';
import jsonwebtoken from 'jsonwebtoken';
import { lookup } from 'mime-types';
import { Pager, ParaClient, ParaObject } from 'para-client-js';
import striptags from 'striptags';
import apiClient from 'superagent';

const encoder = new TextEncoder('utf-8');
const { cyan, red, yellow, green } = chalk;
const { sign } = jsonwebtoken;
const MAX_FILE_SIZE = 350 * 1024;
var defaultConfig = { accessKey: '', secretKey: '', endpoint: 'https://paraio.com' };

const _defaultConfig = defaultConfig;

export { _defaultConfig as defaultConfig };

export async function setup(config) {
	try {
		const accessKey = await input({
			message: 'Para Access Key:',
			default: config.get('accessKey') || 'app:para'
		});

		const secretKey = await password({
			message: 'Para Secret Key:',
			mask: '*'
		});

		const endpoint = await input({
			message: 'Para Endpoint:',
			default: defaultConfig.endpoint
		});

		var access = (accessKey || config.get('accessKey') || 'app:para').trim();
		var secret = (secretKey || config.get('secretKey')).trim();
		var endpointValue = (endpoint || defaultConfig.endpoint).trim();

		newJWT(access, secret, endpointValue, config);
		ping(config);

		if (access === 'app:para') {
			listApps(config, {}, access, async () => {
				// if none, ask to create one
				const shouldCreate = await input({
					message: 'Would you like to create a new Para app? [Y/n]',
					default: 'Y'
				});

				const Yn = shouldCreate.trim();
				if ('' === Yn || 'y' === Yn.toLowerCase()) {
					const appname = await input({
						message: 'App name:'
					});
					newApp(['', appname], config, {});
				}
			});
		}
	} catch (error) {
		if (error.name === 'ExitPromptError') {
			console.log('\nSetup cancelled.');
		} else {
			throw error;
		}
	}
}

export function createAll(input, config, flags = {}) {
	if (!input[1]) {
		fail('No files specified.');
		return;
	}

	const pc = getClient(config, flags);
	var files = globbySync(input[1], { realpath: true });
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

		if (!stats?.isFile()) {
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
				json.text = json.text.replace(/[^0-9\p{L}]+/giu, ' ').replace(/[\s]+/gi, ' ');
			}

			id = i === 0 && flags.id ? flags.id : json.url || filePath;
			console.log(green('✔'), 'Creating', yellow(id));
			var textEncoded = encoder.encode(json.text);
			//batchSize += textEncoded.length;
			if (textEncoded.length > MAX_FILE_SIZE) {
				console.log(red('!'), yellow('File is larger than', MAX_FILE_SIZE / 1024, 'KB - splitting into chunks...'));
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
			id = i === 0 && flags.id ? flags.id : filePath;
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
			console.error(red('✖'), 'Skipping', yellow(file), "- isn't JSON, HTML nor text.");
		}
	}

	for (var k = 0; k < batches.length; k++) {
		var objectsList = batches[k];
		if (objectsList.length > 0) {
			pc.createAll(objectsList)
				.then((data) => {
					console.log(green('✔'), 'Created', data.length, 'objects.');
				})
				.catch((err) => {
					fail('Failed to create documents:', err);
				});
		}
	}

	console.log(green('✔'), 'Created', totalObjects, 'objects with a total size of', Math.round(totalSize / 1024), 'KB.');
}

export function readAll(config, flags = {}) {
	const pc = getClient(config, flags);
	if (flags.id) {
		var readIds = flags.id;
		if (!Array.isArray(readIds)) {
			readIds = [readIds];
		}

		pc.readAll(readIds)
			.then((data) => {
				console.log(JSON.stringify(data, null, 2));
			})
			.catch((err) => {
				fail('Failed to read object:', err);
			});
	} else {
		fail('Must specify object id(s).');
	}
}

export function updateAll(input, config, flags = {}) {
	if (!input[1]) {
		fail('No files specified.');
		return;
	}

	const pc = getClient(config, flags);
	var files = globbySync(input[1], { realpath: true });
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

		if (!stats?.isFile()) {
			console.error(red('✖'), yellow(file), 'is not a file.');
			continue;
		}

		var fileJSON = JSON.parse(readFile(file));
		var id = fileJSON.id || defaultId;
		addObjectsToBatch(updateList, fileJSON, id, flags);
		console.log(green('✔'), 'Updating', yellow(id));
	}

	pc.updateAll(updateList)
		.then(() => {
			console.log(green('✔'), 'Updated', updateList.length, 'files.');
		})
		.catch((err) => {
			fail('Failed to read object:', err);
		});
}

export function deleteAll(input, config, flags = {}) {
	const pc = getClient(config, flags);
	if (flags.id || input[1]) {
		var deleteIds = globbySync(input[1] || ' ', { realpath: true });
		if (deleteIds.length === 0) {
			deleteIds = Array.isArray(flags.id) ? flags.id : [String(flags.id)];
		}

		for (var i = 0; i < deleteIds.length; i++) {
			deleteIds[i] = basename(String(deleteIds[i]));
		}

		pc.deleteAll(deleteIds)
			.then(() => {
				console.log(green('✔'), 'Deleted objects "', deleteIds, '" from Para.');
			})
			.catch((err) => {
				fail('Failed to delete objects:', err);
			});
	} else {
		fail('No files specified.');
	}
}

export function newKeys(config, flags = {}) {
	const pc = getClient(config, flags);
	pc.newKeys()
		.then((keys) => {
			config.set('secretKey', keys.secretKey);
			console.log(green('✔'), 'New JWT generated and saved in', yellow(config.path));
		})
		.catch((err) => {
			fail('Failed to generate new secret key:', err);
		});
}

export function newJWT(accessKey, secretKey, endpoint, config, flags) {
	if (!accessKey || accessKey.length < 3 || !secretKey || secretKey.length < 6) {
		fail('Invalid credentials.');
		return;
	}

	var now = Math.round(Date.now() / 1000);
	var sClaim = JSON.stringify({
		exp: now + 7 * 24 * 60 * 60,
		iat: now,
		nbf: now - 5, // allow for 5 seconds time difference in clocks
		appid: accessKey
	});
	var selectedApp = config.get('selectedApp');
	if (selectedApp?.secretKey) {
		selectedApp.accessKey = accessKey;
		selectedApp.secretKey = secretKey;
		config.set('selectedApp', selectedApp);
	} else {
		config.set('accessKey', accessKey);
		config.set('secretKey', secretKey);
	}
	config.set('endpoint', endpoint || config.get('endpoint'));
	config.set('jwt', sign(sClaim, secretKey, { algorithm: 'HS256' }));
	if (flags?.print) {
		console.log(yellow(config.get('jwt')));
	} else {
		console.log(green('✔'), 'New JWT generated and saved in', yellow(config.path));
	}
}

export function newApp(input, config, flags = {}) {
	if (!input[1]) {
		fail('App name not specified.');
		return;
	}

	const pc = getClient(config, flags);
	var appid = input[1];
	var req = pc.invokeGet(`_setup/${appid}`, { name: flags.name || appid, shared: flags.shared || false });
	pc.getEntity(req)
		.then((resp) => {
			if (resp?.secretKey) {
				console.log(green('✔'), 'App created:');
				console.log(JSON.stringify(resp, null, 2));
			} else {
				console.log(green('✔'), yellow(`App "${appid}" already exists.`));
			}
		})
		.catch((err) => {
			fail('Failed to create app:', err);
		});
}

export async function deleteApp(inputArgs, config, flags = {}) {
	if (!inputArgs[1]) {
		fail('App id not specified.');
		return;
	}
	const pc = getClient(config, flags);
	var appid = inputArgs[1];
	if (appid.indexOf('app:') < 0) {
		appid = `app:${appid}`;
	}

	try {
		const confirm = await input({
			message: `${red.bold(`Are you sure you want to delete ${appid}? ALL DATA FOR THAT APP WILL BE LOST! `)}yes/No`
		});

		if (confirm === 'yes') {
			pc.invokeDelete(`apps/${appid}`, {})
				.then((resp) => {
					if (resp?.ok) {
						console.log(green('✔'), `App ${red.bold(appid)} was deleted!`);
					} else {
						console.log(green('✔'), yellow(`App "${appid}" could not be deleted.`));
					}
				})
				.catch((err) => {
					fail('Failed to delete app:', err);
				});
		}
	} catch (error) {
		if (error.name === 'ExitPromptError') {
			console.log('\nDelete cancelled.');
		} else {
			throw error;
		}
	}
}

export function ping(config, flags = {}) {
	const pc = getClient(config, flags);
	pc.me()
		.then((mee) => {
			pc.getServerVersion()
				.then((ver) => {
					console.log(
						green('✔'),
						`Connected to Para server ${cyan.bold(`v${ver}`)}`,
						`on ${cyan(pc.endpoint)}. Authenticated as:`,
						cyan(`${mee.type} ${mee.name} (${mee.id})`)
					);
				})
				.catch(() => {
					fail('Connection failed. Run "para-cli setup" or check the configuration file', yellow(config.path));
					process.exit(1);
				});
		})
		.catch(() => {
			fail('Connection failed. Run "para-cli setup" or check the configuration file', yellow(config.path));
			process.exit(1);
		});
}

export function me(config, flags = {}) {
	const pc = getClient(config, flags);
	pc.me()
		.then((mee) => {
			console.log(JSON.stringify(mee, null, 2));
		})
		.catch(() => {
			fail('Connection failed. Server might be down. Check the configuration file', yellow(config.path));
		});
}

export function types(config, flags = {}) {
	const pc = getClient(config, flags);
	const _types = pc
		.getEntity(pc.invokeGet('_types'))
		.then((data) => {
			console.log(JSON.stringify(data, null, 2));
		})
		.catch(() => {
			fail('Connection failed. Server might be down. Check the configuration file', yellow(config.path));
		});
}

export function exportData(config, flags = {}) {
	const pc = getClient(config, flags);
	pc.invokeGet('/_export')
		.then((data) => {
			try {
				var filename = data.headers['content-disposition'] || 'export.zip';
				var filesize = Math.round(((data.headers['content-length'] || 0) / 1000000) * 100) / 100;
				filename = filename.substring(filename.lastIndexOf('=') + 1);
				writeFileSync(filename, data.body);
				console.log(green('✔'), yellow(`Exported ${filesize}MB of data to file ${filename}`));
			} catch (e) {
				console.error(e);
			}
		})
		.catch(() => {
			fail('Connection failed. Server might be down. Check the configuration file', yellow(config.path));
		});
}

export function importData(input, config, flags = {}) {
	if (!input[1]) {
		fail('No file to import.');
		return;
	}
	const pc = getClient(config, flags);
	if (!config.get('jwt')) {
		newJWT(config.get('accessKey'), config.get('secretKey'), config.get('endpoint'), config);
	}
	var headers = {
		'User-Agent': 'Para CLI tool',
		'Content-Type': 'application/zip',
		Authorization: `Bearer ${config.get('jwt')}`
	};
	try {
		apiClient
			.put(`${pc.endpoint}/v1/_import`)
			.set(headers)
			.send(readFileSync(resolve(input[1])))
			.then((res) => {
				console.log(green('✔'), `${yellow(`Imported ${res.body.count} object into app "${res.body.appid}`)}"`);
			})
			.catch((e) => {
				fail(`Import request failed. ${e}`);
			});
	} catch (e) {
		fail(`Import request failed: ${e}`);
	}
}

function promiseWhile(results, fn) {
	return new Promise((resolve, _reject) => {
		function loop() {
			return Promise.resolve(fn()).then((result) => {
				if (result && result.length > 0) {
					result.forEach((res) => {
						results.push(res);
					});
					return loop();
				}
				resolve();
			});
		}
		loop();
	});
}

export function search(input, config, flags = {}) {
	const pc = getClient(config, flags);
	var p = new Pager(flags.page, flags.sort, flags.desc, flags.limit);
	if (flags.lastKey) {
		p.lastKey = flags.lastKey;
	}

	if (flags.page && flags.page === 'all') {
		var results = [];
		p.sortby = '_docid';
		p.page = 1;

		promiseWhile(results, () => pc.findQuery(getType(flags.type), String(input[1]) || '', p))
			.then(() => {
				console.log(JSON.stringify(results, null, 2));
			})
			.catch((err) => {
				fail('Search failed.', err);
			});
	} else {
		pc.findQuery(getType(flags.type), String(input[1]) || '', p)
			.then((resp) => {
				console.log(JSON.stringify(resp, null, 2));
			})
			.catch((err) => {
				fail('Search failed.', err);
			});
	}
}

export function appSettings(config, flags = {}) {
	const pc = getClient(config, flags);
	pc.appSettings()
		.then((settings) => {
			console.log(JSON.stringify(settings, null, 2));
		})
		.catch(() => {
			fail('Connection failed. Check the configuration file', yellow(config.path));
		});
}

export function rebuildIndex(config, flags = {}) {
	const pc = getClient(config, flags);
	pc.rebuildIndex(flags.destinationIndex)
		.then((response) => {
			console.log(JSON.stringify(response, null, 2));
		})
		.catch((err) => {
			fail('Reindex failed.', err);
		});
}

export function listApps(config, flags, parentAccessKey, failureCallback) {
	var pc = getClient(config, flags);
	var selectedEndpoint = getSelectedEndpoint(config, flags);
	var p = new Pager();
	var results = [];
	p.sortby = '_docid';
	p.page = 1;
	promiseWhile(results, () => pc.findQuery('app', '*', p))
		.then(() => {
			var apps = results.map((app) => app.appIdentifier.trim());
			if (apps.length) {
				console.log(
					'Found',
					p.count,
					`apps on ${cyan(selectedEndpoint.endpoint)}:\n`,
					yellow('[') + green(apps.join(yellow('] ['))) + yellow(']')
				);
				console.log(
					'\nTyping',
					cyan('para-cli select'),
					green(apps[0]),
					'will switch to that app. \nCurrent app:',
					green(parentAccessKey)
				);
				process.exit(0);
			} else {
				failureCallback();
			}
		})
		.catch((_err) => {
			failureCallback();
		});
}

export function selectApp(input, config, flags) {
	var selectedEndpoint = getSelectedEndpoint(config, flags);
	var accessKey = selectedEndpoint.accessKey;
	var secretKey = selectedEndpoint.secretKey;
	if (accessKey === 'app:para' && secretKey) {
		var selectedApp = `app:${(input[1] || 'para').trim()}`;
		if (selectedApp === 'app:para') {
			config.set('selectedApp', selectedEndpoint);
			console.log(green('✔'), 'Selected', green(selectedApp), 'as the current app.');
			return;
		}
		var now = Math.round(Date.now() / 1000);
		var jwt = sign(
			JSON.stringify({
				iat: now,
				exp: now + 10,
				nbf: now - 5, // allow for 5 seconds time difference in clocks
				appid: accessKey,
				getCredentials: selectedApp
			}),
			secretKey,
			{ algorithm: 'HS256' }
		);
		var paraClient = getClient(config, flags);
		paraClient.setAccessToken(jwt);
		paraClient
			.me(jwt)
			.then((data) => {
				if (data?.credentials) {
					config.set('selectedApp', data.credentials);
					console.log(green('✔'), 'Selected', green(selectedApp), 'as the current app.');
				} else {
					fail(`That did not work -${red(input[1])} try updating Para to the latest version.`);
				}
			})
			.catch((_err) => {
				fail(`App ${red(input[1])} not found!`);
			});
	} else {
		fail('This command only works when Para CLI is configured to use the keys for the root app.');
	}
}

export function listEndpoints(config, flags, failureCallback) {
	var accessKey = flags.accessKey || process.env.PARA_ACCESS_KEY || config.get('accessKey');
	var secretKey = flags.secretKey || process.env.PARA_SECRET_KEY || config.get('secretKey');
	var endpoint = flags.endpoint || process.env.PARA_ENDPOINT || config.get('endpoint');
	var endpoints = config.get('endpoints') || [];
	var list = [{ endpoint: endpoint, accessKey: accessKey, secretKey: secretKey }].concat(endpoints);
	if (list.length === 0) {
		failureCallback();
		return [];
	}
	for (var i = 0; i < list.length; i++) {
		var ep = list[i];
		var selected = (config.get('selectedEndpoint') || 0) === i;
		var rootAppConfigured = ep.accessKey === 'app:para' && ep.secretKey.length > 10;
		console.log(
			yellow(selected ? ' ➤' : '  ', `${i + 1}. `) + cyan(ep.endpoint),
			rootAppConfigured ? green('✔ root app configured') : red('root app not configured')
		);
	}
	return list;
}

export async function addEndpoint(config) {
	try {
		const endpoint = await input({
			message: 'Para Endpoint:'
		});

		if (!isValidUrl(endpoint)) {
			fail('Endpoint must be a valid URL.');
			return;
		}

		const secretKey = await password({
			message: 'Para Secret Key (for root app app:para):',
			mask: '*'
		});

		var endpoints = config.get('endpoints') || [];
		var existing = false;
		for (var i = 0; i < endpoints.length; i++) {
			var ep = endpoints[i];
			if (ep.endpoint === endpoint) {
				ep.secretKey = secretKey;
				existing = true;
			}
		}
		if (!existing) {
			endpoints.push({ accessKey: 'app:para', secretKey: secretKey, endpoint: endpoint });
		}
		config.set('endpoints', endpoints);
		ping(config);
	} catch (error) {
		if (error.name === 'ExitPromptError') {
			console.log('\nAdd endpoint cancelled.');
		} else {
			throw error;
		}
	}
}

export async function removeEndpoint(config, flags) {
	var list = listEndpoints(config, flags, () => {
		console.log('No endpoints found.');
	});

	try {
		const index = await input({
			message: 'Type the number of the Para endpoint to remove:'
		});

		var selectedEndpoint = 0;
		if (!Number.isNaN(index) && index <= list.length && index >= 1) {
			selectedEndpoint = index - 1;
		}
		var url = list[selectedEndpoint].endpoint;
		if (selectedEndpoint === 0) {
			config.set('accessKey', 'app:para');
			config.set('secretKey', '');
			config.set('endpoint', defaultConfig.endpoint);
		} else {
			if (selectedEndpoint === config.get('selectedEndpoint')) {
				config.delete('selectedEndpoint');
				config.delete('selectedApp');
			}
			list.splice(selectedEndpoint, 1);
			list.shift();
			config.set('endpoints', list);
		}
		console.log(`Removed endpoint: ${cyan(url)}`);
	} catch (error) {
		if (error.name === 'ExitPromptError') {
			console.log('\nRemove endpoint cancelled.');
		} else {
			throw error;
		}
	}
}

export async function selectEndpoint(config, flags) {
	var list = listEndpoints(config, flags, () => {
		console.log('No endpoints found.');
	});

	try {
		const index = await input({
			message: 'Type the number of the Para endpoint to select:'
		});

		var selectedEndpoint = 0;
		if (!Number.isNaN(index) && index <= list.length && index >= 1) {
			selectedEndpoint = index - 1;
		}
		config.delete('selectedApp');
		config.set('selectedEndpoint', selectedEndpoint);
		console.log(`Selected endpoint: ${cyan(list[selectedEndpoint].endpoint)}`);
	} catch (error) {
		if (error.name === 'ExitPromptError') {
			console.log('\nSelect endpoint cancelled.');
		} else {
			throw error;
		}
	}
}

export function parseEndpoint(endpoint) {
	try {
		var url = new URL(endpoint);
		if (url.pathname !== '/') {
			var x = { endpoint: `${url.protocol}//${url.host}`, apiPath: `${url.pathname.replace(/\/*$/, '')}/v1/` };
			return x;
		}
	} catch (e) {
		fail(`Invalid Para endpoint: ${endpoint}`, e);
	}
	return { endpoint: endpoint };
}

function getSelectedEndpoint(config, flags) {
	var accessKey = flags.accessKey || process.env.PARA_ACCESS_KEY || config.get('accessKey');
	var secretKey = flags.secretKey || process.env.PARA_SECRET_KEY || config.get('secretKey');
	var endpoint = flags.endpoint || process.env.PARA_ENDPOINT || config.get('endpoint');
	var endpoints = [{ endpoint: endpoint, accessKey: accessKey, secretKey: secretKey }].concat(
		config.get('endpoints') || []
	);
	try {
		return endpoints[config.get('selectedEndpoint') || 0];
	} catch (_e) {
		config.delete('selectedEndpoint');
		return endpoints[0];
	}
}

function getClient(config, flags = {}) {
	var selectedEndpoint = getSelectedEndpoint(config, flags);
	return new ParaClient(
		selectedEndpoint.accessKey,
		selectedEndpoint.secretKey,
		parseEndpoint(selectedEndpoint.endpoint)
	);
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
	var obj = getParaObject(Object.assign({}, json, { text: text }), `${id}_chunk${chunkId}`, flags);
	if (text && text.trim().length > 0) {
		obj.chunkid = chunkId;
		pc.create(obj)
			.then(() => {
				console.log(
					green('✔'),
					'Created object chunk',
					yellow(chunkId),
					'with size',
					Math.round(chunk.length / 1024),
					'KB.'
				);
				if (end < textEncoded.length) {
					sendFileChunk(
						++chunkId,
						textEncoded,
						json,
						id,
						flags,
						start + MAX_FILE_SIZE,
						end + MAX_FILE_SIZE,
						pc,
						decoder
					);
				}
			})
			.catch((err) => {
				fail('Failed to create chunk:', err);
			});
	}
}

function addObjectsToBatch(list, json, id, flags) {
	var objects = Array.isArray(json) ? json : [json];
	for (var i = 0; i < objects.length; i++) {
		list.push(getParaObject(objects[i], id, flags));
	}

	return objects;
}

function getParaObject(json, id, flags) {
	var pobj = new ParaObject();
	if (flags?.type) {
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
	var parser = new Parser(
		{
			onopentag: (tag, attribs) => {
				if (tag === 'meta' && attribs.property === 'og:title') {
					title = attribs.content;
				}

				if (tag === 'meta' && attribs.property === 'og:url') {
					url = attribs.content;
				}

				inScript = tag === 'script';
				inAnchor = tag === 'a' && attribs.href && !attribs.href.match(/^http/i);
			},
			ontext: (txt) => {
				if (!inScript && !inAnchor) {
					text += ` ${txt}`;
				}
			},
			onclosetag: () => {
				inScript = false;
				inAnchor = false;
			}
		},
		{ decodeEntities: true }
	);
	parser.write(file);
	parser.end();
	return {
		name: title,
		url: url,
		text: (text || ' ').replace(/[\s]+/gi, ' ')
	};
}

function isValidUrl(url) {
	try {
		new URL(url);
		return true;
	} catch (_err) {
		return false;
	}
}

function readFile(filePath) {
	return readFileSync(filePath, { encoding: 'utf8' });
}

function fail(msg, err) {
	var errMsg = err?.response?.body?.message ? err.response.body.message : err || '';
	var code = err?.response?.status ? `(${err.response.status} ${err.response.res.statusMessage})` : '';
	console.error(red('✖'), msg || 'Forgive me, I have failed you!', red(errMsg), red(code));
	process.exitCode = 1;
}
