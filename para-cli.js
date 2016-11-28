#!/usr/bin/env node

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

/* global __dirname */
'use strict';

var updateNotifier = require('update-notifier');
var ParaClient = require('para-client-js');
var Configstore = require('configstore');
var figlet = require('figlet');
var chalk = require('chalk');
var meow = require('meow');
var paraCLI = require('./');

var cli = meow(`
	Usage:
	  $ para-cli [command] [file]

	Commands:
	  create <file|glob> [--id] [--type]   Persists files as Para objects and makes them searchable
	  read --id 123 [--id 345 ...]         Fetches objects with the given ids
	  update <file.json|glob> ...          Updates Para objects with the data from a JSON file (must contain id field)
	  delete [glob] --id 123 ...           Deletes one or more objects from Para
	  new-key                              Generates a new secret key and saves it to config.json
	  new-jwt                              Generates a new JWT super token to be used for app authentication
	  ping                                 Tests the connection to the Para API and returns the auth. object

	Options:
	  --type          Sets the "type" field of an object
	  --id            Sets the "id" field of an object
	  --sanitize      Strips all symbols from input files
	  --accessKey     Sets the Para access key
	  --secretKey     Sets the Para secret key
	  --endpoint      Sets the URL of the Para server
	  --help          Prints the list of commands
	  --version       Prints the version of the program

	Examples:
	  $ para-cli create my-blog-post.md
	  $ para-cli read --id my-blog-post.md
	  $ para-cli create index.html --type webpage --id "My new article" --sanitize
	  $ para-cli delete --id 123 --id "my-blog-post.md"
	  $ para-cli new-key

`);

updateNotifier({pkg: cli.pkg}).notify();

var config = new Configstore(cli.pkg.name, {
	accessKey: cli.flags.accessKey || process.env.PARA_ACCESS_KEY || 'app:app',
	secretKey: cli.flags.secretKey || process.env.PARA_SECRET_KEY || 'secret',
	endpoint: cli.flags.endpoint || process.env.PARA_ENDPOINT || 'https://paraio.com'
});

var logo = chalk.blue(figlet.textSync(' para CLI', {font: 'Slant'})) + '\n';
var help = logo + cli.help;
var input = cli.input;
var flags = cli.flags;

var pc = new ParaClient(config.get('accessKey'), config.get('secretKey'), {
	endpoint: config.get('endpoint')
});

if (!input[0]) {
	console.log(help);
}

if (input[0] === 'create') {
	paraCLI.createAll(pc, input, flags);
}

if (input[0] === 'read') {
	paraCLI.readAll(pc, flags);
}

if (input[0] === 'update') {
	paraCLI.updateAll(pc, input);
}

if (input[0] === 'delete') {
	paraCLI.deleteAll(pc, input, flags);
}

if (input[0] === 'new-key') {
	paraCLI.newKeys(pc, config);
}

if (input[0] === 'new-jwt') {
	paraCLI.newJWT(config);
}

if (input[0] === 'ping') {
	paraCLI.ping(pc, config);
}

